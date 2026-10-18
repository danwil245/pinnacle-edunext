import { describe, it, expect } from 'vitest';
import { categorize, personalizeBoundaries, DEFAULT_BOUNDARIES } from '../src/zones.js';

describe('categorize', () => {
  it('maps BPM to zones at the default boundaries', () => {
    expect(categorize(0)).toBe('hyperfocused');
    expect(categorize(7)).toBe('hyperfocused');
    expect(categorize(8)).toBe('attentive'); // edge: bpm < b0 is false at 8
    expect(categorize(14)).toBe('attentive');
    expect(categorize(15)).toBe('neutral');
    expect(categorize(20)).toBe('neutral');
    expect(categorize(21)).toBe('fatigued');
    expect(categorize(30)).toBe('fatigued');
    expect(categorize(31)).toBe('sleepy');
    expect(categorize(99)).toBe('sleepy');
  });

  it('honors custom boundaries', () => {
    const b = [5, 10, 15, 20];
    expect(categorize(4, b)).toBe('hyperfocused');
    expect(categorize(5, b)).toBe('attentive');
    expect(categorize(19, b)).toBe('fatigued');
    expect(categorize(20, b)).toBe('sleepy');
  });
});

describe('personalizeBoundaries', () => {
  it('rescales valid engaged/neutral reads and stays strictly increasing', () => {
    const { boundaries, personalized } = personalizeBoundaries({ engagedBpm: 10, neutralBpm: 20 });
    expect(personalized).toBe(true);
    expect(boundaries).toHaveLength(4);
    for (let i = 1; i < boundaries.length; i++) {
      expect(boundaries[i]).toBeGreaterThan(boundaries[i - 1]);
    }
  });

  it('falls back when reads are within 2 BPM', () => {
    const r = personalizeBoundaries({ engagedBpm: 12, neutralBpm: 13 });
    expect(r.personalized).toBe(false);
    expect(r.boundaries).toEqual(DEFAULT_BOUNDARIES);
  });

  it('falls back (no inverted boundaries) when engaged > neutral', () => {
    const r = personalizeBoundaries({ engagedBpm: 20, neutralBpm: 10 });
    expect(r.personalized).toBe(false);
    expect(r.boundaries).toEqual(DEFAULT_BOUNDARIES);
  });

  it('falls back on non-finite or non-positive reads', () => {
    expect(personalizeBoundaries({ engagedBpm: NaN, neutralBpm: 20 }).personalized).toBe(false);
    expect(personalizeBoundaries({ engagedBpm: 0, neutralBpm: 20 }).personalized).toBe(false);
    expect(personalizeBoundaries({}).personalized).toBe(false);
  });

  it('returns a fresh default array (not the shared constant) on fallback', () => {
    const r = personalizeBoundaries({});
    expect(r.boundaries).not.toBe(DEFAULT_BOUNDARIES);
    expect(r.boundaries).toEqual(DEFAULT_BOUNDARIES);
  });
});
