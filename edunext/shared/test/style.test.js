import { describe, it, expect } from 'vitest';
import {
  createStyleStats,
  addProbe,
  addSession,
  detectStyle,
  chooseVariant,
} from '../src/style.js';
import { CONFIG } from '../src/config.js';

describe('style stats', () => {
  it('addProbe adds both variants with PROBE_WEIGHT', () => {
    const s = addProbe(createStyleStats(), { visual: { meanScore: 80 }, practical: { meanScore: 40 } });
    expect(s.visual.w).toBe(CONFIG.STYLE.PROBE_WEIGHT);
    expect(s.practical.w).toBe(CONFIG.STYLE.PROBE_WEIGHT);
    expect(s.visual.sum).toBe(80 * CONFIG.STYLE.PROBE_WEIGHT);
  });

  it('addSession ignores sessions below MIN_LESSON_VALID_S', () => {
    const s = addSession(createStyleStats(), 'visual', 90, CONFIG.STYLE.MIN_LESSON_VALID_S - 1);
    expect(s.visual.w).toBe(0);
  });

  it('addSession adds a long-enough session with LESSON_WEIGHT', () => {
    const s = addSession(createStyleStats(), 'practical', 70, CONFIG.STYLE.MIN_LESSON_VALID_S);
    expect(s.practical.w).toBe(CONFIG.STYLE.LESSON_WEIGHT);
    expect(s.practical.sum).toBe(70);
  });
});

describe('detectStyle', () => {
  it('is unknown until both variants have weight', () => {
    const s = addProbe(createStyleStats(), { visual: { meanScore: 80 }, practical: { meanScore: 80 } });
    expect(detectStyle(createStyleStats())).toEqual({ style: 'unknown', confidence: 0 });
    // one-sided
    const oneSided = addSession(createStyleStats(), 'visual', 80, 120);
    expect(detectStyle(oneSided).style).toBe('unknown');
    expect(detectStyle(s).style).not.toBe('unknown');
  });

  it('is balanced within BALANCED_MARGIN', () => {
    const s = addProbe(createStyleStats(), { visual: { meanScore: 70 }, practical: { meanScore: 68 } });
    const d = detectStyle(s);
    expect(d.style).toBe('balanced');
    expect(d.confidence).toBeGreaterThan(0);
  });

  it('picks the higher-engagement variant and scales confidence', () => {
    const s = addProbe(createStyleStats(), { visual: { meanScore: 90 }, practical: { meanScore: 40 } });
    const d = detectStyle(s);
    expect(d.style).toBe('visual');
    const diffTerm = Math.min(1, 50 / CONFIG.STYLE.CONF_DIFF_SCALE);
    const weightTerm = Math.min(1, (2 * CONFIG.STYLE.PROBE_WEIGHT) / CONFIG.STYLE.CONF_WEIGHT_SCALE);
    expect(d.confidence).toBeCloseTo(diffTerm * weightTerm, 6);
  });
});

describe('chooseVariant', () => {
  it('serves the preferred variant when confident and rng is above EXPLORE_RATE', () => {
    expect(chooseVariant('visual', 0.9, () => 0.99)).toBe('visual');
  });
  it('explores the other variant when rng is below EXPLORE_RATE', () => {
    expect(chooseVariant('visual', 0.9, () => 0.0)).toBe('practical');
  });
  it('alternates 50/50 when confidence is below LOW_CONF', () => {
    expect(chooseVariant('visual', 0.1, () => 0.4)).toBe('visual');
    expect(chooseVariant('visual', 0.1, () => 0.6)).toBe('practical');
  });
  it('alternates 50/50 for balanced/unknown regardless of confidence', () => {
    expect(chooseVariant('balanced', 1, () => 0.4)).toBe('visual');
    expect(chooseVariant('unknown', 1, () => 0.6)).toBe('practical');
  });
});
