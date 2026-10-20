import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CONFIG,
  personalizeBoundaries,
  addProbe,
  detectStyle,
  createStyleStats,
  ATTENTION_ZONES,
  DEFAULT_BOUNDARIES,
} from '@edunext/shared';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useTracking } from '../../tracking/TrackingContext.js';
import { INTEREST_CLIPS, NEUTRAL_CLIP, STYLE_PROBE_CLIPS } from '../../content/calibrationClips.js';
import MeasureClip from './MeasureClip.jsx';
import { PageTransition, Stagger, CountUp, InlineError } from '../../motion/primitives.jsx';

const TOPIC_LABELS = { 'web-development': 'Web Development', 'data-science': 'Data Science', design: 'Design' };
const STEPS = ['Consent', 'Interests', 'Baseline', 'Style', 'Result'];

export default function Onboarding() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const tracking = useTracking();

  const [step, setStep] = useState(0);
  const [mode, setMode] = useState(null); // 'camera' | 'mock' | 'none'
  const [topics, setTopics] = useState([]);
  const [interests, setInterests] = useState([]);
  const [baseline, setBaseline] = useState({ engaged: null, neutral: null });
  const [styleProbe, setStyleProbe] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Larger camera overlay during onboarding.
  useEffect(() => {
    tracking.setOverlaySize('lg');
    return () => tracking.setOverlaySize('sm');
  }, [tracking]);

  // Topics come from the seeded courses.
  useEffect(() => {
    api('/courses')
      .then((d) => setTopics([...new Set(d.courses.map((c) => c.topic))]))
      .catch(() => setTopics(Object.keys(TOPIC_LABELS)));
  }, []);

  const { boundaries, personalized } = useMemo(() => {
    if (!baseline.engaged || !baseline.neutral) return { boundaries: DEFAULT_BOUNDARIES, personalized: false };
    return personalizeBoundaries({ engagedBpm: baseline.engaged.bpm, neutralBpm: baseline.neutral.bpm });
  }, [baseline]);

  // Stored form (both clips) vs. runtime form (the neutral/resting baseline that
  // subtractBaseline expects — a flat 7-class map).
  const emotionBaseline = useMemo(() => {
    if (baseline.engaged?.emotionProbs && baseline.neutral?.emotionProbs) {
      return { engagedClip: baseline.engaged.emotionProbs, neutralClip: baseline.neutral.emotionProbs };
    }
    return null;
  }, [baseline]);
  const runtimeBaseline = useMemo(() => baseline.neutral?.emotionProbs || null, [baseline]);

  const stylePreview = useMemo(() => {
    if (!styleProbe) return { style: 'unknown', confidence: 0 };
    return detectStyle(addProbe(createStyleStats(), styleProbe));
  }, [styleProbe]);

  const chooseMode = (m) => {
    setMode(m);
    if (m === 'camera') {
      tracking.setSource('camera');
      tracking.start();
    } else if (m === 'mock') {
      tracking.setSource('mock');
      tracking.setTimeScale(10);
      tracking.start();
    } else {
      tracking.stop();
    }
  };

  const saveInterests = async () => {
    setError('');
    try {
      await api('/profile/interests', { method: 'PUT', body: { interests } });
      setStep(2);
    } catch (e) {
      setError(e.message);
    }
  };

  const finishOnboarding = async () => {
    setSaving(true);
    setError('');
    try {
      const calibration = {
        engagedBpm: baseline.engaged?.bpm ?? null,
        neutralBpm: baseline.neutral?.bpm ?? null,
        boundaries,
        personalized,
        emotionBaseline,
        clipSeconds: CONFIG.CALIBRATION_CLIP_S,
        completedAt: new Date().toISOString(),
        // Flag a degraded read if any baseline clip fell back to a placeholder.
        usedFallbackClip: !!(baseline.engaged?.usedFallback || baseline.neutral?.usedFallback),
        sourceQuality: {
          blinksEngaged: baseline.engaged?.blinks ?? 0,
          blinksNeutral: baseline.neutral?.blinks ?? 0,
          faceSecondsEngaged: baseline.engaged?.observedS ?? 0,
          faceSecondsNeutral: baseline.neutral?.observedS ?? 0,
        },
      };
      await api('/profile/calibration', { method: 'PUT', body: { calibration, styleProbe } });
      await refresh();
      tracking.stop();
      navigate('/home');
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      {/* Plain dark background during onboarding — no WebGL/Vanta behind the
          calibration clips (it would compete with the tracker + clip playback). */}
      <div className="relative z-10 mx-auto max-w-2xl p-4 sm:p-6">
        <Stepper step={step} />
        {error && <InlineError className="mb-4 rounded-lg bg-rose-500/10 p-3">{error}</InlineError>}

        <PageTransition key={step}>
          {step === 0 && <ConsentStep mode={mode} tracking={tracking} chooseMode={chooseMode} onNext={() => setStep(1)} />}
          {step === 1 && (
            <InterestsStep topics={topics} interests={interests} setInterests={setInterests} onNext={saveInterests} />
          )}
          {step === 2 && (
            <BaselineStep
              mode={mode}
              interests={interests}
              onDone={(b) => {
                setBaseline(b);
                setStep(3);
              }}
            />
          )}
          {step === 3 && (
            <StyleStep
              mode={mode}
              boundaries={boundaries}
              emotionBaseline={runtimeBaseline}
              onDone={(sp) => {
                setStyleProbe(sp);
                setStep(4);
              }}
            />
          )}
          {step === 4 && (
            <ResultStep
              boundaries={boundaries}
              personalized={personalized}
              emotionBaseline={emotionBaseline}
              stylePreview={stylePreview}
              saving={saving}
              onSave={finishOnboarding}
            />
          )}
        </PageTransition>
      </div>
    </div>
  );
}

function Stepper({ step }) {
  const pct = (step / (STEPS.length - 1)) * 100;
  return (
    <div className="mb-6">
      <ol className="flex items-center justify-between text-xs" aria-label="Onboarding progress">
        {STEPS.map((label, i) => (
          <li key={label} className={`flex items-center gap-2 transition-colors duration-300 ${i <= step ? 'text-sky-300' : 'text-slate-500'}`}>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border transition-[background-color,border-color,box-shadow] duration-300 ${
                i < step
                  ? 'border-sky-400 bg-sky-500/30'
                  : i === step
                    ? 'border-sky-400 bg-sky-500/20 ring-2 ring-sky-400/40'
                    : 'border-white/15'
              }`}
              aria-current={i === step ? 'step' : undefined}
            >
              {i < step ? '✓' : i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
          </li>
        ))}
      </ol>
      {/* Eased progress line beneath the stepper. */}
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-300"
          style={{ width: `${pct}%`, transition: 'width 0.5s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </div>
    </div>
  );
}

function ConsentStep({ mode, tracking, chooseMode, onNext }) {
  const ready = mode === 'none' || (mode === 'camera' && tracking.status === 'ready') || (mode === 'mock' && tracking.started);
  return (
    <section className="card space-y-4">
      <h1>Let’s set up EduNext</h1>
      <p className="text-slate-300">
        EduNext estimates your attention from your <b>blink rate</b> and facial expression, entirely{' '}
        <b>in your browser</b>. Your camera video never leaves your device — only derived numbers (a blink
        rate, a zone, an emotion label, a score) are saved. You can recalibrate or delete your data anytime.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <ModeButton active={mode === 'camera'} onClick={() => chooseMode('camera')} title="Enable camera"
          desc="Best accuracy. We measure on-device." />
        <ModeButton active={mode === 'mock'} onClick={() => chooseMode('mock')} title="Use mock signals"
          desc="Demo the full flow without a webcam." />
        <ModeButton active={mode === 'none'} onClick={() => chooseMode('none')} title="Without camera"
          desc="Feedback-only; default zones." />
      </div>
      {mode === 'camera' && (
        <p className="text-sm text-slate-400" role="status">
          Camera status: <b>{tracking.status}</b>
          {tracking.status === 'denied' && ' — permission was denied. You can continue without a camera.'}
        </p>
      )}
      <div className="flex justify-end">
        <button className="btn-primary" disabled={!ready} onClick={onNext}>Continue</button>
      </div>
    </section>
  );
}

function ModeButton({ active, onClick, title, desc }) {
  return (
    <button onClick={onClick} className={`rounded-xl border p-3 text-left transition ${active ? 'border-sky-400 bg-sky-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs text-slate-400">{desc}</div>
    </button>
  );
}

function InterestsStep({ topics, interests, setInterests, onNext }) {
  const toggle = (t) => {
    setInterests((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length < 2 ? [...cur, t] : cur));
  };
  return (
    <section className="card space-y-4">
      <h1>Pick what interests you</h1>
      <p className="text-slate-300">Choose one or two topics. We’ll use the first for your baseline clip.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {topics.map((t) => (
          <button key={t} onClick={() => toggle(t)} aria-pressed={interests.includes(t)}
            className={`rounded-xl border p-4 text-left transition ${interests.includes(t) ? 'border-sky-400 bg-sky-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
            {TOPIC_LABELS[t] || t}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <button className="btn-primary" disabled={interests.length === 0} onClick={onNext}>Continue</button>
      </div>
    </section>
  );
}

function BaselineStep({ mode, interests, onDone }) {
  const [phase, setPhase] = useState(mode === 'none' ? 'skip' : 'engaged');
  const [engaged, setEngaged] = useState(null);
  const interestClip = INTEREST_CLIPS[interests[0]] || NEUTRAL_CLIP;

  if (mode === 'none' || phase === 'skip') {
    return (
      <section className="card space-y-4">
        <h1>Baseline calibration</h1>
        <p className="text-slate-300">No camera selected, so we’ll use <b>default zones</b> (not personalized). You can recalibrate later from your profile.</p>
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => onDone({ engaged: null, neutral: null })}>Continue</button>
        </div>
      </section>
    );
  }

  return (
    <section className="card space-y-4">
      <h1>Baseline calibration</h1>
      <p className="text-slate-300">
        Watch two short clips so we can learn <i>your</i> personal blink zones. The timer counts only while
        we can see your face.
      </p>
      {phase === 'engaged' && (
        <MeasureClip key="engaged" src={interestClip.src} poster={interestClip.poster} label={`Interest clip — ${interestClip.label}`}
          durationS={CONFIG.CALIBRATION_CLIP_S} bigger
          onComplete={(r) => { setEngaged(r); setPhase('neutral'); }} />
      )}
      {phase === 'neutral' && (
        <MeasureClip key="neutral" src={NEUTRAL_CLIP.src} poster={NEUTRAL_CLIP.poster} label={`Neutral clip — ${NEUTRAL_CLIP.label}`}
          durationS={CONFIG.CALIBRATION_CLIP_S} bigger
          onComplete={(r) => onDone({ engaged, neutral: r })} />
      )}
    </section>
  );
}

function StyleStep({ mode, boundaries, emotionBaseline, onDone }) {
  const [phase, setPhase] = useState(mode === 'none' ? 'skip' : 'visual');
  const [visual, setVisual] = useState(null);

  if (mode === 'none' || phase === 'skip') {
    return (
      <section className="card space-y-4">
        <h1>Learning-style probe</h1>
        <p className="text-slate-300">Skipped without a camera — your style will refine as you take lessons.</p>
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => onDone(null)}>Continue</button>
        </div>
      </section>
    );
  }

  const done = (vis, prac) => {
    if (vis?.meanScore == null || prac?.meanScore == null) return onDone(null);
    onDone({
      visual: { meanScore: vis.meanScore, seconds: vis.observedS },
      practical: { meanScore: prac.meanScore, seconds: prac.observedS },
    });
  };

  return (
    <section className="card space-y-4">
      <h1>Learning-style probe</h1>
      <p className="text-slate-300">Two short clips on the same topic — one explained visually, one hands-on.</p>
      {phase === 'visual' && (
        <MeasureClip key="sv" src={STYLE_PROBE_CLIPS.visual.src} poster={STYLE_PROBE_CLIPS.visual.poster} label={`Visual — ${STYLE_PROBE_CLIPS.visual.label}`}
          durationS={CONFIG.STYLE_PROBE_CLIP_S} boundaries={boundaries} emotionBaseline={emotionBaseline} bigger
          onComplete={(r) => { setVisual(r); setPhase('practical'); }} />
      )}
      {phase === 'practical' && (
        <MeasureClip key="sp" src={STYLE_PROBE_CLIPS.practical.src} poster={STYLE_PROBE_CLIPS.practical.poster} label={`Hands-on — ${STYLE_PROBE_CLIPS.practical.label}`}
          durationS={CONFIG.STYLE_PROBE_CLIP_S} boundaries={boundaries} emotionBaseline={emotionBaseline} bigger
          onComplete={(r) => done(visual, r)} />
      )}
    </section>
  );
}

function ResultStep({ boundaries, personalized, emotionBaseline, stylePreview, saving, onSave }) {
  const labels = ['Hyperfocused', '', 'Attentive', '', 'Neutral', '', 'Fatigued', '', 'Sleepy'];
  return (
    <section className="card space-y-5">
      <h1>Your personal profile</h1>

      <div>
        <h2 className="mb-2">Blink zones {personalized ? '(personalized)' : '(default)'}</h2>
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <Stagger as="tbody" stagger={0.06}>
              {ATTENTION_ZONES.map((z, i) => {
                const lo = i === 0 ? 0 : boundaries[i - 1];
                const hi = i < boundaries.length ? boundaries[i] : null;
                return (
                  <tr key={z.key} className="border-t border-white/5 first:border-t-0">
                    <td className="px-3 py-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: z.color }} aria-hidden />{' '}
                      {z.label}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-300">
                      {hi == null ? `${lo}+ bpm` : `${lo}–${hi} bpm`}
                    </td>
                  </tr>
                );
              })}
            </Stagger>
          </table>
        </div>
        {!personalized && (
          <p className="mt-2 text-xs text-amber-300">
            Your two reads were too close (or no camera), so we kept the default zones. You can recalibrate anytime.
          </p>
        )}
      </div>

      <p className="text-sm text-slate-300">
        Emotion baseline: <b>{emotionBaseline ? 'captured' : 'not available'}</b>. Detected learning style:{' '}
        <b className="capitalize">{stylePreview.style}</b>{' '}
        <span className="text-slate-400">
          (confidence <CountUp to={Math.round(stylePreview.confidence * 100)} suffix="%" className="tabular-nums" />)
        </span>.
      </p>
      <p className="rounded-lg bg-white/5 p-3 text-xs text-slate-400">
        These are <b>estimates</b> from a short calibration and refine as you learn. Blink rate is also affected by
        lighting, screens, dry eyes, and caffeine — EduNext reads a signal, not a diagnosis.
      </p>

      <div className="flex justify-end">
        <button className="btn-primary" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Looks right, start learning'}
        </button>
      </div>
    </section>
  );
}
