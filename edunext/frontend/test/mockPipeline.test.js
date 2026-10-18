import { describe, it, expect } from 'vitest';
import {
  buildTick,
  computeEngagement,
  evaluateCuration,
  createCurationState,
  DEFAULT_BOUNDARIES,
} from '@edunext/shared';
import { MockSignalSource } from '../src/tracking/mockSource.js';
import { DEFAULT_SCENARIO } from '../src/tracking/scenarios.js';

/**
 * Proves the mock source runs through the SAME shared pipeline the real camera
 * uses (Known pitfall #: no shortcuts for mock). Simulates the provider's
 * virtual clock (100ms steps) and a 5s tick cadence over the scenario.
 */
describe('mock signal source → pipeline', () => {
  it('resolves BPM warm-up, varies zones, and fires curation', () => {
    const src = new MockSignalSource(DEFAULT_SCENARIO);
    let virtual = 1_000_000;
    src.reset(virtual);

    const blinks = [];
    const presence = [];
    const emotions = [];
    let labels = [];
    const emit = (s) => {
      if (s.type === 'blink') blinks.push(s.t);
      else if (s.type === 'presence') presence.push(s.t);
      else emotions.push({ t: s.t, probs: s.probs });
    };

    let engState = { ema: null };
    let curState = createCurationState();
    const startT = virtual;
    const zonesSeen = new Set();
    let sawBpm = false;
    const actions = [];

    for (let step = 0; step < 30; step++) {
      for (let i = 0; i < 50; i++) {
        virtual += 100; // 100ms provider cadence
        src.pump(virtual, emit);
      }
      const cutoff = virtual - 90000;
      const tick = buildTick({
        now: virtual,
        blinkTimestamps: blinks.filter((t) => t >= cutoff),
        presenceStamps: presence.filter((t) => t >= cutoff),
        emotionSamples: emotions.filter((s) => s.t >= cutoff),
        boundaries: DEFAULT_BOUNDARIES,
        emotionBaseline: null,
        prevEmotionLabels: labels,
      });
      labels = tick.emotionLabels;
      if (tick.bpm != null) sawBpm = true;
      if (tick.zone) zonesSeen.add(tick.zone);

      const eng = computeEngagement(engState, tick, [], virtual);
      engState = eng.state;
      const { action, state } = evaluateCuration(
        curState,
        { score: eng.score, zone: tick.zone, emotion: tick.emotion },
        { elapsedS: (virtual - startT) / 1000, currentRate: 1, variant: 'visual', switchedAlready: false, now: virtual }
      );
      curState = state;
      if (action) actions.push(action);
    }

    expect(sawBpm).toBe(true);
    expect(zonesSeen.size).toBeGreaterThanOrEqual(2);
    expect(actions.length).toBeGreaterThanOrEqual(1);
  });
});
