import { CONFIG } from './config.js';

/**
 * Pure aggregation helpers for teacher analytics. No DB, no framework — the
 * backend pulls rows, maps them to the plain shapes below, and calls these; the
 * frontend reuses the same functions where handy. Everything here returns
 * derived numbers/labels only (never raw per-frame data), which keeps the
 * privacy guarantee simple to reason about.
 *
 * Tick shape (camelCase): { t, score, zone, emotion, faceDetected }
 * Session shape: { score, validSeconds, startedAt, ... } (score == avg over valid)
 */

/** A tick counts toward engagement only with a real face AND a real score. */
export function isValidTick(tick) {
  return !!(tick && tick.faceDetected) && tick.score != null && Number.isFinite(tick.score);
}

/** Mean of finite numbers, or null when there are none. */
export function mean(nums) {
  const xs = (nums || []).filter((n) => Number.isFinite(n));
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function round1(n) {
  return n == null ? null : Math.round(n * 10) / 10;
}

/** Average engagement over valid ticks only (excludes no-face / multi-person). */
export function avgEngagement(ticks) {
  return mean((ticks || []).filter(isValidTick).map((t) => t.score));
}

/** Share of *valid* ticks that have a face (valid-measurement share), 0..1. */
export function validShare(ticks) {
  const all = ticks || [];
  if (all.length === 0) return null;
  return all.filter(isValidTick).length / all.length;
}

/** Count occurrences of a labelled field over ticks that carry it. */
export function distribution(ticks, field) {
  const out = {};
  for (const t of ticks || []) {
    const v = t[field];
    if (v != null) out[v] = (out[v] || 0) + 1;
  }
  return out;
}

export const zoneDistribution = (ticks) => distribution(ticks, 'zone');
export const emotionDistribution = (ticks) => distribution(ticks, 'emotion');

/** Normalise a distribution map to shares that sum to 1 (empty -> {}). */
export function toShares(dist) {
  const total = Object.values(dist || {}).reduce((a, b) => a + b, 0);
  if (!total) return {};
  const out = {};
  for (const [k, v] of Object.entries(dist)) out[k] = v / total;
  return out;
}

/**
 * Trend over a student's recent session scores (oldest -> newest):
 * compares the mean of the earlier half to the later half within the last
 * TREND_WINDOW sessions. Returns 'up' | 'down' | 'flat'.
 */
export function trend(scores, opts = {}) {
  const window = opts.window ?? CONFIG.ANALYTICS.TREND_WINDOW;
  const margin = opts.margin ?? CONFIG.ANALYTICS.TREND_MARGIN;
  const xs = (scores || []).filter((n) => Number.isFinite(n)).slice(-window);
  if (xs.length < 2) return 'flat';
  const mid = Math.floor(xs.length / 2);
  const first = mean(xs.slice(0, mid || 1));
  const last = mean(xs.slice(mid));
  const delta = last - first;
  if (delta >= margin) return 'up';
  if (delta <= -margin) return 'down';
  return 'flat';
}

/**
 * True when a student should be flagged for a (non-punitive) check-in: their
 * most recent LOW_ENGAGEMENT_SESSIONS valid sessions are all below
 * LOW_ENGAGEMENT_SCORE.
 */
export function flagLowEngagement(scores, opts = {}) {
  const n = opts.sessions ?? CONFIG.ANALYTICS.LOW_ENGAGEMENT_SESSIONS;
  const threshold = opts.score ?? CONFIG.ANALYTICS.LOW_ENGAGEMENT_SCORE;
  const xs = (scores || []).filter((s) => Number.isFinite(s));
  if (xs.length < n) return false;
  return xs.slice(-n).every((s) => s < threshold);
}

/** True when a lesson has enough valid sessions to show averages. */
export function hasEnoughData(validSessionCount, min = CONFIG.ANALYTICS.MIN_VALID_SESSIONS) {
  return validSessionCount >= min;
}

/** Population standard deviation of finite numbers (0 for <2 points). */
export function stddev(nums) {
  const xs = (nums || []).filter((n) => Number.isFinite(n));
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * Class engagement timeline for a lesson: average engagement against percent of
 * the lesson watched, with a spread band (mean ± 1 sd, clamped 0..100).
 *
 * @param {Array<{ticks:Array, durationS?:number}>} sessions each session's ticks
 *   (camelCase) and optional duration; when duration is missing, the session's
 *   own max tick time is used so a short/partial watch still maps onto 0..100%.
 * @param {number} [buckets]
 * @returns {Array<{pct:number, mean:number|null, lo:number, hi:number, n:number}>}
 */
export function classTimeline(sessions, buckets = CONFIG.ANALYTICS.TIMELINE_BUCKETS) {
  const bins = Array.from({ length: buckets }, () => []);
  for (const s of sessions || []) {
    const ticks = (s.ticks || []).filter(isValidTick);
    if (ticks.length === 0) continue;
    const maxT = s.durationS && s.durationS > 0 ? s.durationS : Math.max(...ticks.map((t) => t.t), 0);
    if (!(maxT > 0)) {
      // All ticks at t=0 — drop them into the first bucket.
      for (const t of ticks) bins[0].push(t.score);
      continue;
    }
    for (const t of ticks) {
      const pct = clamp(t.t / maxT, 0, 0.9999);
      bins[Math.floor(pct * buckets)].push(t.score);
    }
  }
  return bins.map((scores, i) => {
    const m = mean(scores);
    const sd = stddev(scores);
    return {
      pct: Math.round(((i + 0.5) / buckets) * 100),
      mean: m == null ? null : round1(m),
      lo: m == null ? 0 : round1(clamp(m - sd, 0, 100)),
      hi: m == null ? 0 : round1(clamp(m + sd, 0, 100)),
      n: scores.length,
    };
  });
}

/**
 * Serialise an array of flat row objects to CSV (derived numbers only). Values
 * are escaped per RFC 4180. Header comes from `columns` (array of {key,label}).
 */
export function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => esc(c.label)).join(',');
  const body = (rows || []).map((r) => columns.map((c) => esc(r[c.key])).join(',')).join('\n');
  return body ? `${header}\n${body}\n` : `${header}\n`;
}
