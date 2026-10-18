import { useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import { gsap } from './gsap.js';
import { MOTION } from './motionConfig.js';
import { useReducedMotion } from './useReducedMotion.js';

/**
 * Desktop custom cursor: a small dot that tracks the pointer tightly plus a ring
 * that eases behind it (gsap.quickTo). The ring grows over interactive elements.
 * Entirely pointer-events-none so it never blocks a click. Disabled on touch
 * devices, under reduced motion, and on the lesson route (Section 4). Hidden until
 * the first real mouse move so it never sits in a corner.
 */
export default function CursorFollower() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const reduced = useReducedMotion();
  const { pathname } = useLocation();

  const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  const disabled = reduced || !canHover || pathname.startsWith('/learn');

  useGSAP(
    () => {
      if (disabled || !dotRef.current || !ringRef.current) return;
      const dot = dotRef.current;
      const ring = ringRef.current;
      // Center on the pointer via xPercent/yPercent so GSAP's x/y (translate) can
      // drive position without fighting a Tailwind -translate class.
      gsap.set([dot, ring], { xPercent: -50, yPercent: -50 });
      const dotX = gsap.quickTo(dot, 'x', { duration: 0.08, ease: MOTION.ease.out });
      const dotY = gsap.quickTo(dot, 'y', { duration: 0.08, ease: MOTION.ease.out });
      const ringX = gsap.quickTo(ring, 'x', { duration: 0.28, ease: MOTION.ease.out });
      const ringY = gsap.quickTo(ring, 'y', { duration: 0.28, ease: MOTION.ease.out });
      let shown = false;

      const onMove = (e) => {
        if (!shown) {
          gsap.to([dot, ring], { autoAlpha: 1, duration: MOTION.dur.fast });
          shown = true;
        }
        dotX(e.clientX);
        dotY(e.clientY);
        ringX(e.clientX);
        ringY(e.clientY);
      };
      const interactive = (t) => t.closest?.('a, button, [role="button"], input, select, textarea, label, summary');
      const onOver = (e) => {
        if (interactive(e.target)) gsap.to(ring, { scale: 1.8, duration: MOTION.dur.fast, ease: MOTION.ease.out });
      };
      const onOut = (e) => {
        if (interactive(e.target)) gsap.to(ring, { scale: 1, duration: MOTION.dur.fast, ease: MOTION.ease.out });
      };
      const onLeave = () => gsap.to([dot, ring], { autoAlpha: 0, duration: MOTION.dur.fast });

      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerover', onOver, { passive: true });
      window.addEventListener('pointerout', onOut, { passive: true });
      document.addEventListener('mouseleave', onLeave);
      return () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerover', onOver);
        window.removeEventListener('pointerout', onOut);
        document.removeEventListener('mouseleave', onLeave);
      };
    },
    { dependencies: [disabled] }
  );

  if (disabled) return null;
  return (
    <>
      <div
        ref={ringRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[90] h-8 w-8 rounded-full border border-sky-300/60 opacity-0 mix-blend-screen"
      />
      <div
        ref={dotRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[90] h-1.5 w-1.5 rounded-full bg-sky-300 opacity-0"
      />
    </>
  );
}
