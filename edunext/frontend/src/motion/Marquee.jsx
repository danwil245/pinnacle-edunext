import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from './gsap.js';
import { useReducedMotion } from './useReducedMotion.js';

/**
 * A continuous marquee that moves on `transform` only (no left/margin animation)
 * and pauses on hover. The children are duplicated once so the loop is seamless;
 * the tween uses a modifier to wrap x, so it never accumulates. Under reduced
 * motion the strip renders static (no animation), still fully readable.
 */
export default function Marquee({ items, className = '', speed = 40 }) {
  const trackRef = useRef(null);
  const tweenRef = useRef(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      if (reduced || !trackRef.current) return;
      const track = trackRef.current;
      const half = track.scrollWidth / 2; // one copy's width
      const wrap = gsap.utils.wrap(-half, 0);
      tweenRef.current = gsap.to(track, {
        x: `-=${half}`,
        duration: half / speed,
        ease: 'none',
        repeat: -1,
        modifiers: { x: (x) => `${wrap(parseFloat(x))}px` },
      });
      return () => tweenRef.current?.kill();
    },
    { dependencies: [reduced], scope: trackRef }
  );

  const pause = () => tweenRef.current?.pause();
  const resume = () => tweenRef.current?.resume();
  const list = [...items, ...items];

  return (
    <div className={`relative overflow-hidden ${className}`} aria-label="Research this draws on">
      <div
        ref={trackRef}
        className="flex w-max gap-8 will-change-transform"
        onMouseEnter={pause}
        onMouseLeave={resume}
      >
        {list.map((item, i) => (
          <span key={i} aria-hidden={i >= items.length} className="whitespace-nowrap text-sm text-slate-400">
            <span className="text-sky-400">◦</span> {item}
          </span>
        ))}
      </div>
    </div>
  );
}
