import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { MOTION } from './motionConfig.js';

/**
 * Main-thread performance guard. MediaPipe + the emotion model + animations all
 * share one thread; if animation starves the tracker the blink measurement is
 * corrupted. We sample requestAnimationFrame frame times continuously and, when
 * the main thread stays slow for a sustained stretch, flip `degraded` so the UI
 * can pause Vanta / stop non-essential timelines. It auto-recovers after a cool-off
 * unless the user disabled motion manually.
 *
 * The sampler is a passive *monitor*: it reads `performance.now()` and does a little
 * arithmetic per frame — it never animates or paints. The live FPS readout is kept
 * in a small external store (below) rather than React context, so the once-a-second
 * sample does NOT re-render the app; only `degraded` (which changes rarely) flows
 * through context. This removes the per-second whole-tree re-render that the P0
 * profile flagged.
 */

// --- external FPS store (subscribed only by the /dev console) ----------------
const fpsListeners = new Set();
let fpsSnapshot = 60;
function setFpsStore(v) {
  if (v !== fpsSnapshot) {
    fpsSnapshot = v;
    for (const l of fpsListeners) l();
  }
}
function subscribeFps(cb) {
  fpsListeners.add(cb);
  return () => fpsListeners.delete(cb);
}
/** Live frames-per-second readout. Lives outside context so reading it is free. */
export function usePerfFps() {
  return useSyncExternalStore(subscribeFps, () => fpsSnapshot, () => 60);
}

const BudgetContext = createContext(null);

export function MotionBudgetProvider({ children }) {
  const [degraded, setDegraded] = useState(false);
  const manualOffRef = useRef(false); // user hid the notice / re-enabled

  const degradedRef = useRef(false);
  degradedRef.current = degraded;

  useEffect(() => {
    let raf;
    let last = performance.now();
    let slowRun = 0;
    let frames = 0;
    let acc = 0;
    let recoverAt = 0;

    const loop = (now) => {
      const dt = now - last;
      last = now;
      frames += 1;
      acc += dt;

      if (dt > MOTION.budget.frameBudgetMs) slowRun += 1;
      else slowRun = Math.max(0, slowRun - 2); // forgive isolated hitches

      if (frames >= MOTION.budget.sampleWindow) {
        setFpsStore(Math.round(1000 / (acc / frames)));
        frames = 0;
        acc = 0;
      }

      if (!degradedRef.current && slowRun >= MOTION.budget.slowFramesToTrip && !manualOffRef.current) {
        setDegraded(true);
        recoverAt = now + MOTION.budget.recoverAfterMs;
      } else if (degradedRef.current && !manualOffRef.current && now >= recoverAt && slowRun === 0) {
        setDegraded(false);
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const reEnable = useCallback(() => {
    manualOffRef.current = false;
    setDegraded(false);
  }, []);
  const forceDegrade = useCallback((on) => {
    manualOffRef.current = on;
    setDegraded(on);
  }, []);

  // Context value only changes when `degraded` toggles — not every frame.
  const value = useMemo(() => ({ degraded, reEnable, forceDegrade }), [degraded, reEnable, forceDegrade]);
  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>;
}

export function useMotionBudget() {
  return (
    useContext(BudgetContext) || {
      degraded: false,
      reEnable: () => {},
      forceDegrade: () => {},
    }
  );
}

export default useMotionBudget;
