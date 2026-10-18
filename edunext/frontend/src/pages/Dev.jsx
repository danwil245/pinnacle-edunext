import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  computeEngagement,
  evaluateCuration,
  createCurationState,
} from '@edunext/shared';
import { useTracking } from '../tracking/TrackingContext.js';
import { useTickStream } from '../tracking/useTickStream.js';
import { useMotionBudget, usePerfFps } from '../motion/useMotionBudget.jsx';
import { Reveal } from '../motion/primitives.jsx';
import { ScrollTrigger } from '../motion/gsap.js';

/**
 * Developer / demo console. Drives the FULL pipeline (tick -> engagement ->
 * curation) off whichever source is active, so a presenter can show adaptive
 * behavior with the mock source and no webcam.
 */
export default function Dev() {
  const t = useTracking();
  const { tick } = useTickStream({ active: t.started });
  const budget = useMotionBudget();
  const fps = usePerfFps();
  const [triggerCount, setTriggerCount] = useState(0);

  // Report live ScrollTrigger count (motion readout, Section 6).
  useEffect(() => {
    const id = setInterval(() => {
      setTriggerCount(ScrollTrigger.getAll().length);
    }, 500);
    return () => clearInterval(id);
  }, []);

  const engStateRef = useRef({ ema: null });
  const curStateRef = useRef(createCurationState());
  const startRef = useRef(null);
  const [engagement, setEngagement] = useState(null);
  const [lastAction, setLastAction] = useState(null);
  const [actions, setActions] = useState([]);

  useEffect(() => {
    if (!tick) return;
    if (startRef.current == null) startRef.current = tick.t;
    const now = tick.t;
    const eng = computeEngagement(engStateRef.current, tick, [], now);
    engStateRef.current = eng.state;
    setEngagement(eng);

    const elapsedS = (now - startRef.current) / 1000;
    const { action, state } = evaluateCuration(
      curStateRef.current,
      { score: eng.score, zone: tick.zone, emotion: tick.emotion },
      { elapsedS, currentRate: 1, variant: 'visual', switchedAlready: false, now }
    );
    curStateRef.current = state;
    if (action) {
      setLastAction(action);
      setActions((a) => [{ at: Math.round(elapsedS), ...action }, ...a].slice(0, 8));
    }
  }, [tick]);

  const reset = () => {
    engStateRef.current = { ema: null };
    curStateRef.current = createCurationState();
    startRef.current = null;
    setEngagement(null);
    setLastAction(null);
    setActions([]);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dev / Demo Console</h1>
        <Link to="/" className="text-sm text-sky-400 hover:underline">
          ← Home
        </Link>
      </header>

      <section className="glass space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-400">Source:</span>
          {['camera', 'mock'].map((s) => (
            <button
              key={s}
              onClick={() => t.setSource(s)}
              className={`rounded-lg px-3 py-1 text-sm ${t.source === s ? 'bg-sky-600 text-white' : 'bg-white/10 text-slate-200'}`}
            >
              {s}
            </button>
          ))}
          <span className="ml-4 text-sm text-slate-400">Time-scale:</span>
          {[1, 5, 10].map((n) => (
            <button
              key={n}
              onClick={() => t.setTimeScale(n)}
              disabled={t.source !== 'mock'}
              className={`rounded-lg px-3 py-1 text-sm disabled:opacity-40 ${t.timeScale === n ? 'bg-sky-600 text-white' : 'bg-white/10 text-slate-200'}`}
            >
              {n}×
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {!t.started ? (
            <button onClick={t.start} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white">
              Start
            </button>
          ) : (
            <button onClick={t.stop} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white">
              Stop
            </button>
          )}
          <button onClick={reset} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-slate-200">
            Reset pipeline
          </button>
        </div>
        <p className="text-xs text-slate-400">
          status: <b>{t.status}</b> · face: <b>{String(t.faceDetected)}</b> · emotion model:{' '}
          <b>{t.emotionAvailable ? 'ready' : 'off'}</b>
        </p>
      </section>

      <section className="glass space-y-2 p-4">
        <h2 className="font-medium text-slate-200">Motion budget</h2>
        <p className="text-sm text-slate-300">
          FPS: <b className="font-mono">{fps}</b> · motion degraded:{' '}
          <b className={budget.degraded ? 'text-amber-300' : 'text-emerald-300'}>{String(budget.degraded)}</b> ·
          active ScrollTriggers: <b className="font-mono">{triggerCount}</b>
        </p>
        {budget.degraded && (
          <button onClick={budget.reEnable} className="rounded-lg bg-white/10 px-3 py-1 text-sm text-slate-200">
            Re-enable motion
          </button>
        )}
        <Reveal className="mt-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
          This panel fades + rises in via the shared <code>Reveal</code> primitive (GSAP + ScrollTrigger),
          proving the Lenis/GSAP foundation is wired.
        </Reveal>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="glass space-y-1 p-4 text-sm">
          <h2 className="mb-2 font-medium text-slate-200">Live tick</h2>
          <Row k="bpm" v={tick?.bpm == null ? 'calibrating…' : tick.bpm.toFixed(1)} />
          <Row k="zone" v={tick?.zone ?? '—'} />
          <Row k="emotion" v={tick?.emotion ?? '—'} />
          <Row k="observedS" v={tick?.observedS ?? 0} />
          <Row k="faceDetected" v={String(tick?.faceDetected ?? false)} />
        </div>
        <div className="glass space-y-1 p-4 text-sm">
          <h2 className="mb-2 font-medium text-slate-200">Engagement</h2>
          <Row k="score" v={engagement?.score == null ? '—' : engagement.score.toFixed(1)} />
          <Row k="level" v={engagement?.level ?? '—'} />
          <Row k="blink" v={engagement?.components?.blink ?? '—'} />
          <Row k="emotion" v={engagement?.components?.emotion ?? '—'} />
        </div>
      </section>

      <section className="glass p-4">
        <h2 className="mb-2 font-medium text-slate-200">Curation actions</h2>
        {lastAction && <p className="mb-2 text-sm text-amber-300">Last: {lastAction.type} — {lastAction.reason}</p>}
        {actions.length === 0 ? (
          <p className="text-sm text-slate-500">None yet. Start the mock source at 10× and wait ~15s.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {actions.map((a, i) => (
              <li key={i} className="text-slate-300">
                <span className="text-slate-500">t+{a.at}s</span> · <b>{a.type}</b> — {a.reason}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{k}</span>
      <span className="font-mono text-slate-100">{String(v)}</span>
    </div>
  );
}
