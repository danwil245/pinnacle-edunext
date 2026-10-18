import { useEffect, useRef, useState } from 'react';
import { MOTION } from './motionConfig.js';
import { useReducedMotion } from './useReducedMotion.js';
import { useMotionBudget } from './useMotionBudget.jsx';

/** WebGL availability probe (cheap, cached). */
let webglOk = null;
function hasWebGL() {
  if (webglOk != null) return webglOk;
  try {
    const c = document.createElement('canvas');
    webglOk = !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch {
    webglOk = false;
  }
  return webglOk;
}

function lowPower() {
  return typeof navigator !== 'undefined' && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;
}

// Vanta renders at `devicePixelRatio / scale`. Capping the effective ratio at 1.5
// means a HiDPI (DPR 2–3) laptop renders the soft wave background at ~1.5× instead
// of 2–3×, a 2–4× fill-rate saving that is invisible on a blurry background.
function vantaScale() {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return dpr / Math.min(dpr, 1.5);
}

// Truly pause/resume Vanta's render loop (not just freeze the waves): cancelling
// its self-rescheduling rAF stops all GPU work; calling the bound animationLoop
// again resumes it. Verified against vanta@0.5.24's dist build.
function setVantaRunning(fx, run) {
  if (!fx) return;
  if (run) {
    if (fx.req == null && typeof fx.animationLoop === 'function') fx.animationLoop();
  } else if (fx.req != null) {
    try { window.cancelAnimationFrame(fx.req); } catch { /* ignore */ }
    fx.req = null;
  }
}

/**
 * Animated WebGL background (Vanta WAVES), lazy-loaded with three so neither is in
 * the main bundle. Destroys the effect on unmount, pauses when the tab is hidden,
 * and falls back to a static CSS gradient when motion is reduced, WebGL is
 * unavailable, the device is low-power, or the performance guard has degraded.
 */
export default function VantaBackground({ className = '' }) {
  const ref = useRef(null);
  const effectRef = useRef(null);
  const reduced = useReducedMotion();
  const { degraded } = useMotionBudget();
  const [failed, setFailed] = useState(false);

  const disabled = reduced || degraded || failed || lowPower() || !hasWebGL();

  useEffect(() => {
    if (disabled || !ref.current) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const THREE = await import('three');
        const mod = await import('vanta/dist/vanta.waves.min');
        const WAVES = mod.default || mod;
        if (cancelled || !ref.current) return;
        const scale = vantaScale();
        effectRef.current = WAVES({
          el: ref.current,
          THREE,
          mouseControls: true,
          touchControls: false,
          gyroControls: false,
          minHeight: 200,
          minWidth: 200,
          scale,
          scaleMobile: scale,
          color: MOTION.vanta.color,
          shininess: MOTION.vanta.shininess,
          waveHeight: MOTION.vanta.waveHeight,
          waveSpeed: MOTION.vanta.waveSpeed,
          zoom: MOTION.vanta.zoom,
          backgroundColor: MOTION.vanta.backgroundColor,
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      try {
        effectRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      effectRef.current = null;
    };
  }, [disabled]);

  // Run the GPU loop ONLY while the hero is actually on screen and the tab is
  // visible. Scrolling past the hero or hiding the tab stops all WebGL work
  // (full render-loop pause, not just frozen waves), then resumes seamlessly.
  useEffect(() => {
    if (disabled || !ref.current) return undefined;
    const el = ref.current;
    let onScreen = true;
    const apply = () => setVantaRunning(effectRef.current, onScreen && !document.hidden);

    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            ([entry]) => {
              onScreen = entry.isIntersecting;
              apply();
            },
            { threshold: 0.01 }
          )
        : null;
    io?.observe(el);

    const onVis = () => apply();
    document.addEventListener('visibilitychange', onVis);
    // Re-apply shortly after mount so we catch the effect once it has initialised.
    const settle = setTimeout(apply, 300);

    return () => {
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      clearTimeout(settle);
    };
  }, [disabled]);

  // Static fallback gradient — same palette, no WebGL. Also the baseline layer the
  // live canvas mounts on top of, so there's never a flash of nothing.
  return (
    <div
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}
      style={{
        background:
          'radial-gradient(1200px 600px at 15% -10%, rgba(14,165,233,0.18), transparent 60%),' +
          'radial-gradient(1000px 520px at 110% 10%, rgba(37,99,235,0.14), transparent 55%),' +
          '#070b16',
      }}
    />
  );
}
