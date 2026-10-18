import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import { CONFIG, DEFAULT_BOUNDARIES, ZONE_BY_KEY } from '@edunext/shared';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useTracking } from '../../tracking/TrackingContext.js';
import { Loading, ErrorState } from '../Home.jsx';
import ClipPlaceholder, { isPlayableSrc } from '../../components/ClipPlaceholder.jsx';
import { useLessonSession } from './useLessonSession.js';
import BreakPrompt from './BreakPrompt.jsx';
import BreakScreen from './BreakScreen.jsx';
import { gsap } from '../../motion/gsap.js';
import { MOTION } from '../../motion/motionConfig.js';
import { useReducedMotion } from '../../motion/useReducedMotion.js';
import { useMotionBudget } from '../../motion/useMotionBudget.jsx';

const FOCUS_KEY = 'edunext_focus_mode';
function readFocusMode() {
  try {
    return localStorage.getItem(FOCUS_KEY) === '1';
  } catch {
    return false;
  }
}

export default function Lesson() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const tracking = useTracking();
  const videoRef = useRef(null);
  const chromeRef = useRef(null);
  const bodyRef = useRef(null);
  const [lesson, setLesson] = useState(null);
  const [error, setError] = useState('');
  const [videoError, setVideoError] = useState(false);

  // Dev-only preview of the break UI (hard to trigger live — the curation engine
  // often fires a lighter action first and the cooldown preempts the break).
  // Open with ?forcebreak=1. Self-contained local state; does not touch a session.
  const [searchParams] = useSearchParams();
  const forceBreak = searchParams.get('forcebreak') === '1';
  const [previewStage, setPreviewStage] = useState('prompt'); // prompt | break | none
  const [previewLeft, setPreviewLeft] = useState(CONFIG.BREAK.LENGTH_S);
  useEffect(() => {
    if (!forceBreak || previewStage !== 'break') return undefined;
    const id = setInterval(() => setPreviewLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [forceBreak, previewStage]);

  // Focus mode: one click turns off all non-essential lesson motion for the
  // session. Motion defaults ON (focus mode off). Combined with OS/app reduced
  // motion and the performance guard, this is the lesson's "motion off" signal.
  const reduced = useReducedMotion();
  const { degraded } = useMotionBudget();
  const [focusMode, setFocusMode] = useState(readFocusMode);
  const motionOff = reduced || focusMode || degraded;

  const toggleFocus = () => {
    setFocusMode((f) => {
      const next = !f;
      try {
        localStorage.setItem(FOCUS_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Invariant (Section 6): no WebGL background may ever mount on the lesson route.
  useEffect(() => {
    if (import.meta.env.DEV && document.querySelector('canvas.vanta-canvas')) {
      // eslint-disable-next-line no-console
      console.error('[EduNext] Vanta canvas present on the lesson route — not allowed.');
    }
  }, []);

  useEffect(() => {
    api(`/lessons/${lessonId}`)
      .then((d) => setLesson(d.lesson))
      .catch((e) => setError(e.message));
  }, [lessonId]);

  const boundaries = profile?.calibration?.boundaries || DEFAULT_BOUNDARIES;
  const emotionBaseline = profile?.calibration?.emotionBaseline?.neutralClip || null;

  const s = useLessonSession({
    lessonId: Number(lessonId),
    durationS: lesson?.durationS || 120,
    boundaries,
    emotionBaseline,
    videoRef,
  });

  useEffect(() => {
    // Lesson overlay stays small so it never covers content.
    tracking.setOverlaySize('sm');
  }, [tracking]);

  const finish = async (completed) => {
    // Just end the session; navigation happens in the effect below once the
    // summary state is actually populated. (Navigating here used the stale
    // closure value of s.summary — still null — so the Summary page fell back to
    // /insights and lost the zone/emotion distributions.)
    await s.end(completed);
  };
  // When the summary is computed, navigate to it WITH the full summary in state.
  useEffect(() => {
    if (s.phase === 'ended' && s.summary) {
      navigate(`/summary/${s.summary.sessionId}`, { state: { summary: s.summary } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.summary, s.phase]);

  // One-time entrance for the player chrome (plays once on start, then still —
  // no looping motion near the lesson content).
  const playing = s.phase !== 'idle';
  useGSAP(
    () => {
      if (motionOff || !chromeRef.current) return;
      gsap.from(chromeRef.current.children, {
        opacity: 0,
        y: 16,
        duration: MOTION.dur.base,
        ease: MOTION.ease.out,
        stagger: MOTION.stagger.base,
      });
    },
    { dependencies: [playing, motionOff], scope: chromeRef }
  );

  // Crossfade the lesson body when the served variant switches (once per event).
  useGSAP(
    () => {
      if (motionOff || !bodyRef.current) return;
      gsap.fromTo(
        bodyRef.current,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: MOTION.dur.base, ease: MOTION.ease.out, clearProps: 'transform' }
      );
    },
    { dependencies: [s.variant], scope: bodyRef }
  );

  if (error) return <div className="p-6"><ErrorState message={error} /></div>;
  if (!lesson) return <Loading />;

  // Dev-only break-UI preview (?forcebreak=1): render the real components with
  // local state so the break prompt + break screen can be reviewed/screenshotted
  // without waiting for the curation engine to fire the action live.
  if (forceBreak) {
    const breakMinutes = Math.max(1, Math.round(CONFIG.BREAK.LENGTH_S / 60));
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="text-xl">{lesson.title}</h1>
        <p className="mt-2 text-sm text-slate-400">Break UI preview (dev). Stage: {previewStage}.</p>
        {previewStage === 'prompt' && (
          <BreakPrompt breakMinutes={breakMinutes} reason="dev preview" motionOff={motionOff}
            onTakeBreak={() => { setPreviewLeft(CONFIG.BREAK.LENGTH_S); setPreviewStage('break'); }}
            onKeepGoing={() => setPreviewStage('none')} onRemindLater={() => setPreviewStage('none')} />
        )}
        {previewStage === 'break' && (
          <BreakScreen secondsLeft={previewLeft} totalS={CONFIG.BREAK.LENGTH_S} onResume={() => setPreviewStage('none')} motionOff={motionOff} />
        )}
        {previewStage === 'none' && <p className="mt-4 text-slate-400">Preview closed — reload with ?forcebreak=1 to reopen.</p>}
      </div>
    );
  }

  const body = s.variant ? lesson[s.variant] : lesson[lesson.servedVariant];

  if (s.phase === 'idle') {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <nav className="mb-4 text-sm text-slate-400">
          <Link to="/home" className="hover:text-slate-200">← Home</Link>
        </nav>
        <div className="card space-y-4">
          <h1>{lesson.title}</h1>
          <p className="text-slate-300">
            This lesson runs with on-device attention tracking. Your camera overlay stays in the corner;
            only derived numbers are saved. Audio starts when you press play.
          </p>
          {!tracking.started && (
            <p className="text-sm text-amber-300">
              Pressing Start begins your selected signal source
              {tracking.source === 'mock' ? ' (mock signals)' : ' (your camera will be requested)'}. You can
              switch sources on the <Link className="underline" to="/dev">Dev page</Link>.
            </p>
          )}
          {/* s.start() starts the signal source (camera or mock) if it isn't
              already running — onboarding stops the tracker on finish. */}
          <button className="btn-primary" onClick={s.start}>Start lesson</button>
        </div>
      </div>
    );
  }

  return (
    <div ref={chromeRef} className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl">{lesson.title}</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFocus}
            aria-pressed={focusMode}
            title="Focus mode turns off non-essential motion for this session"
            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
              focusMode
                ? 'border-sky-400/40 bg-sky-500/15 text-sky-200'
                : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {focusMode ? '● Focus mode on' : '○ Focus mode'}
          </button>
          <button className="btn-ghost" onClick={() => finish(true)}>Complete lesson</button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-black">
        {isPlayableSrc(body?.videoUrl) && !videoError ? (
          <video
            ref={videoRef}
            src={body?.videoUrl}
            className="aspect-video w-full"
            controls
            playsInline
            onEnded={() => s.setFeedbackPrompt({ kind: 'end' })}
            onError={() => setVideoError(true)}
          />
        ) : (
          // Placeholder content (no real/remote video): the session still runs on
          // the tracker signal, so the lesson works end-to-end without a clip.
          <ClipPlaceholder title={lesson.title} caption={`${s.variant || 'visual'} walkthrough — simulated clip`} />
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>Playback {s.rate}×</span>
        <span>Placeholder content · {s.variant || lesson.servedVariant} variant</span>
      </div>

      <div ref={bodyRef} key={s.variant} className="mt-6">
        {s.variant === 'practical' ? <PracticalBody body={body} /> : <VisualBody body={body} />}
      </div>

      <Hud engagement={s.engagement} tick={s.tick} lastAction={s.lastAction} emotionAvailable={tracking.emotionAvailable} motionOff={motionOff} />

      {/* The break uses a proper focus-trapped modal; lighter actions stay as a banner. */}
      {s.suggestion?.type === 'suggest_break' && s.phase !== 'paused' && (
        <BreakPrompt
          breakMinutes={Math.max(1, Math.round(s.breakTotalS / 60))}
          reason={s.suggestion.reason}
          onTakeBreak={s.acceptSuggestion}
          onKeepGoing={s.dismissSuggestion}
          onRemindLater={s.snoozeSuggestion}
          motionOff={motionOff}
        />
      )}
      {s.suggestion && s.suggestion.type !== 'suggest_break' && (
        <SuggestionBanner action={s.suggestion} onAccept={s.acceptSuggestion} onDismiss={s.dismissSuggestion} motionOff={motionOff} />
      )}
      {s.phase === 'paused' && (
        <BreakScreen secondsLeft={s.breakLeft} totalS={s.breakTotalS} onResume={s.resumeFromBreak} motionOff={motionOff} />
      )}
      {s.feedbackPrompt && <FeedbackPrompt prompt={s.feedbackPrompt} onSubmit={s.submitFeedback} onClose={() => s.setFeedbackPrompt(null)} motionOff={motionOff} />}
      {s.toast && <Toast toast={s.toast} motionOff={motionOff} />}
    </div>
  );
}

function VisualBody({ body }) {
  if (!body) return null;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="card">
        <h2 className="mb-3">Key points</h2>
        <ul className="space-y-2 text-sm text-slate-200">
          {body.keyPoints?.map((p, i) => (
            <li key={i} className="flex gap-2"><span aria-hidden className="text-sky-400">•</span>{p}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-slate-400">{body.summary}</p>
      </div>
      {body.diagram && (
        <div className="card flex items-center justify-center text-sky-300">
          <div className="w-full" role="img" aria-label={body.diagram.alt} dangerouslySetInnerHTML={{ __html: body.diagram.svg }} />
        </div>
      )}
    </div>
  );
}

function PracticalBody({ body }) {
  const [checks, setChecks] = useState({});
  const [openHints, setOpenHints] = useState(false);
  if (!body) return null;
  const allDone = body.checklist?.length > 0 && body.checklist.every((_, i) => checks[i]);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="card">
        <h2 className="mb-1">{body.task?.title}</h2>
        <ol className="mt-3 space-y-2 text-sm text-slate-200">
          {body.task?.steps?.map((step, i) => (
            <li key={i} className="flex gap-2"><span className="text-slate-500">{i + 1}.</span>{step}</li>
          ))}
        </ol>
        {body.starter && (
          <pre data-lenis-prevent className="mt-3 max-h-60 overflow-auto rounded-lg bg-black/50 p-3 text-xs text-emerald-200">
            {body.starter}
          </pre>
        )}
        {body.task?.hints?.length > 0 && (
          <div className="mt-3">
            <button className="text-sm text-sky-400 hover:underline" onClick={() => setOpenHints((o) => !o)} aria-expanded={openHints}>
              {openHints ? 'Hide hints' : 'Show hints'}
            </button>
            {openHints && (
              <ul className="mt-2 space-y-1 text-sm text-slate-400">
                {body.task.hints.map((h, i) => <li key={i}>– {h}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="card">
        <h2 className="mb-3">Self-check</h2>
        <ul className="space-y-2">
          {body.checklist?.map((c, i) => (
            <li key={i}>
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" checked={!!checks[i]} onChange={(e) => setChecks((p) => ({ ...p, [i]: e.target.checked }))}
                  className="h-4 w-4 rounded border-white/20 bg-transparent" />
                {c}
              </label>
            </li>
          ))}
        </ul>
        <button className="btn-primary mt-4" disabled={!allDone}>Mark complete</button>
        {body.task?.expectedOutcome && <p className="mt-3 text-xs text-slate-500">Goal: {body.task.expectedOutcome}</p>}
      </div>
    </div>
  );
}

function Hud({ engagement, tick, lastAction, emotionAvailable, motionOff }) {
  const [open, setOpen] = useState(() => localStorage.getItem('edunext_hud') !== 'closed');
  const toggle = () => {
    const next = !open;
    setOpen(next);
    localStorage.setItem('edunext_hud', next ? 'open' : 'closed');
  };
  const zone = tick?.zone ? ZONE_BY_KEY[tick.zone] : null;
  const score = engagement?.score;
  return (
    <aside className="fixed bottom-4 left-4 z-40 w-64" aria-live="polite">
      <div className="glass-strong p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-medium">Engagement</span>
          <button className="text-xs text-slate-400 hover:text-white" onClick={toggle} aria-expanded={open}>
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
        {open && (
          <div className="mt-2 space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-300 ${
                  motionOff ? '' : 'transition-[width] duration-500 ease-out'
                }`}
                style={{ width: `${score ?? 0}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-300">
              <span>{score == null ? 'Calibrating…' : `${Math.round(score)} / 100`}</span>
              <span className="capitalize">{engagement?.level ?? '—'}</span>
            </div>
            <div className="flex flex-wrap gap-1 text-xs">
              <span className="pill">
                {zone ? <><span className="h-2 w-2 rounded-full" style={{ background: zone.color }} aria-hidden /> {zone.label}</> : 'zone —'}
              </span>
              <span className="pill capitalize">{emotionAvailable ? tick?.emotion ?? 'emotion —' : 'emotion off'}</span>
            </div>
            {lastAction && <p className="text-xs text-amber-300">Why: {lastAction.reason}</p>}
          </div>
        )}
      </div>
    </aside>
  );
}

function SuggestionBanner({ action, onAccept, onDismiss, motionOff }) {
  const verb = { suggest_break: 'Take a break', replay_section: 'Replay that part', switch_variant: 'Switch style' }[action.type] || 'Try this';
  return (
    <div className="fixed left-1/2 top-4 z-50 w-[min(90vw,32rem)] -translate-x-1/2" role="alertdialog" aria-live="assertive">
      <div className={`glass-strong flex items-center justify-between gap-3 border-amber-400/30 p-3 ${motionOff ? '' : 'animate-toast-in'}`}>
        <p className="text-sm text-slate-100">{action.reason}</p>
        <div className="flex shrink-0 gap-2">
          <button className="btn-primary !min-h-0 !py-1.5" onClick={onAccept}>{verb}</button>
          <button className="btn-ghost !min-h-0 !py-1.5" onClick={onDismiss}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}

const PROMPT_OPTIONS = {
  thumbs: [{ v: 'thumbs_up', l: '👍 Going well' }, { v: 'thumbs_down', l: '👎 Struggling' }],
  still_here: [{ v: 'still_here_yes', l: 'Still with it' }, { v: 'still_here_no', l: 'Lost me' }],
  end: [{ v: 'too_easy', l: 'Too easy' }, { v: 'just_right', l: 'Just right' }, { v: 'too_hard', l: 'Too hard' }],
};

function FeedbackPrompt({ prompt, onSubmit, onClose, motionOff }) {
  const title = { thumbs: 'How’s this lesson?', still_here: 'Still with us?', end: 'How was the difficulty?' }[prompt.kind];
  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(90vw,28rem)] -translate-x-1/2" role="dialog" aria-label={title}>
      <div className={`glass-strong p-4 ${motionOff ? '' : 'animate-toast-in'}`}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium">{title}</p>
          <button className="text-xs text-slate-400 hover:text-white" onClick={onClose} aria-label="Dismiss">✕</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {PROMPT_OPTIONS[prompt.kind].map((o) => (
            <button key={o.v} className="btn-ghost" onClick={() => onSubmit(o.v)}>{o.l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}


function Toast({ toast, motionOff }) {
  return (
    <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2" role="status" aria-live="polite">
      <div className={`glass-strong flex items-center gap-3 px-4 py-2 text-sm ${motionOff ? '' : 'animate-toast-in'}`}>
        <span>{toast.message}</span>
        {toast.undo && <button className="text-sky-300 hover:underline" onClick={toast.undo}>Undo</button>}
      </div>
    </div>
  );
}
