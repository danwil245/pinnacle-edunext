import { useEffect, useRef, useState } from 'react';
import { CONFIG, buildTick, DEFAULT_BOUNDARIES } from '@edunext/shared';
import { useTracking } from './TrackingContext.js';

const PRUNE_MS = CONFIG.BLINK_WINDOW_MS * 1.5;

/**
 * Subscribe to the tracker's raw sample stream, accumulate it in refs, and
 * produce a `Tick` every TICK_MS via the shared `buildTick`. This is the single
 * path from raw samples to ticks — the lesson player and onboarding both use it.
 *
 * @param {object} opts
 * @param {number[]} [opts.boundaries]
 * @param {object|null} [opts.emotionBaseline]
 * @param {boolean} [opts.active]  when false, no ticks are produced
 * @returns {{ tick: object|null, history: object[] }}
 */
export function useTickStream({ boundaries = DEFAULT_BOUNDARIES, emotionBaseline = null, active = true } = {}) {
  const { subscribe, getNow } = useTracking();
  const blinksRef = useRef([]);
  const presenceRef = useRef([]);
  const emotionRef = useRef([]);
  const labelsRef = useRef([]);
  const [tick, setTick] = useState(null);
  const [history, setHistory] = useState([]);

  // Keep latest params readable inside the interval without resubscribing.
  const paramsRef = useRef({ boundaries, emotionBaseline });
  paramsRef.current = { boundaries, emotionBaseline };

  useEffect(() => {
    if (!active) return undefined;

    const unsub = subscribe((s) => {
      if (s.type === 'blink') blinksRef.current.push(s.t);
      else if (s.type === 'presence') presenceRef.current.push(s.t);
      else if (s.type === 'emotion') emotionRef.current.push({ t: s.t, probs: s.probs });
    });

    const id = setInterval(() => {
      const now = getNow();
      // Prune to keep memory bounded.
      const cutoff = now - PRUNE_MS;
      blinksRef.current = blinksRef.current.filter((t) => t >= cutoff);
      presenceRef.current = presenceRef.current.filter((t) => t >= cutoff);
      emotionRef.current = emotionRef.current.filter((s) => s.t >= cutoff);

      const t = buildTick({
        now,
        blinkTimestamps: blinksRef.current,
        presenceStamps: presenceRef.current,
        emotionSamples: emotionRef.current,
        boundaries: paramsRef.current.boundaries,
        emotionBaseline: paramsRef.current.emotionBaseline,
        prevEmotionLabels: labelsRef.current,
      });
      labelsRef.current = t.emotionLabels;
      setTick(t);
      setHistory((h) => [...h.slice(-239), t]);
    }, CONFIG.TICK_MS);

    return () => {
      unsub();
      clearInterval(id);
    };
  }, [active, subscribe, getNow]);

  return { tick, history };
}
