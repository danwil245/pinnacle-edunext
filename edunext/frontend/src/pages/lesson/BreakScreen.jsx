import { useEffect, useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from '../../motion/gsap.js';
import { MOTION } from '../../motion/motionConfig.js';
import { useLenis } from '../../motion/SmoothScrollProvider.jsx';

/**
 * Calm, full-screen break screen shown while the lesson is paused for a break.
 * Full-viewport (covers the lesson + HUD), a large countdown, a gentle breathing
 * suggestion, and an always-available "I'm back" button that resumes exactly where
 * the learner left off (the controller re-enters a warm-up so the first seconds
 * aren't mis-scored). Accessible: role="dialog", aria-modal, labelled, focus on
 * the resume button, aria-live announces when the break time is up. Scroll locked
 * via Lenis. Animation is transform/opacity only and respects reduced motion.
 */
export default function BreakScreen({ secondsLeft, totalS, onResume, motionOff }) {
  const rootRef = useRef(null);
  const resumeRef = useRef(null);
  const lenisRef = useLenis();
  const done = secondsLeft <= 0;
  const m = Math.floor(Math.max(0, secondsLeft) / 60);
  const sec = String(Math.max(0, secondsLeft) % 60).padStart(2, '0');

  useEffect(() => {
    const lenis = lenisRef?.current;
    lenis?.stop();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    resumeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onResume();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      lenis?.start();
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [lenisRef, onResume]);

  useGSAP(
    () => {
      if (motionOff || !rootRef.current) return;
      gsap.from(rootRef.current, { autoAlpha: 0, duration: MOTION.dur.base, ease: MOTION.ease.out });
      // Gentle breathing pulse on the ring (slow, transform only).
      const ring = rootRef.current.querySelector('[data-breathe]');
      if (ring) gsap.to(ring, { scale: 1.08, duration: 4, ease: 'sine.inOut', repeat: -1, yoyo: true });
    },
    { scope: rootRef }
  );

  const pct = totalS ? Math.max(0, Math.min(1, secondsLeft / totalS)) : 0;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="break-screen-title"
      className="fixed inset-0 z-[85] flex flex-col items-center justify-center gap-6 bg-slate-950/90 px-6 text-center"
    >
      <div className="relative grid place-items-center" data-breathe>
        <svg viewBox="0 0 120 120" className="h-40 w-40 -rotate-90" aria-hidden>
          <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
          <circle
            cx="60" cy="60" r="52" fill="none" stroke="#38bdf8" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 52} strokeDashoffset={2 * Math.PI * 52 * (1 - pct)}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <span className="absolute font-mono text-3xl tabular-nums">{m}:{sec}</span>
      </div>

      <div>
        <h2 id="break-screen-title" className="font-display text-2xl font-bold">
          {done ? 'Break’s done whenever you’re ready' : 'Take a breather'}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-slate-300">
          Look away from the screen, roll your shoulders, and breathe slowly — in for four, out for four.
        </p>
        <p className="sr-only" aria-live="polite">
          {done ? 'Your break time is up. Resume whenever you are ready.' : `Break time remaining ${m} minutes ${sec} seconds.`}
        </p>
      </div>

      <button ref={resumeRef} className="btn-primary px-8" onClick={onResume}>
        I’m back
      </button>
    </div>
  );
}
