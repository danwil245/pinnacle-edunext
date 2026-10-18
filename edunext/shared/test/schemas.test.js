import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  tickSchema,
  ticksBatchSchema,
  interestsSchema,
} from '../src/schemas.js';

describe('registerSchema', () => {
  it('accepts a valid registration', () => {
    expect(registerSchema.safeParse({ email: 'a@b.com', name: 'Al', password: 'longenough' }).success).toBe(true);
  });
  it('rejects a short password', () => {
    expect(registerSchema.safeParse({ email: 'a@b.com', name: 'Al', password: 'short' }).success).toBe(false);
  });
  it('rejects a bad email', () => {
    expect(registerSchema.safeParse({ email: 'nope', name: 'Al', password: 'longenough' }).success).toBe(false);
  });
});

describe('interestsSchema', () => {
  it('allows 1–2 interests', () => {
    expect(interestsSchema.safeParse({ interests: ['web-development'] }).success).toBe(true);
    expect(interestsSchema.safeParse({ interests: ['a', 'b', 'c'] }).success).toBe(false);
    expect(interestsSchema.safeParse({ interests: [] }).success).toBe(false);
  });
});

describe('tickSchema — privacy invariant', () => {
  const validTick = { t: 0, bpm: 15, zone: 'neutral', emotion: 'engaged', score: 70, faceDetected: true, observedS: 60 };

  it('accepts a derived-only tick', () => {
    expect(tickSchema.safeParse(validTick).success).toBe(true);
  });

  it('allows nulls for warm-up / missing signals', () => {
    expect(
      tickSchema.safeParse({ ...validTick, bpm: null, zone: null, emotion: null, score: null }).success
    ).toBe(true);
  });

  it('rejects image/frame/base64 fields (strict object)', () => {
    for (const bad of ['image', 'frame', 'dataUrl', 'blob', 'video']) {
      expect(tickSchema.safeParse({ ...validTick, [bad]: 'x' }).success).toBe(false);
    }
  });

  it('rejects unknown zone/emotion labels', () => {
    expect(tickSchema.safeParse({ ...validTick, zone: 'asleep' }).success).toBe(false);
    expect(tickSchema.safeParse({ ...validTick, emotion: 'angry' }).success).toBe(false);
  });
});

describe('ticksBatchSchema', () => {
  const t = { t: 0, bpm: null, zone: null, emotion: null, score: null, faceDetected: false, observedS: 0 };
  it('caps a batch at 200 ticks', () => {
    expect(ticksBatchSchema.safeParse({ ticks: Array(200).fill(t) }).success).toBe(true);
    expect(ticksBatchSchema.safeParse({ ticks: Array(201).fill(t) }).success).toBe(false);
  });
  it('rejects an empty batch', () => {
    expect(ticksBatchSchema.safeParse({ ticks: [] }).success).toBe(false);
  });
});
