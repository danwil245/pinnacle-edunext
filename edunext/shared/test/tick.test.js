import { describe, it, expect } from 'vitest';
import { buildTick } from '../src/tick.js';
import { EMOTION_CLASSES } from '../src/emotion.js';

const NOW = 1_000_000;

// n presence stamps, one per second ending at `now` (all within the 60s window).
function presence(n, now = NOW) {
  return Array.from({ length: n }, (_, i) => now - i * 1000);
}
function probs(partial) {
  const base = Object.fromEntries(EMOTION_CLASSES.map((c) => [c, 0]));
  return { ...base, ...partial };
}

describe('buildTick — BPM warm-up', () => {
  it('returns null bpm/zone before MIN_OBSERVED_S_FOR_BPM of face time', () => {
    const t = buildTick({ now: NOW, blinkTimestamps: presence(5), presenceStamps: presence(10) });
    expect(t.bpm).toBeNull();
    expect(t.zone).toBeNull();
    expect(t.observedS).toBe(10);
  });

  it('computes exact BPM once enough face time is observed', () => {
    const t = buildTick({
      now: NOW,
      blinkTimestamps: presence(15),
      presenceStamps: presence(60),
    });
    expect(t.observedS).toBe(60);
    expect(t.bpm).toBeCloseTo(15, 6); // 15 blinks * 60 / 60s
    expect(t.zone).toBe('neutral');
  });

  it('scales BPM by observed face seconds (face loss)', () => {
    const t = buildTick({
      now: NOW,
      blinkTimestamps: presence(15),
      presenceStamps: presence(30),
    });
    expect(t.observedS).toBe(30);
    expect(t.bpm).toBeCloseTo(30, 6); // 15 * 60 / 30
  });
});

describe('buildTick — emotion + presence', () => {
  it('returns null emotion when there are no samples', () => {
    const t = buildTick({ now: NOW, presenceStamps: presence(60) });
    expect(t.emotion).toBeNull();
  });

  it('labels and smooths recent emotion samples', () => {
    const t = buildTick({
      now: NOW,
      presenceStamps: presence(60),
      emotionSamples: [
        { t: NOW - 500, probs: probs({ happy: 0.8 }) },
        { t: NOW - 100, probs: probs({ happy: 0.9 }) },
      ],
    });
    expect(t.emotion).toBe('engaged');
    expect(t.emotionLabels.length).toBeGreaterThan(0);
  });

  it('ignores emotion samples older than one tick', () => {
    const t = buildTick({
      now: NOW,
      presenceStamps: presence(60),
      emotionSamples: [{ t: NOW - 9000, probs: probs({ happy: 0.9 }) }],
    });
    expect(t.emotion).toBeNull();
  });

  it('sets faceDetected from presence within the last 3s', () => {
    expect(buildTick({ now: NOW, presenceStamps: [NOW - 1000] }).faceDetected).toBe(true);
    expect(buildTick({ now: NOW, presenceStamps: [NOW - 5000] }).faceDetected).toBe(false);
  });
});
