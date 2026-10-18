import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import { computeEngagement, evaluateCuration, createCurationState } from '@edunext/shared';
import { useTracking } from '../tracking/TrackingContext.js';
import { useTickStream } from '../tracking/useTickStream.js';
import { gsap } from '../motion/gsap.js';
import { MOTION } from '../motion/motionConfig.js';
import { useReducedMotion } from '../motion/useReducedMotion.js';
import Ambient from '../motion/Ambient.jsx';
import { Scramble } from '../motion/primitives.jsx';

/**
 * /demo — a scripted, presenter-friendly simulation for the faculty panel.
 *
 * It switches the (persistent, never-remounted) tracker to MOCK signals and plays
 * the built-in engaged → drifting → confused → fatigued → recovering scenario
 * through the REAL shared pipeline (computeEngagement + evaluateCuration), so the
 * adaptive behaviour is genuine — only the input signal is simulated. On-screen
 * captions narrate what is happening and why. Clearly labelled as a simulation.
 *
 * Keyboard: [R] restart · [F] toggle fast-forward · [Space] pause/resume.
 */

// Caption script keyed to elapsed virtual-seconds (aligned to DEFAULT_SCENARIO).
const CAPTIONS = [
  { at: 0, zone: 'calibrated', line: 'A lesson begins. Blink rate and expression are read entirely on-device.' },
  { at: 6, zone: 'engaged', line: 'Engaged — steady blink rate, positive expression. The score stays high.' },
  { at: 20, zone: 'drifting', line: 'Attention drifting: blink rate creeps up and the expression flattens.' },
  { at: 40, zone: 'confused', line: 'Signs of confusion — EduNext can offer to replay or slow the lesson down.' },
  { at: 75, zone: 'fatigued', line: 'Fatigued: blink rate high, mood low. A break is suggested — your choice.' },
  { at: 120, zone: 'recovering', line: 'Recovering after the break — engagement climbs back up.' },
];

function captionFor(elapsedS) {
  let c = CAPTIONS[0];
  for (const cap of CAPTIONS) if (elapsedS >= cap.at) c = cap;
  return c;
}

export default function Demo() {
  const t = useTracking();
  const reduced = useReducedMotion();
  const { tick } = useTickStream({ active: t.started && t.source === 'mock' });

  const initialSourceRef = useRef(t.source);
  const engStateRef = useRef({ ema: null });
  const curStateRef = useRef(createCurationState());
  const startRef = useRef(null);

  const [score, setScore] = useState(0);
  const [zone, setZone] = useState('—');
  const [elapsed, setElapsed] = useState(0);
  const [lastAction, setLastAction] = useState(null);
  const [fast, setFast] = useState(false);
  const [paused, setPaused] = useState(false);

  // Start in mock mode on mount; restore the previous source on leave. Preload the
  // heavy chunks (Vanta + three) so nothing stalls if the presenter navigates out.
  useEffect(() => {
    const prev = initialSourceRef.current;
    t.setSource('mock');
    t.setTimeScale(1);
    t.start();
    import('three').catch(() => {});
    import('vanta/dist/vanta.waves.min').catch(() => {});
    return () => {
      t.stop();
      t.setSource(prev);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drive the real pipeline off each mock tick.
  useEffect(() => {
    if (!tick) return;
    if (startRef.current == null) startRef.current = tick.t;
    const now = tick.t;
    const eng = computeEngagement(engStateRef.current, tick, [], now);
    engStateRef.current = eng.state;
    const elapsedS = (now - startRef.current) / 1000;
    const { action, state } = evaluateCuration(
      curStateRef.current,
      { score: eng.score, zone: tick.zone, emotion: tick.emotion },
      { elapsedS, currentRate: 1, variant: 'visual', switchedAlready: false, now }
    );
    curStateRef.current = state;
    setScore(eng.score);
    setZone(tick.zone);
    setElapsed(elapsedS);
    if (action) setLastAction({ at: Math.round(elapsedS), ...action });
  }, [tick]);

  // Keyboard controls for presenting.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'r' || e.key === 'R') restart();
      else if (e.key === 'f' || e.key === 'F') toggleFast();
      else if (e.code === 'Space') {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fast, paused, t.started]);

  function restart() {
    engStateRef.current = { ema: null };
    curStateRef.current = createCurationState();
    startRef.current = null;
    setScore(0);
    setZone('—');
    setElapsed(0);
    setLastAction(null);
    setPaused(false);
    t.stop();
    t.setTimeScale(fast ? 6 : 1);
    t.start();
  }
  function toggleFast() {
    const next = !fast;
    setFast(next);
    t.setTimeScale(next ? 6 : 1);
  }
  function togglePause() {
    if (paused) {
      t.start();
      setPaused(false);
    } else {
      t.stop();
      setPaused(true);
    }
  }

  const cap = captionFor(elapsed);

  return (
    <div className="relative min-h-screen px-6 py-10">
      <Ambient className="fixed" />
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-display text-xl font-bold tracking-tight">
              Edu<span className="text-sky-400">Next</span>
            </span>
            <span className="pill border-amber-400/40 bg-amber-500/10 text-amber-200">Scripted simulation — not a live camera reading</span>
          </div>
          <Link to="/" className="text-sm text-sky-400 hover:underline">← Back to site</Link>
        </header>

        <ScoreRing score={score} zone={zone} reduced={reduced} />

        <section aria-live="polite" className="card min-h-[7rem]">
          <div className="text-sm font-semibold text-sky-300">
            <Scramble key={cap.zone} text={cap.zone} className="uppercase tracking-wide" />
            <span className="ml-3 font-mono text-slate-500">t+{Math.round(elapsed)}s</span>
          </div>
          <p className="mt-2 text-lg text-slate-200">{cap.line}</p>
          {lastAction && (
            <p className="mt-3 text-sm text-emerald-300">
              Adaptive action @ t+{lastAction.at}s: <b>{lastAction.type || lastAction.action}</b>
              {lastAction.reason ? ` — ${lastAction.reason}` : ''}
            </p>
          )}
        </section>

        <section className="flex flex-wrap items-center gap-2">
          <button onClick={restart} className="btn-ghost">Restart [R]</button>
          <button onClick={toggleFast} className={`btn-ghost ${fast ? 'ring-1 ring-sky-400' : ''}`}>
            Fast-forward [F] {fast ? 'on' : 'off'}
          </button>
          <button onClick={togglePause} className="btn-ghost">{paused ? 'Resume' : 'Pause'} [Space]</button>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
          <h2 className="mb-2 font-medium text-slate-200">Presenter keys</h2>
          <ul className="grid gap-1 sm:grid-cols-3">
            <li><kbd className="font-mono text-slate-200">R</kbd> — restart scenario</li>
            <li><kbd className="font-mono text-slate-200">F</kbd> — fast-forward (6×)</li>
            <li><kbd className="font-mono text-slate-200">Space</kbd> — pause / resume</li>
          </ul>
          <p className="mt-3">
            This runs the real engagement + curation logic on a simulated signal stream. Real-camera
            mode is available and unchanged on the normal lesson flow.
          </p>
        </section>
      </div>
    </div>
  );
}

/** Circular score gauge whose arc eases between values with GSAP (no React churn). */
function ScoreRing({ score, zone, reduced }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const arcRef = useRef(null);
  const numRef = useRef(null);
  const setOffset = useRef(null);
  const setNum = useRef(null);

  useGSAP(
    () => {
      if (!arcRef.current) return;
      if (reduced) {
        setOffset.current = (v) => gsap.set(arcRef.current, { strokeDashoffset: C * (1 - v / 100) });
        setNum.current = (v) => {
          if (numRef.current) numRef.current.textContent = Math.round(v);
        };
        return;
      }
      const qt = gsap.quickTo(arcRef.current, 'strokeDashoffset', { duration: MOTION.dur.base, ease: MOTION.ease.out });
      setOffset.current = (v) => qt(C * (1 - v / 100)); // takes a 0–100 score
      const o = { v: 0 };
      setNum.current = (v) =>
        gsap.to(o, {
          v,
          duration: MOTION.dur.base,
          ease: MOTION.ease.out,
          onUpdate: () => {
            if (numRef.current) numRef.current.textContent = Math.round(o.v);
          },
        });
    },
    { dependencies: [reduced] }
  );

  useEffect(() => {
    // Ease the arc + number toward the latest score (both setters take a 0–100
    // score; under reduced motion they snap instead of tweening).
    setOffset.current?.(score);
    setNum.current?.(score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);

  return (
    <div className="flex items-center gap-6">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
          <circle
            ref={arcRef}
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke="url(#g)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C}
          />
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#818cf8" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span ref={numRef} className="font-display text-3xl font-bold">0</span>
        </div>
      </div>
      <div>
        <div className="text-sm text-slate-400">Live engagement estimate</div>
        <div className="font-display text-2xl font-semibold capitalize">{zone}</div>
        <div className="mt-1 text-xs text-slate-500">0–100, eased between values</div>
      </div>
    </div>
  );
}
