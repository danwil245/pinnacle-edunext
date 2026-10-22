import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { makeApp, registerUser, firstLessonId } from './helpers.js';

const sampleTicks = [
  { t: 0, bpm: 15, zone: 'neutral', emotion: 'engaged', score: 70, faceDetected: true, observedS: 60 },
  { t: 5000, bpm: 12, zone: 'attentive', emotion: 'engaged', score: 85, faceDetected: true, observedS: 60 },
  { t: 10000, bpm: null, zone: null, emotion: null, score: null, faceDetected: false, observedS: 5 },
];

describe('session lifecycle', () => {
  let app;
  let token;
  let lessonId;
  beforeEach(async () => {
    app = await makeApp();
    ({ token } = await registerUser(app));
    lessonId = await firstLessonId(app, token);
  });

  const bearer = (r) => r.set('Authorization', `Bearer ${token}`);

  it('runs start -> ticks -> feedback -> curation -> end and computes a summary', async () => {
    const create = await bearer(request(app).post('/api/sessions')).send({ lessonId });
    expect(create.status).toBe(201);
    const { sessionId, variant } = create.body;
    expect(['visual', 'practical']).toContain(variant);

    expect((await bearer(request(app).post(`/api/sessions/${sessionId}/ticks`)).send({ ticks: sampleTicks })).status).toBe(200);
    expect(
      (await bearer(request(app).post(`/api/sessions/${sessionId}/feedback`)).send({ t: 3000, kind: 'thumbs', value: 'thumbs_up' })).status
    ).toBe(200);
    expect(
      (
        await bearer(request(app).post(`/api/sessions/${sessionId}/curation`)).send({
          t: 6000,
          action: 'speed_up',
          reason: 'Highly engaged',
          outcome: 'auto',
        })
      ).status
    ).toBe(200);

    const end = await bearer(request(app).post(`/api/sessions/${sessionId}/end`)).send({ completed: true });
    expect(end.status).toBe(200);
    expect(end.body.summary.avgScore).toBeCloseTo(77.5, 3); // (70 + 85) / 2
    expect(end.body.summary.validSeconds).toBe(10); // 2 valid ticks * 5s
    expect(end.body.summary.completed).toBe(true);
    expect(end.body.summary.zoneDistribution).toEqual({ neutral: 1, attentive: 1 });
  });

  it('is idempotent on end (no double counting)', async () => {
    const { body } = await bearer(request(app).post('/api/sessions')).send({ lessonId });
    const sessionId = body.sessionId;
    await bearer(request(app).post(`/api/sessions/${sessionId}/ticks`)).send({ ticks: sampleTicks });
    const first = await bearer(request(app).post(`/api/sessions/${sessionId}/end`)).send({ completed: true });
    const second = await bearer(request(app).post(`/api/sessions/${sessionId}/end`)).send({ completed: true });
    expect(second.body.alreadyEnded).toBe(true);
    expect(second.body.summary.avgScore).toBe(first.body.summary.avgScore);
  });

  it('enforces ownership of a session', async () => {
    const { body } = await bearer(request(app).post('/api/sessions')).send({ lessonId });
    const sessionId = body.sessionId;
    const { token: otherToken } = await registerUser(app);
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/ticks`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ ticks: sampleTicks });
    expect(res.status).toBe(403);
  });

  it('updates the learning style after a long-enough session', async () => {
    const { body } = await bearer(request(app).post('/api/sessions')).send({ lessonId });
    const sessionId = body.sessionId;
    // 20 valid, high-score ticks => 100s valid >= MIN_LESSON_VALID_S (90)
    const ticks = Array.from({ length: 20 }, (_, i) => ({
      t: i * 5000,
      bpm: 12,
      zone: 'attentive',
      emotion: 'engaged',
      score: 90,
      faceDetected: true,
      observedS: 60,
    }));
    await bearer(request(app).post(`/api/sessions/${sessionId}/ticks`)).send({ ticks });
    const end = await bearer(request(app).post(`/api/sessions/${sessionId}/end`)).send({ completed: true });
    expect(end.body.summary.validSeconds).toBe(100);
    // One variant now has weight; style stays 'unknown' until both do, but stats advanced.
    const me = await bearer(request(app).get('/api/me'));
    const stats = me.body.profile.styleStats;
    expect(stats[body.variant].w).toBeGreaterThan(0);
  });
});
