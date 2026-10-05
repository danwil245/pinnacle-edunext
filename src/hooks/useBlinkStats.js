import { useCallback, useEffect, useRef, useState } from 'react';

// Attention zones, keyed by rolling blink rate (blinks per minute).
// Colors mirror tailwind.config.js `zone.*`.
export const ATTENTION_ZONES = [
  { key: 'hyperfocused', label: 'Hyperfocused', color: '#3b82f6', note: 'eye strain risk' },
  { key: 'attentive', label: 'Attentive', color: '#22c55e', note: '' },
  { key: 'neutral', label: 'Neutral', color: '#eab308', note: '' },
  { key: 'fatigued', label: 'Fatigued', color: '#f97316', note: '' },
  { key: 'sleepy', label: 'Sleepy', color: '#ef4444', note: '' },
];

const ZONE_BY_KEY = Object.fromEntries(ATTENTION_ZONES.map((z) => [z.key, z]));

// Default zone boundaries (blinks/min) — used until a learner has an
// onboarding-calibrated profile. Four boundaries define five zones:
//   bpm <  b0        -> hyperfocused
//   bpm <  b1 (8-14)  -> attentive
//   bpm <  b2 (15-20) -> neutral
//   bpm <  b3 (21-30) -> fatigued
//   bpm >= b3 (31+)   -> sleepy
export const DEFAULT_BOUNDARIES = [8, 15, 21, 31];

/** Map a blink rate (BPM) to its attention zone, optionally against a
 * personalized set of boundaries produced by onboarding calibration. */
export function categorize(bpm, boundaries = DEFAULT_BOUNDARIES) {
  const [b0, b1, b2, b3] = boundaries;
  if (bpm < b0) return ZONE_BY_KEY.hyperfocused;
  if (bpm < b1) return ZONE_BY_KEY.attentive;
  if (bpm < b2) return ZONE_BY_KEY.neutral;
  if (bpm < b3) return ZONE_BY_KEY.fatigued;
  return ZONE_BY_KEY.sleepy;
}

// Reference anchors, in "default" BPM space, used to rescale a learner's two
// calibration readings into personalized zone boundaries: the center of the
// default Attentive band (an "engaged" reference point) and the center of
// the default Neutral band (a "resting, not particularly engaged" point).
const DEFAULT_ENGAGED_ANCHOR = 11.5; // center of default Attentive band (8-14)
const DEFAULT_NEUTRAL_ANCHOR = 18; // center of default Neutral band (15-20)
const MIN_SEPARATION_BPM = 2; // calibration reads closer than this are too noisy to trust

/**
 * Turn two onboarding calibration readings — average BPM while watching an
 * engaging clip vs. a neutral one — into a personalized set of zone
 * boundaries. We linearly rescale the default boundaries so the learner's
 * own two data points land where the default "engaged" and "neutral"
 * anchors used to sit; every other boundary shifts proportionally.
 *
 * Falls back to the shared default boundaries (and personalized: false) if
 * either reading is missing/non-finite, or the two reads are too close
 * together to say anything meaningful about this learner.
 */
export function personalizeBoundaries({ engagedBpm, neutralBpm }) {
  const valid =
    Number.isFinite(engagedBpm) &&
    Number.isFinite(neutralBpm) &&
    engagedBpm > 0 &&
    neutralBpm > 0 &&
    Math.abs(neutralBpm - engagedBpm) >= MIN_SEPARATION_BPM;

  if (!valid) {
    return { boundaries: DEFAULT_BOUNDARIES, personalized: false };
  }

  const scale = (neutralBpm - engagedBpm) / (DEFAULT_NEUTRAL_ANCHOR - DEFAULT_ENGAGED_ANCHOR);
  const map = (x) => engagedBpm + (x - DEFAULT_ENGAGED_ANCHOR) * scale;

  const raw = DEFAULT_BOUNDARIES.map((x) => Math.max(1, Math.round(map(x) * 10) / 10));
  // Guard against the scaling compressing or inverting the ordering.
  const boundaries = raw.map((v, i) => (i === 0 ? v : Math.max(v, raw[i - 1] + 1)));

  return { boundaries, personalized: true };
}

// Blink-duration histogram buckets (ms).
export const DURATION_BUCKETS = [
  { key: 'short', label: 'Short', sub: '<150ms', test: (d) => d < 150 },
  { key: 'medium', label: 'Medium', sub: '150–300ms', test: (d) => d >= 150 && d <= 300 },
  { key: 'long', label: 'Long', sub: '>300ms', test: (d) => d > 300 },
];

const ROLLING_WINDOW_MS = 60_000; // BPM is computed over the last 60s
const TICK_MS = 5_000; // recompute + push to charts every 5s
const BPM_HISTORY_MS = 120_000; // keep last 2 minutes of BPM points
const MAX_TIMELINE = 240; // cap timeline samples (~20 min) for the chart

function fmtElapsed(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * useBlinkStats owns the blink store and derives all chart/stat values on a 5s
 * cadence. Raw blinks live in refs; only the aggregated, render-worthy data is
 * promoted to state.
 *
 * @param {object} opts
 * @param {React.RefObject<boolean>} opts.activeRef - false while no face is
 *   detected, which pauses BPM sampling. A ref (not a prop) avoids a circular
 *   dependency with useFaceMesh, which consumes this hook's recordBlink.
 * @param {number[]} [opts.boundaries] - personalized zone boundaries from
 *   onboarding calibration; defaults to DEFAULT_BOUNDARIES until a learner
 *   has calibrated.
 */
export function useBlinkStats({ activeRef, boundaries = DEFAULT_BOUNDARIES }) {
  // Timestamps of blinks within the rolling window (pruned each tick).
  const recentRef = useRef([]);
  // Session-long aggregates that must not grow unbounded.
  const aggregateRef = useRef({
    total: 0,
    durations: { short: 0, medium: 0, long: 0 },
  });
  const sessionStartRef = useRef(Date.now());
  const ticksRef = useRef([]); // every zone key sampled, whole session
  // Running aggregates for average BPM across the whole session.
  const runningSumRef = useRef(0);
  const runningCountRef = useRef(0);
  // Keep the latest boundaries readable from the tick loop without
  // re-subscribing the interval every time they change.
  const boundariesRef = useRef(boundaries);
  boundariesRef.current = boundaries;

  const [bpmData, setBpmData] = useState([]);
  const [timelineData, setTimelineData] = useState([]);
  const [currentBpm, setCurrentBpm] = useState(0);
  const [currentZone, setCurrentZone] = useState(() => categorize(0, boundaries));
  const [stats, setStats] = useState({
    totalBlinks: 0,
    avgBpm: 0,
    longestFocusStreakMs: 0,
    mostFrequentZone: null,
  });

  // Stable callback handed to useFaceMesh — records one detected blink.
  const recordBlink = useCallback(({ t, duration }) => {
    recentRef.current.push(t);
    const agg = aggregateRef.current;
    agg.total += 1;
    const bucket = DURATION_BUCKETS.find((b) => b.test(duration));
    if (bucket) agg.durations[bucket.key] += 1;
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      // Prune the rolling window so it only holds the last 60s of blinks.
      recentRef.current = recentRef.current.filter(
        (t) => now - t <= ROLLING_WINDOW_MS
      );

      // Pause BPM while no face is present; charts simply don't advance.
      if (!activeRef.current) return;

      // Window is exactly 60s, so count == blinks per minute.
      const bpm = recentRef.current.length;
      const zone = categorize(bpm, boundariesRef.current);
      setCurrentBpm(bpm);
      setCurrentZone(zone);

      const label = fmtElapsed(now - sessionStartRef.current);

      setBpmData((prev) => {
        const next = [...prev, { time: label, bpm, t: now, zone: zone.key }];
        return next.filter((d) => now - d.t <= BPM_HISTORY_MS);
      });

      ticksRef.current.push(zone.key);
      setTimelineData((prev) => {
        const next = [...prev, { time: label, value: 1, zone: zone.key, bpm }];
        return next.slice(-MAX_TIMELINE);
      });

      // --- Session stats -------------------------------------------------
      const ticks = ticksRef.current;
      const agg = aggregateRef.current;

      // Average BPM across all samples this session (running sum / count).
      runningSumRef.current += bpm;
      runningCountRef.current += 1;
      const avgBpm = runningSumRef.current / runningCountRef.current;

      // Longest "Attentive" streak (consecutive attentive ticks * 5s).
      let longest = 0;
      let run = 0;
      for (const k of ticks) {
        if (k === 'attentive') {
          run += 1;
          longest = Math.max(longest, run);
        } else {
          run = 0;
        }
      }

      // Most frequent zone across the session.
      const counts = {};
      for (const k of ticks) counts[k] = (counts[k] || 0) + 1;
      let mostFrequentZone = null;
      let best = -1;
      for (const [k, c] of Object.entries(counts)) {
        if (c > best) {
          best = c;
          mostFrequentZone = k;
        }
      }

      setStats({
        totalBlinks: agg.total,
        avgBpm,
        longestFocusStreakMs: longest * TICK_MS,
        mostFrequentZone,
      });
    };

    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Derive the duration histogram from current aggregates on each render.
  const durationData = DURATION_BUCKETS.map((b) => ({
    label: b.label,
    sub: b.sub,
    count: aggregateRef.current.durations[b.key],
  }));

  return {
    recordBlink,
    bpmData,
    timelineData,
    durationData,
    currentBpm,
    currentZone,
    stats,
    zoneByKey: ZONE_BY_KEY,
  };
}
