import { describe, it, expect } from 'vitest';
import {
  isValidTick,
  avgEngagement,
  validShare,
  zoneDistribution,
  emotionDistribution,
  toShares,
  trend,
  flagLowEngagement,
  hasEnoughData,
  classTimeline,
  toCsv,
} from '../src/analytics.js';

const tick = (over = {}) => ({ t: 0, score: 70, zone: 'neutral', emotion: 'engaged', faceDetected: true, ...over });

describe('analytics aggregation', () => {
  it('isValidTick needs a face and a real score', () => {
    expect(isValidTick(tick())).toBe(true);
    expect(isValidTick(tick({ faceDetected: false }))).toBe(false);
    expect(isValidTick(tick({ score: null }))).toBe(false);
  });

  it('avgEngagement is null when empty and excludes invalid time', () => {
    expect(avgEngagement([])).toBe(null);
    const ticks = [tick({ score: 80 }), tick({ score: 40, faceDetected: false }), tick({ score: 60 })];
    // invalid (no-face) tick excluded -> mean(80,60) = 70
    expect(avgEngagement(ticks)).toBe(70);
  });

  it('validShare reports the fraction of valid ticks', () => {
    expect(validShare([])).toBe(null);
    expect(validShare([tick(), tick({ faceDetected: false })])).toBe(0.5);
  });

  it('zone/emotion distributions count only labelled ticks', () => {
    const ticks = [tick({ zone: 'attentive' }), tick({ zone: 'attentive' }), tick({ zone: null })];
    expect(zoneDistribution(ticks)).toEqual({ attentive: 2 });
    expect(emotionDistribution([tick({ emotion: 'bored' }), tick({ emotion: null })])).toEqual({ bored: 1 });
  });

  it('toShares normalises to sum 1', () => {
    const s = toShares({ a: 1, b: 3 });
    expect(s.a).toBeCloseTo(0.25);
    expect(s.b).toBeCloseTo(0.75);
    expect(toShares({})).toEqual({});
  });

  it('trend detects up/down/flat with a margin', () => {
    expect(trend([])).toBe('flat');
    expect(trend([50])).toBe('flat');
    expect(trend([40, 45, 50, 70, 80])).toBe('up');
    expect(trend([80, 70, 50, 45, 40])).toBe('down');
    expect(trend([60, 61, 59, 60, 60])).toBe('flat');
  });

  it('flagLowEngagement flags a persistent recent dip only', () => {
    expect(flagLowEngagement([30, 30])).toBe(false); // below min count (3)
    expect(flagLowEngagement([80, 20, 20, 20])).toBe(true);
    expect(flagLowEngagement([20, 20, 80])).toBe(false); // recovered
  });

  it('hasEnoughData respects the minimum', () => {
    expect(hasEnoughData(2)).toBe(false);
    expect(hasEnoughData(3)).toBe(true);
  });

  describe('classTimeline', () => {
    it('is empty-safe', () => {
      const tl = classTimeline([]);
      expect(tl.length).toBe(10);
      expect(tl.every((b) => b.n === 0 && b.mean === null)).toBe(true);
    });

    it('buckets a single session across percent-watched with a band', () => {
      const ticks = [
        tick({ t: 0, score: 100 }),
        tick({ t: 50, score: 50 }),
        tick({ t: 100, score: 0 }),
      ];
      const tl = classTimeline([{ ticks, durationS: 100 }], 2);
      expect(tl.length).toBe(2);
      // t=0 (0%) -> first half; t=50 (50%) and t=100 (clamped) -> second half.
      expect(tl[0].n).toBe(1);
      expect(tl[1].n).toBe(2);
      expect(tl[1].hi).toBeGreaterThanOrEqual(tl[1].mean);
      expect(tl[1].lo).toBeLessThanOrEqual(tl[1].mean);
    });

    it('excludes invalid ticks from the timeline', () => {
      const ticks = [tick({ t: 0, score: 100 }), tick({ t: 10, score: 0, faceDetected: false })];
      const tl = classTimeline([{ ticks, durationS: 100 }], 1);
      expect(tl[0].n).toBe(1);
      expect(tl[0].mean).toBe(100);
    });
  });

  it('toCsv escapes and includes a header', () => {
    const csv = toCsv([{ a: 'x,y', b: 1 }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]);
    expect(csv).toBe('A,B\n"x,y",1\n');
    expect(toCsv([], [{ key: 'a', label: 'A' }])).toBe('A\n');
  });
});
