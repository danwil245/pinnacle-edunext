import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { makeApp, registerUser, firstLessonId } from './helpers.js';

/**
 * The privacy invariant: only derived numbers/labels may reach the server.
 * Any image/frame/base64 field (or an out-of-range value) on a tick payload
 * must be rejected before it touches the database.
 */
describe('privacy — tick upload payload', () => {
  let app;
  let token;
  let sessionId;
  beforeEach(async () => {
    app = makeApp();
    ({ token } = await registerUser(app));
    const lessonId = await firstLessonId(app, token);
    const create = await request(app).post('/api/sessions').set('Authorization', `Bearer ${token}`).send({ lessonId });
    sessionId = create.body.sessionId;
  });

  const validTick = { t: 0, bpm: 15, zone: 'neutral', emotion: 'engaged', score: 70, faceDetected: true, observedS: 60 };
  const postTicks = (ticks) =>
    request(app).post(`/api/sessions/${sessionId}/ticks`).set('Authorization', `Bearer ${token}`).send({ ticks });

  it('accepts a derived-only batch', async () => {
    expect((await postTicks([validTick])).status).toBe(200);
  });

  it('rejects any image/frame/base64 field on a tick', async () => {
    for (const bad of ['image', 'frame', 'dataUrl', 'blob', 'video', 'png']) {
      const res = await postTicks([{ ...validTick, [bad]: 'data:image/png;base64,AAAA' }]);
      expect(res.status, `field ${bad}`).toBe(400);
    }
  });

  it('rejects unknown zone/emotion labels', async () => {
    expect((await postTicks([{ ...validTick, zone: 'asleep' }])).status).toBe(400);
    expect((await postTicks([{ ...validTick, emotion: 'angry' }])).status).toBe(400);
  });

  it('caps a batch at 200 ticks', async () => {
    expect((await postTicks(Array(201).fill(validTick))).status).toBe(400);
  });
});
