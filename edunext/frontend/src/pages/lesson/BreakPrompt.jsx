import { useEffect, useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from '../../motion/gsap.js';
import { MOTION } from '../../motion/motionConfig.js';
import { useLenis } from '../../motion/SmoothScrollProvider.jsx';

/**
 * The "take a short break?" modal for the suggest_break curation action. Calm,
 * non-blaming copy with an honest note, the suggested length, and three actions:
 * Take a break / Keep going / Remind me later.
 *
 * Accessibility: role="dialog" + aria-modal, labelled title + description, focus
 * moves to the primary action on open and returns to the previously focused
 * element on close, Tab is trapped, Escape = "Keep going" (least destructive;
 * logged in ASSUMPTIONS). Page scroll is locked via Lenis while open. Entrance is
 * transform/opacity only and respects reduced motion. Centered modal on desktop,
 * bottom sheet on phones.
 */
export default function BreakPrompt({ breakMinutes = 5, reason, onTakeBreak, onKeepGoing, onRemindLater, motionOff }) {
  const panelRef = useRef(null);
  const backdropRef = useRef(null);
  const primaryRef = useRef(null);
  const lenisRef = useLenis();

  // Lock scroll via Lenis (fallback to body overflow) while open.
  useEffect(() => {
    const lenis = lenisRef?.current;
    lenis?.stop();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      lenis?.start();
      document.body.style.overflow = prevOverflow;
    };
  }, [lenisRef]);

  // Focus management: remember opener, focus the primary action, restore on close.
  useEffect(() => {
    const opener = document.activeElement;
    primaryRef.current?.focus();
    return () => {
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, []);

  // Trap Tab; Escape = Keep going.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onKeepGoing();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const f = panelRef.current.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKeepGoing]);

  useGSAP(
    () => {
      if (motionOff || !panelRef.current) return;
      gsap.from(backdropRef.current, { autoAlpha: 0, duration: MOTION.dur.fast });
      gsap.from(panelRef.current, { autoAlpha: 0, y: 24, scale: 0.98, duration: MOTION.dur.base, ease: MOTION.ease.out });
    },
    { scope: panelRef }
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="presentation">
      <div ref={backdropRef} className="absolute inset-0 bg-slate-950/70" onClick={onKeepGoing} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="break-title"
        aria-describedby="break-desc"
        className="glass-strong relative z-10 m-0 w-full max-w-md rounded-b-none rounded-t-2xl p-6 sm:m-4 sm:rounded-2xl"
      >
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/15 text-2xl" aria-hidden>
          🌿
        </div>
        <h2 id="break-title" className="text-center font-display text-xl font-bold">
          Want a short break?
        </h2>
        <p id="break-desc" className="mt-2 text-center text-slate-300">
          You've seemed tired for a little while. A {breakMinutes}-minute breather can help you
          come back sharper.
        </p>
        <p className="mt-2 text-center text-xs text-slate-500">
          This is an estimate from your blink rate and expression — not a judgement. Your call.
          {reason ? ` (${reason})` : ''}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button ref={primaryRef} className="btn-primary w-full" onClick={onTakeBreak}>
            Take a {breakMinutes}-min break
          </button>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={onKeepGoing}>
              Keep going
            </button>
            <button className="btn-ghost flex-1" onClick={onRemindLater}>
              Remind me later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
