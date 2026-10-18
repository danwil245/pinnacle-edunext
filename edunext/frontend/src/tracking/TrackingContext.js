import { createContext, useContext } from 'react';

/**
 * Tracking context shape:
 *   status: 'idle'|'loading'|'ready'|'denied'|'error'
 *   faceDetected: boolean
 *   source: 'camera'|'mock'
 *   start(opts?), stop()
 *   subscribe(cb) -> unsubscribe   (cb receives {type:'blink'|'presence'|'emotion', ...})
 *   getNow() -> ms (real clock for camera, virtual clock for mock)
 *   liveRef, errorMessage, emotionAvailable, timeScale, setTimeScale, setSource
 */
export const TrackingContext = createContext(null);

export function useTracking() {
  const ctx = useContext(TrackingContext);
  if (!ctx) throw new Error('useTracking must be used within <TrackingProvider>');
  return ctx;
}
