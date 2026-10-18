import { CONFIG } from './config.js';

const C = CONFIG.CURATION;

/** Fresh curation state (consecutive-tick counters + last action time). */
export function createCurationState() {
  return {
    breakTicks: 0, // zone in {fatigued, sleepy}
    replayTicks: 0, // emotion in {confused, frustrated}
    switchTicks: 0, // score < SWITCH_SCORE
    slowTicks: 0, // score < SLOWDOWN_SCORE
    speedTicks: 0, // score >= SPEEDUP_SCORE
    lastActionAt: null, // ms
  };
}

const inc = (cond, n) => (cond ? n + 1 : 0);

function otherVariant(v) {
  return v === 'visual' ? 'practical' : 'visual';
}

/**
 * Deterministic adaptive-curation state machine. Updates consecutive-tick
 * counters, then (respecting warm-up + cooldown) emits at most one action per
 * tick in strict priority order. Counters reset the moment their condition
 * breaks.
 *
 * @param {object} state  from createCurationState()
 * @param {{score:number|null, zone:string|null, emotion:string|null}} tickInfo
 * @param {object} ctx
 * @param {number} ctx.elapsedS
 * @param {number} ctx.currentRate
 * @param {string} ctx.variant         'visual'|'practical'
 * @param {boolean} ctx.switchedAlready
 * @param {number} ctx.now             ms
 * @returns {{action: null | {type:string, reason:string, payload?:object}, state:object}}
 */
export function evaluateCuration(state, tickInfo, ctx) {
  const next = { ...state };
  const { score, zone, emotion } = tickInfo;

  // --- Update counters (null condition => reset) ---------------------------
  next.breakTicks = inc(zone === 'fatigued' || zone === 'sleepy', next.breakTicks);
  next.replayTicks = inc(emotion === 'confused' || emotion === 'frustrated', next.replayTicks);
  next.switchTicks = inc(score != null && score < C.SWITCH_SCORE, next.switchTicks);
  next.slowTicks = inc(score != null && score < C.SLOWDOWN_SCORE, next.slowTicks);
  next.speedTicks = inc(score != null && score >= C.SPEEDUP_SCORE, next.speedTicks);

  // --- Gates ---------------------------------------------------------------
  if (ctx.elapsedS < C.WARMUP_S) return { action: null, state: next };
  if (next.lastActionAt != null && (ctx.now - next.lastActionAt) / 1000 < C.COOLDOWN_S) {
    return { action: null, state: next };
  }

  const fire = (type, reason, payload, resetKey) => {
    next.lastActionAt = ctx.now;
    if (resetKey) next[resetKey] = 0;
    return { action: { type, reason, ...(payload ? { payload } : {}) }, state: next };
  };

  // --- Priority-ordered rules (at most one) --------------------------------
  if (next.breakTicks >= C.BREAK_TICKS) {
    return fire('suggest_break', 'Your blink rate suggests fatigue — a short break may help.', undefined, 'breakTicks');
  }
  if (next.replayTicks >= C.REPLAY_TICKS) {
    return fire(
      'replay_section',
      'You seemed confused here — want to replay the last part?',
      { seekBackS: C.REPLAY_BACK_S, rate: C.REPLAY_RATE },
      'replayTicks'
    );
  }
  if (next.switchTicks >= C.SWITCH_TICKS && !ctx.switchedAlready) {
    return fire(
      'switch_variant',
      'Engagement has been low — trying a different lesson style might click better.',
      { to: otherVariant(ctx.variant) },
      'switchTicks'
    );
  }
  if (ctx.currentRate > C.RATE_MIN && next.slowTicks >= C.SLOWDOWN_TICKS) {
    return fire(
      'slow_down',
      'Slowing down a little to match your pace.',
      { rate: Math.max(C.RATE_MIN, round2(ctx.currentRate - C.RATE_STEP)) },
      'slowTicks'
    );
  }
  if (ctx.currentRate < C.RATE_MAX && next.speedTicks >= C.SPEEDUP_TICKS) {
    return fire(
      'speed_up',
      "You're highly engaged — nudging the pace up.",
      { rate: Math.min(C.RATE_MAX, round2(ctx.currentRate + C.RATE_STEP)) },
      'speedTicks'
    );
  }

  return { action: null, state: next };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Fresh feedback-prompt scheduling state. */
export function createPromptState() {
  return { promptsShown: 0, lastPromptAt: null, firedHalf: false, firedEnd: false };
}

/**
 * Decide whether to surface an in-lesson feedback prompt this tick. Honors
 * MAX_PER_LESSON and MIN_GAP_S. Prompts at ~50% (thumbs), at the end (thumbs +
 * difficulty), and a "still with us?" check when the score has been low for a
 * while.
 *
 * @param {object} state  from createPromptState()
 * @param {object} ctx
 * @param {number} ctx.elapsedS
 * @param {number} ctx.durationS
 * @param {number} ctx.now            ms
 * @param {boolean} [ctx.atEnd]
 * @param {number} [ctx.lowScoreTicks] consecutive ticks with score < SWITCH_SCORE
 * @returns {{prompt: null | {kind:'thumbs'|'end'|'still_here'}, state:object}}
 */
export function shouldPromptFeedback(state, ctx) {
  const next = { ...state };
  const { MAX_PER_LESSON, MIN_GAP_S } = CONFIG.FEEDBACK_PROMPTS;

  const gateOk =
    next.promptsShown < MAX_PER_LESSON &&
    (next.lastPromptAt == null || (ctx.now - next.lastPromptAt) / 1000 >= MIN_GAP_S);

  const emit = (kind) => {
    next.promptsShown += 1;
    next.lastPromptAt = ctx.now;
    return { prompt: { kind }, state: next };
  };

  // End-of-lesson prompt is highest priority (it is the last chance to ask).
  if (ctx.atEnd && !next.firedEnd) {
    next.firedEnd = true;
    if (gateOk) return emit('end');
    return { prompt: null, state: next };
  }
  if (!gateOk) return { prompt: null, state: next };

  if ((ctx.lowScoreTicks || 0) >= 6) {
    return emit('still_here');
  }
  if (!next.firedHalf && ctx.durationS > 0 && ctx.elapsedS >= 0.5 * ctx.durationS) {
    next.firedHalf = true;
    return emit('thumbs');
  }

  return { prompt: null, state: next };
}
