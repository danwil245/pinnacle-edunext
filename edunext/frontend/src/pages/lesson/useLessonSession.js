import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CONFIG,
  computeEngagement,
  evaluateCuration,
  createCurationState,
  shouldPromptFeedback,
  createPromptState,
} from '@edunext/shared';
import { api, beaconTicks } from '../../api/client.js';
import { useTracking } from '../../tracking/TrackingContext.js';
import { useTickStream } from '../../tracking/useTickStream.js';

const FLUSH_MS = 15000;
const SUGGESTION_TTL_MS = 20000;
const BREAK_S = CONFIG.BREAK.LENGTH_S; // suggested break length (from CONFIG)

/**
 * Orchestrates a lesson session: create -> per-tick engagement + curation +
 * feedback prompts -> apply actions -> batch/flush ticks -> end + summary.
 * Playback is driven through a MediaController (`mediaRef.current`) so the same
 * curation actions work for a self-hosted <video> and a YouTube IFrame player.
 */
export function useLessonSession({ lessonId, durationS, boundaries, emotionBaseline, mediaRef, preview = false }) {
  const tracking = useTracking();

  const [phase, setPhase] = useState('idle'); // idle|playing|paused|ended
  const [variant, setVariant] = useState(null);
  const [engagement, setEngagement] = useState(null);
  const [tickView, setTickView] = useState(null);
  const [lastAction, setLastAction] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [feedbackPrompt, setFeedbackPrompt] = useState(null);
  const [toast, setToast] = useState(null);
  const [rate, setRate] = useState(1);
  const [breakLeft, setBreakLeft] = useState(0);
  const [summary, setSummary] = useState(null);

  const sessionIdRef = useRef(null);
  const startClockRef = useRef(null);
  const engStateRef = useRef({ ema: null });
  const curStateRef = useRef(createCurationState());
  const promptStateRef = useRef(createPromptState());
  const feedbackRef = useRef([]); // {t, value} in session-relative ms
  const bufferRef = useRef([]);
  const rateRef = useRef(1);
  const switchedRef = useRef(false);
  const variantRef = useRef(null);
  const phaseRef = useRef('idle');
  const suggestionTimerRef = useRef(null);
  const breakSnoozeUntilRef = useRef(0); // tracker-clock ms; suppress break prompt until then
  const suggestionRef = useRef(null);
  phaseRef.current = phase;
  suggestionRef.current = suggestion;

  const { tick } = useTickStream({ boundaries, emotionBaseline, active: phase !== 'idle' && phase !== 'ended' });

  const relNow = useCallback(() => Math.max(0, Math.round(tracking.getNow() - (startClockRef.current ?? tracking.getNow()))), [tracking]);

  const flush = useCallback(async () => {
    if (!sessionIdRef.current || bufferRef.current.length === 0) return;
    const batch = bufferRef.current.splice(0, bufferRef.current.length);
    // Awaitable so `end()` can guarantee ticks are persisted before the server
    // computes the summary (otherwise a short lesson's only flush races the end
    // request and the summary comes back empty).
    await api(`/sessions/${sessionIdRef.current}/ticks`, { method: 'POST', body: { ticks: batch } }).catch(() => {
      // best-effort; a failed flush shouldn't break the lesson
    });
  }, []);

  const logCuration = useCallback((action, outcome) => {
    if (!sessionIdRef.current) return;
    api(`/sessions/${sessionIdRef.current}/curation`, {
      method: 'POST',
      body: { t: relNow(), action: action.type, reason: action.reason, outcome },
    }).catch(() => {});
  }, [relNow]);

  const start = useCallback(async () => {
    // A lesson runs in real time: reset any fast mock time-scale left over from
    // onboarding calibration (which uses 10×) so engagement/curation pace is real.
    if (tracking.source === 'mock') tracking.setTimeScale(1);
    if (!tracking.started) tracking.start();
    // Preview (teacher "View as student"): never create a session, so no ticks,
    // curation, feedback or summary are persisted (all writes guard on the null
    // sessionId ref). Playback and the HUD still work for a faithful preview.
    let variant = 'visual';
    if (!preview) {
      const res = await api('/sessions', { method: 'POST', body: { lessonId } });
      sessionIdRef.current = res.sessionId;
      variant = res.variant;
    }
    startClockRef.current = tracking.getNow();
    setVariant(variant);
    variantRef.current = variant;
    setPhase('playing');
    mediaRef.current?.play?.();
  }, [lessonId, tracking, mediaRef, preview]);

  // Per-tick pipeline.
  useEffect(() => {
    if (!tick || phaseRef.current !== 'playing') return;
    const now = tick.t;
    const eng = computeEngagement(engStateRef.current, tick, feedbackRef.current, now);
    engStateRef.current = eng.state;
    setEngagement(eng);
    setTickView(tick);

    // Buffer the derived-only upload tick (session-relative time).
    bufferRef.current.push({
      t: relNow(),
      bpm: tick.bpm,
      zone: tick.zone,
      emotion: tick.emotion,
      score: eng.score,
      faceDetected: tick.faceDetected,
      observedS: tick.observedS,
    });

    const elapsedS = (now - startClockRef.current) / 1000;
    const { action, state } = evaluateCuration(
      curStateRef.current,
      { score: eng.score, zone: tick.zone, emotion: tick.emotion },
      { elapsedS, currentRate: rateRef.current, variant: variantRef.current, switchedAlready: switchedRef.current, now }
    );
    curStateRef.current = state;
    // Suppress a break prompt while snoozed ("Remind me later") or while one is
    // already open / a break is running (idempotent — no double prompt).
    if (action) {
      const isBreak = action.type === 'suggest_break';
      const snoozed = isBreak && now < breakSnoozeUntilRef.current;
      const alreadyBreaking = isBreak && (phaseRef.current === 'paused' || suggestionRef.current?.type === 'suggest_break');
      if (!snoozed && !alreadyBreaking) applyAction(action);
    }

    // Feedback prompts.
    const { prompt, state: pState } = shouldPromptFeedback(promptStateRef.current, {
      elapsedS,
      durationS,
      now,
      atEnd: false,
      lowScoreTicks: state.switchTicks,
    });
    promptStateRef.current = pState;
    if (prompt && !feedbackPrompt) setFeedbackPrompt(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  function applyAction(action) {
    setLastAction(action);
    if (action.type === 'speed_up' || action.type === 'slow_down') {
      const prev = rateRef.current;
      const next = action.payload.rate;
      setVideoRate(next);
      logCuration(action, 'auto');
      setToast({
        message: `${action.type === 'speed_up' ? 'Sped up' : 'Slowed down'} to ${next}× — ${action.reason}`,
        undo: () => {
          setVideoRate(prev);
          setToast(null);
        },
      });
      setTimeout(() => setToast((t) => (t && t.message.includes(`${next}×`) ? null : t)), 6000);
    } else {
      // Suggestion requiring a click; auto-dismiss after TTL.
      setSuggestion(action);
      clearTimeout(suggestionTimerRef.current);
      suggestionTimerRef.current = setTimeout(() => {
        setSuggestion((s) => {
          if (s) logCuration(s, 'dismissed');
          return null;
        });
      }, SUGGESTION_TTL_MS);
    }
  }

  // Set the rate, snapped to a rate the player actually supports (YouTube only
  // allows discrete rates) and clamped to the CONFIG floor/ceiling.
  function setVideoRate(r) {
    const m = mediaRef.current;
    const avail = m?.getAvailableRates?.() || [0.5, 0.75, 1, 1.25, 1.5, 2];
    const clamped = Math.max(CONFIG.CURATION.RATE_MIN, Math.min(CONFIG.CURATION.RATE_MAX, r));
    const snapped = avail.reduce((best, x) => (Math.abs(x - clamped) < Math.abs(best - clamped) ? x : best), avail[0]);
    rateRef.current = snapped;
    setRate(snapped);
    m?.setRate?.(snapped);
  }

  const acceptSuggestion = useCallback(() => {
    const action = suggestion;
    if (!action) return;
    clearTimeout(suggestionTimerRef.current);
    logCuration(action, 'accepted');
    if (action.type === 'suggest_break') {
      setPhase('paused');
      mediaRef.current?.pause?.();
      setBreakLeft(BREAK_S);
    } else if (action.type === 'replay_section') {
      const m = mediaRef.current;
      if (m) {
        m.seekTo?.(Math.max(0, (m.getCurrentTime?.() || 0) - action.payload.seekBackS));
        setVideoRate(action.payload.rate);
      }
    } else if (action.type === 'switch_variant') {
      switchedRef.current = true;
      setVariant(action.payload.to);
      variantRef.current = action.payload.to;
      // New variant loads fresh at normal speed.
      rateRef.current = 1;
      setRate(1);
    }
    setSuggestion(null);
  }, [suggestion, logCuration, mediaRef]);

  const dismissSuggestion = useCallback(() => {
    if (suggestion) logCuration(suggestion, 'dismissed');
    clearTimeout(suggestionTimerRef.current);
    setSuggestion(null);
  }, [suggestion, logCuration]);

  const resumeFromBreak = useCallback(() => {
    setBreakLeft(0);
    // Warm-up re-entry: reset the engagement EMA so the first seconds after the
    // break (eyes re-adjusting, settling back in) aren't scored against a stale
    // pre-break low. Also start a short cooldown so the break prompt can't
    // immediately re-fire on resume.
    engStateRef.current = { ema: null };
    breakSnoozeUntilRef.current = tracking.getNow() + CONFIG.CURATION.COOLDOWN_S * 1000;
    setPhase('playing');
    mediaRef.current?.play?.();
  }, [mediaRef, tracking]);

  // Switch to the other lesson variant (used by curation and by the player's
  // embed-error fallback). The new variant's video loads fresh at normal speed.
  const switchVariant = useCallback((to) => {
    switchedRef.current = true;
    variantRef.current = to;
    setVariant(to);
    rateRef.current = 1;
    setRate(1);
    logCuration({ type: 'switch_variant', reason: 'fallback or manual switch' }, 'accepted');
  }, [logCuration]);

  // "Remind me later": dismiss and defer any break prompt for SNOOZE_S.
  const snoozeSuggestion = useCallback(() => {
    const action = suggestionRef.current;
    clearTimeout(suggestionTimerRef.current);
    if (action) logCuration(action, 'snoozed');
    breakSnoozeUntilRef.current = tracking.getNow() + CONFIG.BREAK.SNOOZE_S * 1000;
    setSuggestion(null);
  }, [logCuration, tracking]);

  const submitFeedback = useCallback((value) => {
    const t = relNow();
    feedbackRef.current.push({ t: tracking.getNow(), value }); // engagement reads tracker clock
    setFeedbackPrompt(null);
    if (sessionIdRef.current) {
      api(`/sessions/${sessionIdRef.current}/feedback`, { method: 'POST', body: { t, kind: inferKind(value), value } }).catch(() => {});
    }
  }, [relNow, tracking]);

  const end = useCallback(async (completed) => {
    await flush();
    setPhase('ended');
    mediaRef.current?.setRate?.(1); // reset playback speed on end
    mediaRef.current?.pause?.();
    if (!sessionIdRef.current) return null;
    const res = await api(`/sessions/${sessionIdRef.current}/end`, { method: 'POST', body: { completed } });
    setSummary({ ...res.summary, sessionId: sessionIdRef.current });
    return sessionIdRef.current;
  }, [flush, mediaRef]);

  // Break countdown.
  useEffect(() => {
    if (phase !== 'paused' || breakLeft <= 0) return undefined;
    const id = setInterval(() => setBreakLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [phase, breakLeft]);

  // Periodic flush + flush on unload.
  useEffect(() => {
    const id = setInterval(flush, FLUSH_MS);
    const onUnload = () => {
      if (sessionIdRef.current && bufferRef.current.length) {
        beaconTicks(sessionIdRef.current, bufferRef.current.splice(0, bufferRef.current.length));
      }
    };
    window.addEventListener('pagehide', onUnload);
    return () => {
      clearInterval(id);
      window.removeEventListener('pagehide', onUnload);
      flush();
    };
  }, [flush]);

  return {
    phase,
    variant,
    engagement,
    tick: tickView,
    lastAction,
    suggestion,
    feedbackPrompt,
    toast,
    rate,
    breakLeft,
    breakTotalS: BREAK_S,
    summary,
    start,
    end,
    acceptSuggestion,
    dismissSuggestion,
    snoozeSuggestion,
    switchVariant,
    resumeFromBreak,
    submitFeedback,
    setFeedbackPrompt,
  };
}

function inferKind(value) {
  if (value.startsWith('thumbs')) return 'thumbs';
  if (value === 'too_easy' || value === 'too_hard' || value === 'just_right') return 'difficulty';
  if (value.startsWith('still_here')) return 'still_here';
  return 'feedback';
}
