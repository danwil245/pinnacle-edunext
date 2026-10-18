import { CONFIG } from './config.js';

/**
 * Learning-style signal: which content format (visual vs practical) the learner
 * engages with MORE. This is a lightweight engagement-preference estimate, not
 * an innate "learning style" trait (phrased honestly in the UI).
 *
 * Stats are weighted sums of mean engagement per variant:
 *   { visual: {sum, w}, practical: {sum, w} }  where mean = sum / w.
 */

/** Fresh, empty stats object. */
export function createStyleStats() {
  return { visual: { sum: 0, w: 0 }, practical: { sum: 0, w: 0 } };
}

function clone(stats) {
  return {
    visual: { sum: stats.visual.sum, w: stats.visual.w },
    practical: { sum: stats.practical.sum, w: stats.practical.w },
  };
}

function addWeighted(stats, variant, meanScore, weight) {
  const next = clone(stats);
  next[variant].sum += meanScore * weight;
  next[variant].w += weight;
  return next;
}

/**
 * Add the onboarding style-probe results (both variants) with PROBE_WEIGHT each.
 * @param {object} stats
 * @param {{visual:{meanScore:number}, practical:{meanScore:number}}} probe
 */
export function addProbe(stats, probe) {
  let next = clone(stats);
  if (probe?.visual && Number.isFinite(probe.visual.meanScore)) {
    next = addWeighted(next, 'visual', probe.visual.meanScore, CONFIG.STYLE.PROBE_WEIGHT);
  }
  if (probe?.practical && Number.isFinite(probe.practical.meanScore)) {
    next = addWeighted(next, 'practical', probe.practical.meanScore, CONFIG.STYLE.PROBE_WEIGHT);
  }
  return next;
}

/**
 * Add a completed lesson session, weighted LESSON_WEIGHT — but only if the
 * session had enough valid (face-observed, scored) time to be trustworthy.
 * Protects against flipping style on one noisy session.
 */
export function addSession(stats, variant, meanScore, validSeconds) {
  if (variant !== 'visual' && variant !== 'practical') return clone(stats);
  if (!Number.isFinite(meanScore) || validSeconds < CONFIG.STYLE.MIN_LESSON_VALID_S) {
    return clone(stats);
  }
  return addWeighted(stats, variant, meanScore, CONFIG.STYLE.LESSON_WEIGHT);
}

/**
 * Detect the learner's current style + confidence.
 * @returns {{style:'visual'|'practical'|'balanced'|'unknown', confidence:number}}
 */
export function detectStyle(stats) {
  const { visual, practical } = stats;
  if (visual.w <= 0 || practical.w <= 0) return { style: 'unknown', confidence: 0 };

  const meanVisual = visual.sum / visual.w;
  const meanPractical = practical.sum / practical.w;
  const diff = meanVisual - meanPractical;
  const totalW = visual.w + practical.w;
  const weightTerm = Math.min(1, totalW / CONFIG.STYLE.CONF_WEIGHT_SCALE);

  if (Math.abs(diff) < CONFIG.STYLE.BALANCED_MARGIN) {
    return { style: 'balanced', confidence: weightTerm };
  }
  const style = diff > 0 ? 'visual' : 'practical';
  const diffTerm = Math.min(1, Math.abs(diff) / CONFIG.STYLE.CONF_DIFF_SCALE);
  return { style, confidence: diffTerm * weightTerm };
}

/**
 * Pick which variant to serve. A confident visual/practical learner gets their
 * preferred variant, except an EXPLORE_RATE fraction of the time (to keep
 * refining the estimate). Low confidence / balanced / unknown alternate 50/50.
 * `rng` (→ [0,1)) is injected so tests are deterministic.
 */
export function chooseVariant(style, confidence, rng = Math.random) {
  if ((style === 'visual' || style === 'practical') && confidence >= CONFIG.STYLE.LOW_CONF) {
    const other = style === 'visual' ? 'practical' : 'visual';
    return rng() < CONFIG.STYLE.EXPLORE_RATE ? other : style;
  }
  return rng() < 0.5 ? 'visual' : 'practical';
}
