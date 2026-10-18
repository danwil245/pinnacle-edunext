/**
 * Attention zones derived from blink rate (blinks per minute). Moved here from
 * the frontend's useBlinkStats so the backend and frontend categorize blink
 * rates identically. `categorize` returns a zone **key** (string) for
 * serialization + scoring; display metadata lives in ATTENTION_ZONES.
 */

// Ordered low-BPM -> high-BPM. Colors mirror tailwind.config.js `zone.*`.
export const ATTENTION_ZONES = [
  { key: 'hyperfocused', label: 'Hyperfocused', color: '#3b82f6', note: 'eye strain risk' },
  { key: 'attentive', label: 'Attentive', color: '#22c55e', note: '' },
  { key: 'neutral', label: 'Neutral', color: '#eab308', note: '' },
  { key: 'fatigued', label: 'Fatigued', color: '#f97316', note: '' },
  { key: 'sleepy', label: 'Sleepy', color: '#ef4444', note: '' },
];

export const ZONE_KEYS = ATTENTION_ZONES.map((z) => z.key);
export const ZONE_BY_KEY = Object.fromEntries(ATTENTION_ZONES.map((z) => [z.key, z]));

// Default zone boundaries (blinks/min) — four boundaries define five zones:
//   bpm <  b0 -> hyperfocused
//   bpm <  b1 -> attentive
//   bpm <  b2 -> neutral
//   bpm <  b3 -> fatigued
//   bpm >= b3 -> sleepy
export const DEFAULT_BOUNDARIES = [8, 15, 21, 31];

/**
 * Map a blink rate (BPM) to its attention zone key, against default or
 * personalized boundaries.
 * @param {number} bpm
 * @param {number[]} [boundaries]
 * @returns {string} zone key
 */
export function categorize(bpm, boundaries = DEFAULT_BOUNDARIES) {
  const [b0, b1, b2, b3] = boundaries;
  if (bpm < b0) return 'hyperfocused';
  if (bpm < b1) return 'attentive';
  if (bpm < b2) return 'neutral';
  if (bpm < b3) return 'fatigued';
  return 'sleepy';
}

// Reference anchors in default-BPM space: the center of the default Attentive
// band (an "engaged" point) and the center of the default Neutral band (a
// "resting, not particularly engaged" point). A learner's two calibration
// reads are rescaled so they land on these anchors.
const DEFAULT_ENGAGED_ANCHOR = 11.5; // center of default Attentive band (8–14)
const DEFAULT_NEUTRAL_ANCHOR = 18; // center of default Neutral band (15–20)
const MIN_SEPARATION_BPM = 2; // reads closer than this are too noisy to trust

/**
 * Two-point linear rescale turning a learner's engaged/neutral blink reads into
 * personalized zone boundaries. Engaged reads map onto 11.5, neutral onto 18;
 * every default boundary shifts proportionally.
 *
 * Focused attention LOWERS blink rate, so a valid read has engaged < neutral by
 * at least MIN_SEPARATION_BPM. Falls back to defaults (personalized:false) when
 * a read is missing/non-finite, the reads are within 2 BPM, OR they are
 * inverted (engaged >= neutral) — an inverted read must never produce inverted
 * boundaries.
 *
 * @param {{engagedBpm:number, neutralBpm:number}} reads
 * @returns {{boundaries:number[], personalized:boolean}}
 */
export function personalizeBoundaries({ engagedBpm, neutralBpm } = {}) {
  const valid =
    Number.isFinite(engagedBpm) &&
    Number.isFinite(neutralBpm) &&
    engagedBpm > 0 &&
    neutralBpm > 0 &&
    neutralBpm - engagedBpm >= MIN_SEPARATION_BPM; // excludes too-close AND inverted

  if (!valid) {
    return { boundaries: [...DEFAULT_BOUNDARIES], personalized: false };
  }

  const scale = (neutralBpm - engagedBpm) / (DEFAULT_NEUTRAL_ANCHOR - DEFAULT_ENGAGED_ANCHOR);
  const map = (x) => engagedBpm + (x - DEFAULT_ENGAGED_ANCHOR) * scale;

  const raw = DEFAULT_BOUNDARIES.map((x) => Math.max(1, Math.round(map(x) * 10) / 10));
  // Guarantee strictly increasing boundaries even if rounding compresses them.
  const boundaries = raw.map((v, i) => (i === 0 ? v : Math.max(v, raw[i - 1] + 1)));

  return { boundaries, personalized: true };
}
