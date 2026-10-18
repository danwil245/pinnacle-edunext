import { useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from './gsap.js';
import { MOTION } from './motionConfig.js';
import { useReducedMotion } from './useReducedMotion.js';

const SEEN_KEY = 'edunext_intro_seen';

function alreadySeen() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * A tasteful page-load intro: the logo rises in while a progress bar sweeps, then
 * the whole overlay fades out — total ≤ 1.2 s. Shown once per browser session
 * (sessionStorage) and skipped entirely under reduced motion, so it never gets in
 * the way on repeat navigation or for motion-sensitive users. Rendered once at the
 * app root; it unmounts itself when finished and never blocks input beyond its run.
 */
export default function Intro() {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const [done, setDone] = useState(() => reduced || alreadySeen());

  useGSAP(
    () => {
      if (done || !ref.current) return;
      const finish = () => {
        try {
          sessionStorage.setItem(SEEN_KEY, '1');
        } catch {
          /* ignore */
        }
        setDone(true);
      };
      const tl = gsap.timeline({ onComplete: finish });
      tl.from('[data-intro-logo]', { autoAlpha: 0, y: 14, duration: MOTION.dur.base, ease: MOTION.ease.out })
        .fromTo('[data-intro-bar]', { scaleX: 0 }, { scaleX: 1, duration: 0.55, ease: MOTION.ease.inOut }, '-=0.15')
        .to(ref.current, { autoAlpha: 0, duration: MOTION.dur.fast }, '+=0.08');
    },
    { scope: ref, dependencies: [] }
  );

  if (done) return null;
  return (
    <div
      ref={ref}
      role="presentation"
      className="fixed inset-0 z-[100] grid place-items-center bg-slate-950"
    >
      <div className="flex flex-col items-center gap-5">
        <div data-intro-logo className="font-display text-4xl font-bold tracking-tight">
          Edu<span className="text-sky-400">Next</span>
        </div>
        <div className="h-0.5 w-40 overflow-hidden rounded-full bg-white/10">
          <div data-intro-bar className="h-full origin-left scale-x-0 bg-gradient-to-r from-sky-400 to-indigo-400" />
        </div>
      </div>
    </div>
  );
}
