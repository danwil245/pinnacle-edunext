import { CONFIG } from './config.js';

/**
 * Emotion mapping. Input is 7-class facial-expression probabilities from the
 * in-browser model. This is a deliberately simple HEURISTIC that groups the raw
 * expression classes into learning-relevant labels — it is not a validated
 * affect model (documented honestly in the README / UI).
 */

// The 7 raw expression classes produced by the face-api FaceExpressionNet.
export const EMOTION_CLASSES = [
  'neutral',
  'happy',
  'sad',
  'angry',
  'fearful',
  'disgusted',
  'surprised',
];

// The learning-relevant labels we map onto.
export const EMOTION_LABELS = ['engaged', 'neutral', 'confused', 'frustrated', 'bored'];

const ZERO_PROBS = Object.freeze(Object.fromEntries(EMOTION_CLASSES.map((c) => [c, 0])));

/** All-neutral distribution, used when baseline subtraction cancels everything. */
function allNeutral() {
  return { ...ZERO_PROBS, neutral: 1 };
}

/**
 * Subtract a per-class neutral baseline, clamp negatives to zero, and
 * renormalize. If everything cancels (sum ~0) return an all-neutral
 * distribution. A null/undefined baseline returns a normalized copy of probs.
 *
 * @param {Record<string,number>} probs
 * @param {Record<string,number>|null} neutralBaseline
 * @returns {Record<string,number>}
 */
export function subtractBaseline(probs, neutralBaseline) {
  const out = {};
  let sum = 0;
  for (const c of EMOTION_CLASSES) {
    const base = neutralBaseline ? neutralBaseline[c] || 0 : 0;
    const v = Math.max(0, (probs?.[c] || 0) - base);
    out[c] = v;
    sum += v;
  }
  if (sum <= 1e-9) return allNeutral();
  for (const c of EMOTION_CLASSES) out[c] /= sum;
  return out;
}

/**
 * Collapse 7-class probabilities to a learning label by grouping classes and
 * picking the largest group mass above EMOTION_THRESH; otherwise 'neutral'.
 *   engaged     = happy
 *   frustrated  = angry + disgusted
 *   confused    = fearful + surprised
 *   bored       = sad
 *
 * @param {Record<string,number>} probs (already baseline-subtracted if a baseline exists)
 * @returns {string} one of EMOTION_LABELS
 */
export function labelFromProbs(probs) {
  if (!probs) return 'neutral';
  const groups = {
    engaged: probs.happy || 0,
    frustrated: (probs.angry || 0) + (probs.disgusted || 0),
    confused: (probs.fearful || 0) + (probs.surprised || 0),
    bored: probs.sad || 0,
  };
  let best = 'neutral';
  let bestMass = CONFIG.EMOTION_THRESH; // must exceed the threshold to beat neutral
  for (const [label, mass] of Object.entries(groups)) {
    if (mass > bestMass) {
      bestMass = mass;
      best = label;
    }
  }
  return best;
}

/**
 * Mode of the last N labels; ties resolved toward the most recent.
 * @param {string[]} labels
 * @param {number} [n]
 * @returns {string|null}
 */
export function smoothLabels(labels, n = CONFIG.EMOTION_SMOOTH_N) {
  if (!labels || labels.length === 0) return null;
  const window = labels.slice(-n);
  const counts = {};
  for (const l of window) counts[l] = (counts[l] || 0) + 1;
  const max = Math.max(...Object.values(counts));
  // Walk from the most recent backward; first label hitting the max count wins
  // the tie (most-recent resolution).
  for (let i = window.length - 1; i >= 0; i--) {
    if (counts[window[i]] === max) return window[i];
  }
  return window[window.length - 1];
}
