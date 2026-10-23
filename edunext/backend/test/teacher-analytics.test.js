import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { makeApp, registerUser, registerTeacher, TEST_INVITE } from './helpers.js';
import { seedDemoAnalytics } from '../src/seedDemoAnalytics.js';

const VID = 'dQw4w9WgXcQ';
const url = (id) => `https://www.youtube.com/watch?v=${id}`;

/** Drive a full student session with some ticks and end it. */
async function runSession(app, token, lessonId, scores) {
  const create = await request(app).post('/api/sessions').set('Authorization', `Bearer ${token}`).send({ lessonId });
  const sessionId = create.body.sessionId;
  const ticks = scores.map((score, i) => ({
    t: i * 5000, bpm: 15, zone: score >= 60 ? 'attentive' : 'fatigued',
    emotion: score >= 60 ? 'engaged' : 'bored', score, faceDetected: true, observedS: 60,
  }));
  await request(app).post(`/api/sessions/${sessionId}/ticks`).set('Authorization', `Bearer ${token}`).send({ ticks });
  await request(app).post(`/api/sessions/${sessionId}/end`).set('Authorization', `Bearer ${token}`).send({ completed: true });
  return sessionId;
}

describe('teacher analytics', () => {
  let app;
  let teacher;
  beforeAll(() => { process.env.TEACHER_INVITE_CODE = TEST_INVITE; });
  afterAll(() => { delete process.env.TEACHER_INVITE_CODE; });
  beforeEach(async () => {
    app = await makeApp();
    teacher = await registerTeacher(app);
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ title: 'Clip', author_name: 'T' }) });
  });
  afterEach(() => vi.restoreAllMocks());

  const asT = (req) => req.set('Authorization', `Bearer ${teacher.token}`);

  async function publishedCourseWithLesson() {
    const c = await asT(request(app).post('/api/teacher/courses')).send({ title: 'Analytics Course' });
    const courseId = c.body.course.id;
    const l = await asT(request(app).post(`/api/teacher/courses/${courseId}/lessons`)).send({ title: 'L1', visualUrl: url(VID) });
    await asT(request(app).post(`/api/teacher/courses/${courseId}/publish`));
    return { courseId, lessonId: l.body.lesson.id, slug: c.body.course.slug };
  }

  it('overview reflects a student session on an owned course', async () => {
    const { lessonId } = await publishedCourseWithLesson();
    const student = await registerUser(app);
    await runSession(app, student.token, lessonId, [80, 85, 75, 90]);

    const res = await asT(request(app).get('/api/teacher/analytics/overview'));
    expect(res.status).toBe(200);
    expect(res.body.totals.totalSessions).toBe(1);
    expect(res.body.totals.studentsStarted).toBe(1);
    expect(res.body.totals.avgEngagement).toBeGreaterThan(70);
  });

  it('course analytics gates lessons with too few sessions and reports variant engagement', async () => {
    const { courseId, lessonId } = await publishedCourseWithLesson();
    const student = await registerUser(app);
    await runSession(app, student.token, lessonId, [80, 70, 60]);

    const res = await asT(request(app).get(`/api/teacher/analytics/courses/${courseId}`));
    expect(res.status).toBe(200);
    const lesson = res.body.lessons[0];
    // One valid session < MIN_VALID_SESSIONS(3) -> not enough data.
    expect(lesson.enoughData).toBe(false);
    expect(lesson.avgEngagement).toBe(null);
    expect(lesson.sessions).toBe(1);
  });

  it('per-student table + detail + CSV export (owner-scoped)', async () => {
    const { courseId, lessonId } = await publishedCourseWithLesson();
    const student = await registerUser(app, { name: 'Alice' });
    await runSession(app, student.token, lessonId, [80, 85]);

    const table = await asT(request(app).get(`/api/teacher/analytics/courses/${courseId}/students`));
    expect(table.body.students.length).toBe(1);
    expect(table.body.students[0].name).toBe('Alice');

    const detail = await asT(request(app).get(`/api/teacher/analytics/courses/${courseId}/students/${student.user.id}`));
    expect(detail.status).toBe(200);
    expect(detail.body.engagementOverTime.length).toBe(1);

    const csv = await asT(request(app).get(`/api/teacher/analytics/courses/${courseId}/export.csv`));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toMatch(/Student,Demo,Sessions/);
    expect(csv.text).toMatch(/Alice/);
  });

  it('teacher B cannot read teacher A analytics (404)', async () => {
    const { courseId } = await publishedCourseWithLesson();
    const teacherB = await registerTeacher(app);
    const r = await request(app).get(`/api/teacher/analytics/courses/${courseId}`).set('Authorization', `Bearer ${teacherB.token}`);
    expect(r.status).toBe(404);
  });

  it('student detail 404s for a student with no sessions in the course', async () => {
    const { courseId } = await publishedCourseWithLesson();
    const stranger = await registerUser(app);
    const r = await asT(request(app).get(`/api/teacher/analytics/courses/${courseId}/students/${stranger.user.id}`));
    expect(r.status).toBe(404);
  });

  it('demo-analytics seed creates flagged demo students and excludes them on demand', async () => {
    // Seed demo data (uses the seeded demo-teacher courses).
    const dbApp = app; // the app's db has the seeded demo teacher + courses
    const db = dbApp.locals ? dbApp.locals.db : null;
    expect(db).toBeTruthy();
    const counts = await seedDemoAnalytics(db, { NODE_ENV: 'test' });
    expect(counts.students).toBeGreaterThan(0);
    expect(counts.sessions).toBeGreaterThan(0);

    // Log in as the seeded demo teacher to view their analytics.
    const login = await request(app).post('/api/auth/login').send({ email: 'teacher@edunext.dev', password: 'teach-demo-1234' });
    const demoTeacherTok = login.body.token;
    const withDemo = await request(app).get('/api/teacher/analytics/overview').set('Authorization', `Bearer ${demoTeacherTok}`);
    expect(withDemo.body.includesDemo).toBe(true);
    expect(withDemo.body.totals.totalSessions).toBeGreaterThan(0);

    const noDemo = await request(app).get('/api/teacher/analytics/overview?demo=exclude').set('Authorization', `Bearer ${demoTeacherTok}`);
    expect(noDemo.body.includesDemo).toBe(false);
    expect(noDemo.body.totals.totalSessions).toBe(0); // all sessions were demo
  });

  it('demo-analytics seed refuses in production without the flag', async () => {
    const db = app.locals.db;
    await expect(seedDemoAnalytics(db, { NODE_ENV: 'production' })).rejects.toThrow(/ALLOW_DEMO_ANALYTICS/);
  });
});
