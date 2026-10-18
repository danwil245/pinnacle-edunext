import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TrackingContext } from './TrackingContext.js';
import { CameraRunner } from './CameraRunner.jsx';
import { FaceApiEmotionProvider, MockEmotionProvider } from './emotionProvider.js';
import { MockSignalSource } from './mockSource.js';
import { DEFAULT_SCENARIO } from './scenarios.js';

const DEFAULT_SOURCE = import.meta.env.VITE_MOCK_SIGNALS === '1' ? 'mock' : 'camera';

/**
 * The single persistent tracker. Mounted ONCE at the app root, above the
 * router, so the camera stream + FaceMesh are never torn down on navigation.
 * Owns the sample stream, the clock (real for camera, virtual for mock), the
 * emotion provider, and the mock source.
 */
export function TrackingProvider({ children }) {
  const [source, setSourceState] = useState(DEFAULT_SOURCE);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState('idle');
  const [faceDetected, setFaceDetected] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [emotionAvailable, setEmotionAvailable] = useState(false);
  const [timeScale, setTimeScaleState] = useState(1);
  const [overlaySize, setOverlaySize] = useState('sm');

  const subscribersRef = useRef(new Set());
  const virtualRef = useRef({ t: Date.now() });
  const liveRef = useRef(null);
  const emotionProviderRef = useRef(null);
  const mockSourceRef = useRef(new MockSignalSource(DEFAULT_SCENARIO));

  const sourceRef = useRef(source);
  const startedRef = useRef(started);
  const timeScaleRef = useRef(timeScale);
  sourceRef.current = source;
  startedRef.current = started;
  timeScaleRef.current = timeScale;

  const emit = useCallback((sample) => {
    for (const cb of subscribersRef.current) cb(sample);
  }, []);
  const subscribe = useCallback((cb) => {
    subscribersRef.current.add(cb);
    return () => subscribersRef.current.delete(cb);
  }, []);
  const getNow = useCallback(() => (sourceRef.current === 'mock' ? virtualRef.current.t : Date.now()), []);

  const stop = useCallback(() => {
    setStarted(false);
    setStatus('idle');
    setFaceDetected(false);
    emotionProviderRef.current?.dispose?.();
    emotionProviderRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (sourceRef.current === 'mock') {
      virtualRef.current = { t: Date.now() };
      mockSourceRef.current.reset(virtualRef.current.t);
      emotionProviderRef.current = new MockEmotionProvider();
      setEmotionAvailable(true);
      setStatus('ready');
      setFaceDetected(true);
      setStarted(true);
      return;
    }
    // Camera: create the emotion provider now (infer() no-ops until ready),
    // CameraRunner mounts and starts the stream.
    const provider = new FaceApiEmotionProvider();
    emotionProviderRef.current = provider;
    setEmotionAvailable(false);
    setStatus('loading');
    setStarted(true);
    provider
      .init()
      .then(() => setEmotionAvailable(true))
      .catch(() => {
        // Degrade gracefully: blink + feedback only.
        setEmotionAvailable(false);
      });
  }, []);

  const setSource = useCallback(
    (next) => {
      if (startedRef.current) stop();
      sourceRef.current = next; // sync so a start() right after reads the new source
      setSourceState(next);
    },
    [stop]
  );
  const setTimeScale = useCallback((n) => setTimeScaleState(n), []);

  // Mock driver: advance the virtual clock and pump scripted samples.
  useEffect(() => {
    if (!started || source !== 'mock') return undefined;
    const id = setInterval(() => {
      virtualRef.current.t += 100 * timeScaleRef.current;
      mockSourceRef.current.pump(virtualRef.current.t, emit);
    }, 100);
    return () => clearInterval(id);
  }, [started, source, emit]);

  const onStatus = useCallback((mapped, message, live) => {
    setStatus(mapped);
    setErrorMessage(message || '');
    if (live) liveRef.current = live.current;
  }, []);
  const onFace = useCallback((f) => setFaceDetected(f), []);

  const value = useMemo(
    () => ({
      status,
      faceDetected,
      source,
      started,
      errorMessage,
      emotionAvailable,
      timeScale,
      overlaySize,
      liveRef,
      start,
      stop,
      subscribe,
      emit,
      getNow,
      setSource,
      setTimeScale,
      setOverlaySize,
    }),
    [
      status, faceDetected, source, started, errorMessage, emotionAvailable, timeScale,
      overlaySize, start, stop, subscribe, emit, getNow, setSource, setTimeScale,
    ]
  );

  const showOverlay = started && overlaySize !== 'hidden';
  const sizeClass = overlaySize === 'lg' ? 'h-48 w-64' : 'h-28 w-40';

  return (
    <TrackingContext.Provider value={value}>
      {children}
      {showOverlay && (
        <div className={`fixed bottom-4 right-4 z-50 ${sizeClass}`}>
          <div className="glass-strong relative h-full w-full overflow-hidden rounded-xl">
            {source === 'camera' ? (
              <CameraRunner
                emit={emit}
                emotionProvider={emotionProviderRef.current}
                getNow={getNow}
                onStatus={onStatus}
                onFace={onFace}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-center text-xs text-slate-300">
                <span>Mock signals<br />({timeScale}×)</span>
              </div>
            )}
            <span className="absolute bottom-1 left-1 right-1 rounded bg-black/60 px-1 py-0.5 text-center text-[9px] leading-tight text-emerald-300">
              Video stays on your device
            </span>
          </div>
        </div>
      )}
    </TrackingContext.Provider>
  );
}
