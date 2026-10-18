import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap, ScrollTrigger } from './gsap.js';

/**
 * A thin scroll-progress bar. Driven by a single trigger-less ScrollTrigger that
 * maps overall page scroll progress onto `scaleX` via a `quickSetter` — transform
 * only, no layout, no per-frame React state. Safe under reduced motion (it simply
 * reflects scroll position; it is not decorative motion). Place it fixed at the
 * top of the viewport (landing) or inside the sticky nav (app chrome).
 */
export default function ScrollProgress({ className = '' }) {
  const ref = useRef(null);
  useGSAP(
    () => {
      if (!ref.current) return;
      const setX = gsap.quickSetter(ref.current, 'scaleX');
      setX(0);
      const st = ScrollTrigger.create({
        start: 0,
        end: 'max',
        onUpdate: (self) => setX(self.progress),
      });
      return () => st.kill();
    },
    { scope: ref }
  );
  return (
    <div
      ref={ref}
      aria-hidden
      className={`origin-left scale-x-0 bg-gradient-to-r from-sky-400 to-indigo-400 ${className}`}
    />
  );
}
