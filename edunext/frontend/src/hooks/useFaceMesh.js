import { useEffect, useRef, useState } from 'react';
import * as mpFaceMesh from '@mediapipe/face_mesh';
import * as mpCamera from '@mediapipe/camera_utils';

// MediaPipe ships as a UMD bundle; under Vite the named ESM import can resolve to
// a non-constructor ("FaceMesh is not a constructor"). Resolve the real class
// from the namespace / default / global, whichever the bundler exposes.
function resolveCtor(mod, name) {
  return mod?.[name] || mod?.default?.[name] || (typeof window !== 'undefined' ? window[name] : undefined);
}

// MediaPipe FaceMesh landmark indices, ordered as [p1, p2, p3, p4, p5, p6]
// so the EAR formula maps directly:
//   EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

const EAR_THRESHOLD = 0.21; // blink when smoothed EAR drops below this
const SMOOTH_WINDOW = 3; // average last N EAR samples to fight noise
const NO_FACE_TIMEOUT = 3000; // ms without a face before we warn + pause
const MIN_BLINK_MS = 40; // ignore sub-frame flickers as false blinks

// MediaPipe ships wasm/data assets separately; self-hosted under /mediapipe
// (copied from node_modules by scripts/copy-face-models.mjs — no CDN, works
// offline, and satisfies the no-remote-assets rule).
const MP_BASE = '/mediapipe';

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// EAR for a single eye. Landmarks are normalized [0..1]; multiply by the frame
// dimensions so horizontal/vertical distances share the same pixel scale.
function eyeEAR(landmarks, idx, w, h) {
  const p = idx.map((i) => ({ x: landmarks[i].x * w, y: landmarks[i].y * h }));
  const vertical = dist(p[1], p[5]) + dist(p[2], p[4]);
  const horizontal = dist(p[0], p[3]);
  if (horizontal === 0) return 0;
  return vertical / (2 * horizontal);
}

/**
 * useFaceMesh wires up the webcam + MediaPipe FaceMesh, computes a smoothed EAR
 * every frame, draws eye landmarks on the canvas, and runs the blink state
 * machine. Per-frame work lives in refs to avoid re-render lag; only coarse
 * lifecycle changes (ready / error / face presence) hit React state.
 *
 * @param {object} opts
 * @param {React.RefObject<HTMLVideoElement>} opts.videoRef
 * @param {React.RefObject<HTMLCanvasElement>} opts.canvasRef
 * @param {(blink: {t:number, duration:number}) => void} opts.onBlink
 */
export function useFaceMesh({ videoRef, canvasRef, onBlink }) {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [errorMessage, setErrorMessage] = useState('');
  const [faceDetected, setFaceDetected] = useState(false);

  // Live, per-frame values read imperatively by CameraFeed (no re-render).
  const liveRef = useRef({ ear: 0, inBlink: false, lastBlinkAt: 0 });

  // Blink detection internals.
  const earHistoryRef = useRef([]); // last SMOOTH_WINDOW raw EAR values
  const blinkStateRef = useRef({ closed: false, startedAt: 0 });
  const lastFaceTimeRef = useRef(0);
  // Mirror coarse state in refs so the per-frame callback can avoid redundant
  // setState calls (its closure would otherwise see stale render values).
  const readyRef = useRef(false);
  const faceRef = useRef(false);

  // Keep the latest onBlink without re-initializing the whole pipeline.
  const onBlinkRef = useRef(onBlink);
  useEffect(() => {
    onBlinkRef.current = onBlink;
  }, [onBlink]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let camera = null;
    let cancelled = false;
    const ctx = canvas.getContext('2d');

    const FaceMesh = resolveCtor(mpFaceMesh, 'FaceMesh');
    const Camera = resolveCtor(mpCamera, 'Camera');
    if (typeof FaceMesh !== 'function' || typeof Camera !== 'function') {
      // Library didn't load as a constructor on this setup — degrade gracefully
      // instead of crashing the whole app. Mock signals + feedback-only still work.
      setErrorMessage('On-device face tracking could not initialise here. Continue with mock signals or without a camera.');
      setStatus('error');
      return undefined;
    }

    let faceMesh;
    try {
      faceMesh = new FaceMesh({
        locateFile: (file) => `${MP_BASE}/${file}`,
      });
      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    } catch (err) {
      setErrorMessage(`On-device face tracking could not start: ${err?.message || err}. Try mock signals or continue without a camera.`);
      setStatus('error');
      return undefined;
    }

    faceMesh.onResults((results) => {
      if (cancelled) return;
      if (!readyRef.current) {
        readyRef.current = true;
        setStatus('ready');
      }

      const w = results.image?.width || video.videoWidth || 640;
      const h = results.image?.height || video.videoHeight || 480;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.clearRect(0, 0, w, h);

      const faces = results.multiFaceLandmarks;
      if (!faces || faces.length === 0) {
        // No face this frame. faceDetected flips off via the watchdog interval.
        return;
      }

      lastFaceTimeRef.current = performance.now();
      if (!faceRef.current) {
        faceRef.current = true;
        setFaceDetected(true);
      }

      const lm = faces[0];
      const rawEAR =
        (eyeEAR(lm, LEFT_EYE, w, h) + eyeEAR(lm, RIGHT_EYE, w, h)) / 2;

      // Smooth over the last few frames before thresholding.
      const hist = earHistoryRef.current;
      hist.push(rawEAR);
      if (hist.length > SMOOTH_WINDOW) hist.shift();
      const smoothEAR = hist.reduce((a, b) => a + b, 0) / hist.length;
      liveRef.current.ear = smoothEAR;

      // Blink state machine: falling edge opens a blink, rising edge closes it.
      const state = blinkStateRef.current;
      const now = performance.now();
      if (smoothEAR < EAR_THRESHOLD) {
        if (!state.closed) {
          state.closed = true;
          state.startedAt = now;
        }
        liveRef.current.inBlink = true;
      } else if (state.closed) {
        state.closed = false;
        liveRef.current.inBlink = false;
        const duration = now - state.startedAt;
        if (duration >= MIN_BLINK_MS) {
          liveRef.current.lastBlinkAt = Date.now();
          onBlinkRef.current?.({ t: Date.now(), duration });
        }
      }

      // Draw eye landmark dots.
      ctx.fillStyle = liveRef.current.inBlink ? '#f87171' : '#34d399';
      for (const idx of [LEFT_EYE, RIGHT_EYE]) {
        for (const i of idx) {
          ctx.beginPath();
          ctx.arc(lm[i].x * w, lm[i].y * h, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });

    try {
      camera = new Camera(video, {
        onFrame: async () => {
          if (!cancelled) await faceMesh.send({ image: video });
        },
        width: 640,
        height: 480,
      });
    } catch (err) {
      setErrorMessage(`On-device face tracking could not start: ${err?.message || err}. Try mock signals or continue without a camera.`);
      setStatus('error');
      return undefined;
    }

    camera
      .start()
      .catch((err) => {
        if (cancelled) return;
        const denied =
          err?.name === 'NotAllowedError' ||
          err?.name === 'PermissionDeniedError';
        setErrorMessage(
          denied
            ? 'Camera access was denied. Enable camera permissions for this site and reload.'
            : `Could not start the camera: ${err?.message || err}`
        );
        setStatus('error');
      });

    // Watchdog: flip faceDetected off after NO_FACE_TIMEOUT of no landmarks.
    const watchdog = setInterval(() => {
      if (cancelled) return;
      const since = performance.now() - lastFaceTimeRef.current;
      if (since > NO_FACE_TIMEOUT && faceRef.current) {
        faceRef.current = false;
        setFaceDetected(false);
        liveRef.current.inBlink = false;
      }
    }, 500);

    return () => {
      cancelled = true;
      clearInterval(watchdog);
      camera?.stop?.();
      faceMesh.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, errorMessage, faceDetected, liveRef };
}
