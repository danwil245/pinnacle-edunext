import { describe, it, expect } from 'vitest';
import {
  evaluateCuration,
  createCurationState,
  shouldPromptFeedback,
  createPromptState,
} from '../src/curation.js';
import { CONFIG } from '../src/config.js';

const C = CONFIG.CURATION;
const baseCtx = (over = {}) => ({
  elapsedS: 120,
  currentRate: 1,
  variant: 'visual',
  switchedAlready: false,
  now: 1_000_000,
  ...over,
});

describe('evaluateCuration — gates', () => {
  it('fires nothing before WARMUP_S even with a tripped counter', () => {
    const state = { ...createCurationState(), breakTicks: 99 };
    const r = evaluateCuration(state, { score: 10, zone: 'fatigued', emotion: null }, baseCtx({ elapsedS: 30 }));
    expect(r.action).toBeNull();
  });

  it('respects the cooldown after an action', () => {
    const state = { ...createCurationState(), breakTicks: 99, lastActionAt: 1_000_000 - 30_000 };
    const r = evaluateCuration(state, { score: 10, zone: 'fatigued', emotion: null }, baseCtx());
    expect(r.action).toBeNull();
  });

  it('does nothing when the score is null and there is no face signal', () => {
    const r = evaluateCuration(createCurationState(), { score: null, zone: null, emotion: null }, baseCtx());
    expect(r.action).toBeNull();
  });
});

describe('evaluateCuration — rules + priority', () => {
  it('suggests a break after enough fatigued ticks (highest priority)', () => {
    // Prime break + replay to trip on the SAME tick; break (priority 1) wins.
    const state = { ...createCurationState(), breakTicks: C.BREAK_TICKS - 1, replayTicks: C.REPLAY_TICKS - 1 };
    const r = evaluateCuration(state, { score: 10, zone: 'fatigued', emotion: 'confused' }, baseCtx());
    expect(r.action.type).toBe('suggest_break');
  });

  it('suggests replay after confused/frustrated ticks', () => {
    let state = createCurationState();
    let r;
    for (let i = 0; i < C.REPLAY_TICKS; i++) {
      r = evaluateCuration(state, { score: 60, zone: 'neutral', emotion: 'confused' }, baseCtx());
      state = r.state;
    }
    expect(r.action.type).toBe('replay_section');
    expect(r.action.payload).toEqual({ seekBackS: C.REPLAY_BACK_S, rate: C.REPLAY_RATE });
  });

  it('switches variant once when the score stays low', () => {
    // Hold the rate at RATE_MIN so slow_down (priority 4) can't pre-empt switch.
    const state = { ...createCurationState(), switchTicks: C.SWITCH_TICKS - 1 };
    const r = evaluateCuration(
      state,
      { score: 20, zone: 'attentive', emotion: null },
      baseCtx({ currentRate: C.RATE_MIN })
    );
    expect(r.action.type).toBe('switch_variant');
    expect(r.action.payload).toEqual({ to: 'practical' });
  });

  it('does not switch when already switched', () => {
    const state = { ...createCurationState(), switchTicks: C.SWITCH_TICKS - 1 };
    const r = evaluateCuration(
      state,
      { score: 20, zone: 'attentive', emotion: null },
      baseCtx({ switchedAlready: true, currentRate: C.RATE_MIN })
    );
    expect(r.action).toBeNull();
  });

  it('resets a counter when its condition breaks', () => {
    let state = { ...createCurationState(), breakTicks: 5 };
    const r = evaluateCuration(state, { score: 80, zone: 'attentive', emotion: null }, baseCtx());
    expect(r.state.breakTicks).toBe(0);
  });
});

describe('evaluateCuration — rate clamping', () => {
  it('slows down but not below RATE_MIN', () => {
    const state = { ...createCurationState(), slowTicks: C.SLOWDOWN_TICKS - 1 };
    const r = evaluateCuration(state, { score: 40, zone: 'neutral', emotion: null }, baseCtx({ currentRate: 0.8 }));
    expect(r.action.type).toBe('slow_down');
    expect(r.action.payload.rate).toBe(C.RATE_MIN);
  });

  it('speeds up but not above RATE_MAX', () => {
    const state = { ...createCurationState(), speedTicks: C.SPEEDUP_TICKS - 1 };
    const r = evaluateCuration(state, { score: 95, zone: 'attentive', emotion: null }, baseCtx({ currentRate: 1.4 }));
    expect(r.action.type).toBe('speed_up');
    expect(r.action.payload.rate).toBe(C.RATE_MAX);
  });
});

describe('shouldPromptFeedback', () => {
  const ctx = (over) => ({ elapsedS: 0, durationS: 120, now: 1_000_000, ...over });

  it('prompts thumbs around the halfway mark', () => {
    const r = shouldPromptFeedback(createPromptState(), ctx({ elapsedS: 60 }));
    expect(r.prompt).toEqual({ kind: 'thumbs' });
  });

  it('prompts at the end with highest priority', () => {
    const r = shouldPromptFeedback(createPromptState(), ctx({ elapsedS: 120, atEnd: true }));
    expect(r.prompt).toEqual({ kind: 'end' });
  });

  it('asks "still here?" after a low-score streak', () => {
    const r = shouldPromptFeedback(createPromptState(), ctx({ elapsedS: 40, lowScoreTicks: 6 }));
    expect(r.prompt).toEqual({ kind: 'still_here' });
  });

  it('honors MAX_PER_LESSON', () => {
    const state = { ...createPromptState(), promptsShown: CONFIG.FEEDBACK_PROMPTS.MAX_PER_LESSON };
    const r = shouldPromptFeedback(state, ctx({ elapsedS: 60 }));
    expect(r.prompt).toBeNull();
  });

  it('honors MIN_GAP_S between prompts', () => {
    const state = { ...createPromptState(), lastPromptAt: 1_000_000 - 1000 };
    const r = shouldPromptFeedback(state, ctx({ elapsedS: 60, now: 1_000_000 }));
    expect(r.prompt).toBeNull();
  });
});
