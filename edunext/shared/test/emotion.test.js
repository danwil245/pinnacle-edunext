import { describe, it, expect } from 'vitest';
import { subtractBaseline, labelFromProbs, smoothLabels, EMOTION_CLASSES } from '../src/emotion.js';

function probs(partial) {
  const base = Object.fromEntries(EMOTION_CLASSES.map((c) => [c, 0]));
  return { ...base, ...partial };
}

describe('subtractBaseline', () => {
  it('clamps negatives to zero and renormalizes to sum 1', () => {
    const out = subtractBaseline(probs({ happy: 0.6, neutral: 0.4 }), probs({ neutral: 0.5, happy: 0.1 }));
    const sum = Object.values(out).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(out.neutral).toBe(0); // 0.4 - 0.5 clamped to 0
    expect(out.happy).toBeCloseTo(1, 6); // only positive class left
  });

  it('returns all-neutral when everything cancels', () => {
    const out = subtractBaseline(probs({ neutral: 0.5, happy: 0.5 }), probs({ neutral: 0.9, happy: 0.9 }));
    expect(out.neutral).toBe(1);
    expect(out.happy).toBe(0);
  });

  it('treats a null baseline as a normalized passthrough', () => {
    const out = subtractBaseline(probs({ happy: 0.5, neutral: 0.5 }), null);
    expect(out.happy).toBeCloseTo(0.5, 6);
    expect(out.neutral).toBeCloseTo(0.5, 6);
  });
});

describe('labelFromProbs', () => {
  it('labels engaged / frustrated / confused / bored by group mass', () => {
    expect(labelFromProbs(probs({ happy: 0.5 }))).toBe('engaged');
    expect(labelFromProbs(probs({ angry: 0.2, disgusted: 0.2 }))).toBe('frustrated');
    expect(labelFromProbs(probs({ fearful: 0.2, surprised: 0.2 }))).toBe('confused');
    expect(labelFromProbs(probs({ sad: 0.4 }))).toBe('bored');
  });

  it('falls back to neutral when no group clears the threshold', () => {
    expect(labelFromProbs(probs({ happy: 0.3, neutral: 0.7 }))).toBe('neutral');
    expect(labelFromProbs(probs({ neutral: 1 }))).toBe('neutral');
  });

  it('picks the larger group when several clear the threshold', () => {
    expect(labelFromProbs(probs({ happy: 0.4, sad: 0.5 }))).toBe('bored');
  });
});

describe('smoothLabels', () => {
  it('returns the mode of the last N', () => {
    expect(smoothLabels(['engaged', 'engaged', 'bored'], 3)).toBe('engaged');
  });
  it('resolves ties toward the most recent', () => {
    expect(smoothLabels(['engaged', 'bored', 'engaged', 'bored'], 4)).toBe('bored');
  });
  it('only considers the last N', () => {
    expect(smoothLabels(['bored', 'bored', 'engaged', 'engaged', 'engaged'], 3)).toBe('engaged');
  });
  it('returns null for empty input', () => {
    expect(smoothLabels([], 5)).toBeNull();
  });
});
