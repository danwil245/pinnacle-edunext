import { useEffect, useRef, useState } from 'react';
import { CONFIG, buildTick, computeEngagement, DEFAULT_BOUNDARIES } from '@edunext/shared';
import { useTracking } from '../../tracking/TrackingContext.js';
import ClipPlaceholder, { isPlayableSrc } from '../../components/ClipPlaceholder.jsx';

/**
 * Plays one calibration/probe clip and measures it over **observed face time**
 * (not wall-clock): the progress bar advances only while a face is visible, so
 * "no face" pauses the timer and valid face-seconds are what we measure.
 *
 * Reports: { bpm, observedS, emotionProbs|null, meanScore|null, blinks }.
 * `bpm`/`emotionProbs` feed the baseline; `meanScore` (engagement via the
 * shared formula using the given boundaries+baseline) feeds the style probe.
 */
export default function MeasureClip({ src, label, poster, durationS, boundaries = DEFAULT_BOUNDARIES, emotionBaseline = null, bigger, onComplete }) {
  const tracking = useTracking();
  const videoRef = useRef(null);
  const fellBackRef = useRef(false);
  const retriedRef = useRef(false);
  const [clipState, setClipState] = useState('loading'); // loading | playing | needsTap | fallback
  const blinksRef = useRef([]);
  const presenceRef = useRef([]);
  const emotionRef = useRef([]);
  const labelsRef = useRef([]);
  const scoresRef = useRef([]);
  const engRef = useRef({ ema: null });
  const doneRef = useRef(false);
  const [observedS, setObservedS] = useState(0);
  const [blinks, setBlinks] = useState(0);

  useEffect(() => {
    doneRef.current = false;
    blinksRef.current = [];
    presenceRef.current = [];
    emotionRef.current = [];
    labelsRef.current = [];
    scoresRef.current = [];
    engRef.current = { ema: null };

    const unsub = tracking.subscribe((s) => {
      if (s.type === 'blink') blinksRef.current.push(s.t);
      else if (s.type === 'presence') presenceRef.current.push(s.t);
      else if (s.type === 'emotion') emotionRef.current.push({ t: s.t, probs: s.probs });
    });

    // Single driver. Tick cadence is measured on the tracker's CLOCK (virtual
    // under mock time-scale), so a fast mock clip still yields engagement
    // samples, while the camera path ticks every real TICK_MS.
    let lastTickAt = null;
    const id = setInterval(() => {
      const now = tracking.getNow();
      if (lastTickAt == null) lastTickAt = now;
      if (now - lastTickAt >= CONFIG.TICK_MS) {
        lastTickAt = now;
        const tick = buildTick({
          now,
          blinkTimestamps: blinksRef.current,
          presenceStamps: presenceRef.current,
          emotionSamples: emotionRef.current,
          boundaries,
          emotionBaseline,
          prevEmotionLabels: labelsRef.current,
        });
        labelsRef.current = tick.emotionLabels;
        const eng = computeEngagement(engRef.current, tick, [], now);
        engRef.current = eng.state;
        if (eng.score != null) scoresRef.current.push(eng.score);
      }
      const obs = presenceRef.current.length;
      setObservedS(obs);
      setBlinks(blinksRef.current.length);
      if (!doneRef.current && obs >= durationS) {
        doneRef.current = true;
        finish();
      }
    }, 250);

    function finish() {
      clearInterval(id);
      unsub();
      const obs = presenceRef.current.length;
      const scores = scoresRef.current;
      let emotionProbs = null;
      if (emotionRef.current.length > 0) {
        emotionProbs = {};
        const keys = Object.keys(emotionRef.current[0].probs);
        for (const k of keys) emotionProbs[k] = 0;
        for (const s of emotionRef.current) for (const k of keys) emotionProbs[k] += s.probs[k];
        for (const k of keys) emotionProbs[k] /= emotionRef.current.length;
      }
      onComplete({
        bpm: obs > 0 ? (blinksRef.current.length * 60) / obs : null,
        observedS: obs,
        emotionProbs,
        meanScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
        blinks: blinksRef.current.length,
        usedFallback: fellBackRef.current,
      });
    }

    return () => {
      clearInterval(id);
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Muted autoplay is normally allowed; if the browser blocks it, offer a tap.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isPlayableSrc(src)) return undefined;
    const p = v.play?.();
    if (p && typeof p.catch === 'function') p.catch(() => setClipState((s) => (s === 'playing' ? s : 'needsTap')));
    return undefined;
  }, [src]);

  const frac = Math.min(1, observedS / durationS);
  const pct = Math.round(frac * 100);
  const noFace = tracking.source === 'camera' && !tracking.faceDetected;

  // Progress ring geometry.
  const R = 26;
  const C = 2 * Math.PI * R;

  return (
    <div className="space-y-3">
      <div className={`relative overflow-hidden rounded-xl bg-black ${bigger ? 'aspect-video' : 'aspect-video max-h-80'}`}>
        {isPlayableSrc(src) && clipState !== 'fallback' ? (
          <video
            ref={videoRef}
            src={src}
            poster={poster}
            className="h-full w-full object-contain"
            autoPlay
            muted
            playsInline
            loop
            preload="auto"
            onCanPlayThrough={() => setClipState((s) => (s === 'loading' ? 'playing' : s))}
            onPlaying={() => setClipState('playing')}
            onError={() => {
              // Retry once, then fall back to an in-browser placeholder and flag it.
              if (!retriedRef.current && videoRef.current) {
                retriedRef.current = true;
                videoRef.current.load();
              } else {
                fellBackRef.current = true;
                setClipState('fallback');
              }
            }}
          />
        ) : (
          // Clip couldn't load (or no real clip) — a generated placeholder of the
          // same duration; measurement runs on the tracker regardless.
          <ClipPlaceholder title={label} caption="Measuring your attention" className="h-full" />
        )}
        {/* Preparing veil until the clip can play through. */}
        {clipState === 'loading' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-slate-300">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" aria-hidden />
            <span className="ml-2">Preparing clip…</span>
          </div>
        )}
        {clipState === 'needsTap' && (
          <button
            onClick={() => { videoRef.current?.play?.().then(() => setClipState('playing')).catch(() => {}); }}
            className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-medium text-white"
          >
            Tap to start the clip
          </button>
        )}
        {clipState === 'fallback' && (
          <div className="absolute left-2 top-2 rounded bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-200" role="status">
            Using a placeholder clip
          </div>
        )}
        {/* Gentle no-face veil: always mounted, fades in/out (no abrupt pop). */}
        <div
          className={`pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 text-center text-sm text-amber-300 transition-opacity duration-500 ${
            noFace ? 'opacity-100' : 'opacity-0'
          }`}
          role="status"
          aria-hidden={!noFace}
        >
          <span className="max-w-xs px-4">We can’t see you — the timer is paused until your face is visible again.</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {/* Animated progress ring. */}
        <div className="relative shrink-0" aria-hidden>
          <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
            <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
            <circle
              cx="32"
              cy="32"
              r={R}
              fill="none"
              stroke="#0ea5e9"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - frac)}
              style={{ transition: 'stroke-dashoffset 0.4s ease' }}
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center font-mono text-xs tabular-nums text-slate-200">
            {pct}%
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-400">
            <span className="truncate">{label}</span>
            <span className="tabular-nums">{observedS}s / {durationS}s face time</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%`, transition: 'width 0.4s ease' }} />
          </div>
          <div className="mt-1.5 text-xs text-slate-400">
            Blinks detected: <b className="tabular-nums text-slate-200">{blinks}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
