import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { makeApp, registerUser, registerTeacher, TEST_INVITE } from './helpers.js';

/**
 * The full teacher -> student journey as one ordered integration test (the
 * deterministic, CI-friendly stand-in for the Playwright flow; YouTube oEmbed is
 * mocked). Mirrors the Definition of Done walkthrough:
 *   register teacher (invite) -> create course + 2 lessons -> publish ->
 *   student sees it -> student completes a session -> teacher sees analytics ->
 *   archive -> student no longer sees -> permanent delete (typed confirm).
 * Also: a student cannot reach teacher routes.
 */
const VID_A = 'dQw4w9WgXcQ';
const VID_B = 'abcdefghijk';
const yt = (id) => `https://www.youtube.com/watch?v=${id}`;

describe('teacher -> student end-to-end flow', () => {
  let app;
  beforeAll(() => { process.env.TEACHER_INVITE_CODE = TEST_INVITE; });
  afterAll(() => { delete process.env.TEACHER_INVITE_CODE; });
  beforeEach(async () => {
    app = await makeApp();
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ title: 'Lesson clip', author_name: 'Teacher' }) });
  });
  afterEach(() => vi.restoreAllMocks());

  it('runs the whole journey', async () => {
    // 1. Teacher registers with the invite code.
    const teacher = await registerTeacher(app);
    expect(teacher.status).toBe(201);
    expect(teacher.user.role).toBe('teacher');
    const T = (req) => req.set('Authorization', `Bearer ${teacher.token}`);

    // 2. Create a course with two lessons.
    const c = await T(request(app).post('/api/teacher/courses')).send({ title: 'End to End', description: 'demo' });
    const courseId = c.body.course.id;
    const slug = c.body.course.slug;
    const l1 = await T(request(app).post(`/api/teacher/courses/${courseId}/lessons`)).send({ title: 'Lesson one', visualUrl: yt(VID_A), practicalUrl: yt(VID_B) });
    const l2 = await T(request(app).post(`/api/teacher/courses/${courseId}/lessons`)).send({ title: 'Lesson two', visualUrl: yt(VID_A) });
    expect(l1.status).toBe(201);
    expect(l2.status).toBe(201);

    // 3. Publish.
    const pub = await T(request(app).post(`/api/teacher/courses/${courseId}/publish`));
    expect(pub.body.course.status).toBe('published');

    // 4. A student logs in and sees it in the catalogue.
    const student = await registerUser(app, { name: 'Sam' });
    const S = (req) => req.set('Authorization', `Bearer ${student.token}`);
    const catalogue = await S(request(app).get('/api/courses'));
    expect(catalogue.body.courses.some((x) => x.slug === slug)).toBe(true);
    const detail = await S(request(app).get(`/api/courses/${slug}`));
    expect(detail.body.lessons.length).toBe(2);

    // 5. Student completes a mock session on lesson one.
    const lessonId = detail.body.lessons[0].id;
    const sess = await S(request(app).post('/api/sessions')).send({ lessonId });
    const sessionId = sess.body.sessionId;
    const ticks = [0, 1, 2, 3, 4].map((i) => ({ t: i * 5000, bpm: 14, zone: 'attentive', emotion: 'engaged', score: 82, faceDetected: true, observedS: 60 }));
    await S(request(app).post(`/api/sessions/${sessionId}/ticks`)).send({ ticks });
    const end = await S(request(app).post(`/api/sessions/${sessionId}/end`)).send({ completed: true });
    expect(end.body.summary.avgScore).toBeGreaterThan(70);

    // 6. Teacher sees it in analytics.
    const overview = await T(request(app).get('/api/teacher/analytics/overview'));
    expect(overview.body.totals.totalSessions).toBe(1);
    expect(overview.body.totals.studentsStarted).toBe(1);
    const students = await T(request(app).get(`/api/teacher/analytics/courses/${courseId}/students`));
    expect(students.body.students[0].name).toBe('Sam');

    // 7. A student cannot reach teacher routes.
    expect((await S(request(app).get('/api/teacher/courses'))).status).toBe(403);
    expect((await S(request(app).get(`/api/teacher/analytics/courses/${courseId}`))).status).toBe(403);

    // 8. Teacher archives the course; the student no longer sees it.
    await T(request(app).post(`/api/teacher/courses/${courseId}/archive`));
    expect((await S(request(app).get(`/api/courses/${slug}`))).status).toBe(404);
    expect((await S(request(app).get('/api/courses'))).body.courses.some((x) => x.slug === slug)).toBe(false);
    // Analytics survive the archive.
    const afterArchive = await T(request(app).get(`/api/teacher/analytics/courses/${courseId}/students`));
    expect(afterArchive.body.students.length).toBe(1);

    // 9. Permanent delete requires the typed slug confirmation, then cascades.
    expect((await T(request(app).delete(`/api/teacher/courses/${courseId}?confirm=wrong`))).status).toBe(400);
    const del = await T(request(app).delete(`/api/teacher/courses/${courseId}?confirm=${slug}`));
    expect(del.status).toBe(200);
    expect(del.body.deleted.sessionsRemoved).toBe(1);
    expect((await T(request(app).get(`/api/teacher/courses/${courseId}`))).status).toBe(404);
  });
});
