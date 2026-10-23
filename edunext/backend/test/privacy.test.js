import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { makeApp, registerUser, registerTeacher, firstLessonId, TEST_INVITE } from './helpers.js';

/** Recursively assert an API payload carries no image/blob/base64/raw-frame data. */
const FORBIDDEN_KEYS = /^(image|images|frame|frames|dataurl|data_url|blob|video|png|jpg|jpeg|base64|bytes|pixels|imagedata|landmarks)$/i;
function assertNoRawMedia(value, path = 'root') {
  if (value == null) return;
  if (typeof value === 'string') {
    expect(value.startsWith('data:image'), `${path} is a data: image URI`).toBe(false);
    expect(/base64,/.test(value) && value.length > 100, `${path} looks like base64 media`).toBe(false);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoRawMedia(v, `${path}[${i}]`));
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      expect(FORBIDDEN_KEYS.test(k), `${path}.${k} is a forbidden media field`).toBe(false);
      assertNoRawMedia(v, `${path}.${k}`);
    }
  }
}

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
    app = await makeApp();
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

/**
 * Teacher analytics must also be derived-numbers-only: no response from any
 * teacher endpoint may contain an image/blob/base64/raw-frame field, and a
 * student's "delete my data" must remove them from teacher analytics.
 */
describe('privacy — teacher analytics responses', () => {
  let app;
  let teacher;
  let courseId;
  let student;
  const VID = 'dQw4w9WgXcQ';
  beforeAll(() => { process.env.TEACHER_INVITE_CODE = TEST_INVITE; });
  afterAll(() => { delete process.env.TEACHER_INVITE_CODE; });
  afterEach(() => vi.restoreAllMocks());

  beforeEach(async () => {
    app = await makeApp();
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ title: 'Clip', author_name: 'T' }) });
    teacher = await registerTeacher(app);
    const t = (req) => req.set('Authorization', `Bearer ${teacher.token}`);
    const c = await t(request(app).post('/api/teacher/courses')).send({ title: 'Privacy Course' });
    courseId = c.body.course.id;
    const l = await t(request(app).post(`/api/teacher/courses/${courseId}/lessons`)).send({ title: 'L', visualUrl: `https://youtu.be/${VID}` });
    await t(request(app).post(`/api/teacher/courses/${courseId}/publish`));
    // A student session with ticks.
    student = await registerUser(app, { name: 'Pat' });
    const sess = await request(app).post('/api/sessions').set('Authorization', `Bearer ${student.token}`).send({ lessonId: l.body.lesson.id });
    const ticks = [0, 1, 2].map((i) => ({ t: i * 5000, bpm: 15, zone: 'neutral', emotion: 'engaged', score: 70, faceDetected: true, observedS: 60 }));
    await request(app).post(`/api/sessions/${sess.body.sessionId}/ticks`).set('Authorization', `Bearer ${student.token}`).send({ ticks });
    await request(app).post(`/api/sessions/${sess.body.sessionId}/end`).set('Authorization', `Bearer ${student.token}`).send({ completed: true });
  });

  const asT = (path) => request(app).get(path).set('Authorization', `Bearer ${teacher.token}`);

  it('no teacher endpoint leaks image/blob/base64/raw-frame fields', async () => {
    const paths = [
      '/api/teacher/analytics/overview',
      `/api/teacher/analytics/courses/${courseId}`,
      `/api/teacher/analytics/courses/${courseId}/students`,
      `/api/teacher/analytics/courses/${courseId}/students/${student.user.id}`,
      `/api/teacher/courses/${courseId}`,
    ];
    for (const p of paths) {
      const res = await asT(p);
      expect(res.status, p).toBe(200);
      assertNoRawMedia(res.body, p);
    }
  });

  it("deleting a student's data removes them from teacher analytics", async () => {
    const before = await asT(`/api/teacher/analytics/courses/${courseId}/students`);
    expect(before.body.students.length).toBe(1);
    // Student deletes their account/data.
    await request(app).delete('/api/me').set('Authorization', `Bearer ${student.token}`);
    const after = await asT(`/api/teacher/analytics/courses/${courseId}/students`);
    expect(after.body.students.length).toBe(0);
    const overview = await asT('/api/teacher/analytics/overview');
    expect(overview.body.totals.totalSessions).toBe(0);
  });
});
