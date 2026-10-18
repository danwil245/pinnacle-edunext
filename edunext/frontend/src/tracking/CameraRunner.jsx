import { useEffect, useRef } from 'react';
import { useFaceMesh } from '../hooks/useFaceMesh.js';
import { CONFIG } from '@edunext/shared';

/**
 * Owns the real camera pipeline. Mounted by TrackingProvider ONLY while the
 * camera source is started — and the provider sits above the router, so this
 * never remounts on navigation (which would silently kill the stream).
 *
 * Reuses the untouched `useFaceMesh` (EAR + blink state machine) and adds the
 * 1 Hz presence + emotion sampling the tracking layer needs.
 */
export function CameraRunner({ emit, emotionProvider, getNow, onStatus, onFace }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const emitRef = useRef(emit);
  const nowRef = useRef(getNow);
  emitRef.current = emit;
  nowRef.current = getNow;

  const { status, errorMessage, faceDetected, liveRef } = useFaceMesh({
    videoRef,
    canvasRef,
    onBlink: (b) => emitRef.current({ type: 'blink', t: nowRef.current(), duration: b.duration }),
  });

  // Report lifecycle up to the provider.
  useEffect(() => {
    const mapped = status === 'error' && /denied/i.test(errorMessage) ? 'denied' : status;
    onStatus(mapped, errorMessage, liveRef);
  }, [status, errorMessage, onStatus, liveRef]);
  useEffect(() => {
    onFace(faceDetected);
  }, [faceDetected, onFace]);

  // 1 Hz presence (only while a face is visible).
  useEffect(() => {
    const id = setInterval(() => {
      if (faceDetected) emitRef.current({ type: 'presence', t: nowRef.current() });
    }, 1000);
    return () => clearInterval(id);
  }, [faceDetected]);

  // ~1 Hz emotion inference on the shared video element; skips when busy.
  useEffect(() => {
    let cancelled = false;
    const id = setInterval(async () => {
      const probs = await emotionProvider.infer(videoRef.current);
      if (!cancelled && probs) emitRef.current({ type: 'emotion', t: nowRef.current(), probs });
    }, CONFIG.EMOTION_SAMPLE_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [emotionProvider]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-black/40">
      <video ref={videoRef} className="h-full w-full -scale-x-100 object-cover" muted playsInline />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100" />
    </div>
  );
}
