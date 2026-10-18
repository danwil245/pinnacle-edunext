import { createContext, useContext, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Lenis from 'lenis';
import { gsap, ScrollTrigger } from './gsap.js';
import { MOTION } from './motionConfig.js';
import { useReducedMotion } from './useReducedMotion.js';

const LenisContext = createContext(null);

/** Access the live Lenis instance (or null under reduced motion / native scroll). */
export function useLenis() {
  return useContext(LenisContext);
}

/**
 * One Lenis instance for the whole app, driven by `gsap.ticker` and kept in sync
 * with ScrollTrigger (the standard integration, verified against the Lenis docs).
 * Mounted once under the router so route changes never recreate it. Under reduced
 * motion we skip Lenis entirely and use native scrolling.
 */
export function SmoothScrollProvider({ children }) {
  const reduced = useReducedMotion();
  const lenisRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    if (reduced) {
      lenisRef.current = null;
      return undefined;
    }

    const lenis = new Lenis({
      duration: MOTION.lenis.duration,
      easing: MOTION.lenis.easing,
      wheelMultiplier: MOTION.lenis.wheelMultiplier,
      touchMultiplier: MOTION.lenis.touchMultiplier,
      smoothWheel: true,
      // Lenis touch smoothing stays off by default (per the docs) — native touch.
    });
    lenisRef.current = lenis;

    const onScroll = () => ScrollTrigger.update();
    lenis.on('scroll', onScroll);

    const tick = (time) => lenis.raf(time * 1000); // gsap.ticker time is seconds
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.off('scroll', onScroll);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [reduced]);

  // On route change: jump to top (respecting the scroll mode) then refresh triggers
  // once the new page has laid out.
  useEffect(() => {
    const lenis = lenisRef.current;
    if (lenis) lenis.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
    const id = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(id);
  }, [location.pathname]);

  return <LenisContext.Provider value={lenisRef}>{children}</LenisContext.Provider>;
}

export default SmoothScrollProvider;
