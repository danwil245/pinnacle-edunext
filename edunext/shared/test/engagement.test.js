import { describe, it, expect } from 'vitest';
import { computeEngagement } from '../src/engagement.js';
import { CONFIG } from '../src/config.js';

const NOW = 1_000_000;
const faceTick = (zone, emotion) => ({ zone, emotion, faceDetected: true });

describe('computeEngagement', () => {
  it('renormalizes weights over available components', () => {
    // attentive=100, engaged=100, no feedback -> 100 regardless of weights
    const r = computeEngagement({}, faceTick('attentive', 'engaged'), [], NOW);
    expect(r.score).toBeCloseTo(100, 6);
    expect(r.level).toBe('high');
    expect(r.components).toEqual({ blink: 100, emotion: 100, feedback: null });
  });

  it('uses only the blink component when emotion is missing', () => {
    const r = computeEngagement({}, faceTick('fatigued', null), [], NOW);
    expect(r.score).toBeCloseTo(CONFIG.BLINK_SCORE.fatigued, 6); // 30
    expect(r.level).toBe('low');
  });

  it('includes fresh feedback and renormalizes', () => {
    const r = computeEngagement({}, faceTick('neutral', null), [{ t: NOW - 1000, value: 'thumbs_up' }], NOW);
    // blink=65 (w .45), feedback=100 (w .20) -> (0.45*65 + 0.2*100)/0.65
    const expected = (0.45 * 65 + 0.2 * 100) / 0.65;
    expect(r.score).toBeCloseTo(expected, 6);
  });

  it('ignores feedback older than the freshness window', () => {
    const old = NOW - (CONFIG.FEEDBACK_FRESH_S * 1000 + 1);
    const r = computeEngagement({}, faceTick('neutral', null), [{ t: old, value: 'thumbs_up' }], NOW);
    expect(r.components.feedback).toBeNull();
    expect(r.score).toBeCloseTo(65, 6);
  });

  it('EMA-smooths across ticks (first value = raw)', () => {
    const first = computeEngagement({}, faceTick('attentive', 'engaged'), [], NOW); // 100
    const second = computeEngagement(first.state, faceTick('sleepy', 'bored'), [], NOW + 5000);
    const raw2 = (0.45 * CONFIG.BLINK_SCORE.sleepy + 0.35 * CONFIG.EMOTION_SCORE.bored) / 0.8;
    const expected = CONFIG.EMA_ALPHA * raw2 + (1 - CONFIG.EMA_ALPHA) * 100;
    expect(second.score).toBeCloseTo(expected, 6);
  });

  it('returns null and preserves state when the face is lost with no fresh feedback', () => {
    const prev = computeEngagement({}, faceTick('attentive', 'engaged'), [], NOW);
    const lost = computeEngagement(prev.state, { zone: null, emotion: null, faceDetected: false }, [], NOW + 5000);
    expect(lost.score).toBeNull();
    expect(lost.level).toBeNull();
    expect(lost.state.ema).toBeCloseTo(prev.state.ema, 6);
  });

  it('can still score from fresh feedback when the face is lost', () => {
    const r = computeEngagement(
      {},
      { zone: null, emotion: null, faceDetected: false },
      [{ t: NOW - 1000, value: 'thumbs_up' }],
      NOW
    );
    expect(r.score).toBeCloseTo(100, 6);
  });
});
