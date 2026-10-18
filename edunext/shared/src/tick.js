import { CONFIG } from './config.js';
import { categorize, DEFAULT_BOUNDARIES } from './zones.js';
import { subtractBaseline, labelFromProbs, smoothLabels } from './emotion.js';

/**
 * Build one engagement tick from accumulated raw samples. Pure: given the same
 * inputs it always produces the same tick. This is the single implementation of
 * the blink warm-up fix — no UI may compute BPM any other way.
 *
 * @param {object} input
 * @param {number} input.now                  current time (ms)
 * @param {number[]} input.blinkTimestamps    blink times (ms)
 * @param {number[]} input.presenceStamps     1 Hz face-present timestamps (ms)
 * @param {{t:number, probs:Record<string,number>}[]} input.emotionSamples
 * @param {number[]} [input.boundaries]       personalized zone boundaries
 * @param {Record<string,number>|null} [input.emotionBaseline]
 * @param {string[]} [input.prevEmotionLabels] rolling per-sample emotion labels
 * @returns {{t:number, bpm:number|null, zone:string|null, emotion:string|null,
 *            faceDetected:boolean, observedS:number, emotionLabels:string[]}}
 *   `emotionLabels` is internal continuation state for the next tick — it is
 *   NOT part of the server upload payload (see schemas.js).
 */
export function buildTick(input) {
  const {
    now,
    blinkTimestamps = [],
    presenceStamps = [],
    emotionSamples = [],
    boundaries = DEFAULT_BOUNDARIES,
    emotionBaseline = null,
    prevEmotionLabels = [],
  } = input;

  const windowStart = now - CONFIG.BLINK_WINDOW_MS;
  const inWindow = (t) => t <= now && t > windowStart;

  // 1 presence stamp ≈ 1 s of observed face time within the rolling window.
  const observedS = presenceStamps.filter(inWindow).length;
  const blinksInWindow = blinkTimestamps.filter(inWindow).length;

  let bpm = null;
  let zone = null;
  if (observedS >= CONFIG.MIN_OBSERVED_S_FOR_BPM) {
    bpm = (blinksInWindow * 60) / observedS;
    zone = categorize(bpm, boundaries);
  }

  // Emotion: only this tick's samples (last TICK_MS), labeled and smoothed with
  // the recent label history for continuity. No samples this tick -> null.
  const recentSamples = emotionSamples.filter((s) => s.t <= now && s.t > now - CONFIG.TICK_MS);
  let emotion = null;
  let emotionLabels = Array.isArray(prevEmotionLabels) ? prevEmotionLabels.slice() : [];
  if (recentSamples.length > 0) {
    const newLabels = recentSamples.map((s) =>
      labelFromProbs(emotionBaseline ? subtractBaseline(s.probs, emotionBaseline) : s.probs)
    );
    emotionLabels = [...emotionLabels, ...newLabels].slice(-CONFIG.EMOTION_SMOOTH_N);
    emotion = smoothLabels(emotionLabels, CONFIG.EMOTION_SMOOTH_N);
  }

  // Face is "present" if any presence stamp lands in the last 3 s.
  const faceDetected = presenceStamps.some((t) => t <= now && t > now - 3000);

  return { t: now, bpm, zone, emotion, faceDetected, observedS, emotionLabels };
}
