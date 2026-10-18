import { CONFIG } from './config.js';

/**
 * Combine the available live signals into a single engagement score (0–100),
 * EMA-smoothed across ticks. Components that aren't available (null) drop out
 * and the remaining weights are renormalized, so a missing camera or emotion
 * model degrades gracefully rather than skewing the score.
 *
 * @param {{ema:number|null}} state   smoothing state (prevEma); pass {} to start
 * @param {{zone:string|null, emotion:string|null, faceDetected:boolean}} tick
 * @param {{t:number, kind?:string, value:string}[]} feedbackEvents
 * @param {number} now  current time (ms)
 * @returns {{score:number|null, level:string|null,
 *            components:{blink:number|null, emotion:number|null, feedback:number|null},
 *            state:{ema:number|null}}}
 */
export function computeEngagement(state, tick, feedbackEvents = [], now) {
  const prevEma = state && Number.isFinite(state.ema) ? state.ema : null;

  const blink = tick.zone != null ? CONFIG.BLINK_SCORE[tick.zone] ?? null : null;
  const emotion = tick.emotion != null ? CONFIG.EMOTION_SCORE[tick.emotion] ?? null : null;

  // Most recent feedback event within the freshness window that maps to a score.
  let feedback = null;
  const freshMs = CONFIG.FEEDBACK_FRESH_S * 1000;
  let newestT = -Infinity;
  for (const ev of feedbackEvents) {
    const score = CONFIG.FEEDBACK_SCORE[ev.value];
    if (score == null) continue;
    if (now - ev.t <= freshMs && ev.t <= now && ev.t > newestT) {
      newestT = ev.t;
      feedback = score;
    }
  }
  const hasFreshFeedback = feedback != null;

  const components = { blink, emotion, feedback };

  // No usable signal, or we can't see the learner and have no fresh feedback.
  const available = [
    ['blink', blink],
    ['emotion', emotion],
    ['feedback', feedback],
  ].filter(([, v]) => v != null);

  if (available.length === 0 || (!tick.faceDetected && !hasFreshFeedback)) {
    return { score: null, level: null, components, state: { ema: prevEma } };
  }

  // Weighted mean over available components, weights renormalized to sum to 1.
  let wSum = 0;
  let acc = 0;
  for (const [key, v] of available) {
    const w = CONFIG.WEIGHTS[key];
    wSum += w;
    acc += w * v;
  }
  const raw = acc / wSum;

  const ema = prevEma == null ? raw : CONFIG.EMA_ALPHA * raw + (1 - CONFIG.EMA_ALPHA) * prevEma;
  const level = ema >= CONFIG.SCORE_LEVELS.high ? 'high' : ema < CONFIG.SCORE_LEVELS.low ? 'low' : 'medium';

  return { score: ema, level, components, state: { ema } };
}
