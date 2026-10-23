import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { makeApp, registerUser, registerTeacher, TEST_INVITE } from './helpers.js';

// Any valid 11-char id resolves as embeddable via the mocked oEmbed fetch.
const VID = 'dQw4w9WgXcQ';
const VID2 = 'abcdefghijk';
const url = (id) => `https://www.youtube.com/watch?v=${id}`;

describe('teacher content management', () => {
  let app;
  let teacher;
  beforeAll(() => {
    process.env.TEACHER_INVITE_CODE = TEST_INVITE;
  });
  afterAll(() => {
    delete process.env.TEACHER_INVITE_CODE;
  });
  beforeEach(async () => {
    app = await makeApp();
    teacher = await registerTeacher(app);
    // oEmbed verification always succeeds in these tests.
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ title: 'Clip', author_name: 'Teacher' }) });
  });
  afterEach(() => vi.restoreAllMocks());

  const asTeacher = (req, token = teacher.token) => req.set('Authorization', `Bearer ${token}`);

  async function makeCourseWithLesson(token = teacher.token) {
    const c = await asTeacher(request(app).post('/api/teacher/courses'), token).send({ title: 'My Course' });
    const courseId = c.body.course.id;
    const l = await asTeacher(request(app).post(`/api/teacher/courses/${courseId}/lessons`), token).send({
      title: 'Lesson 1',
      visualUrl: url(VID),
      practicalUrl: url(VID2),
    });
    return { courseId, lessonId: l.body.lesson.id, slug: c.body.course.slug };
  }

  it('creates a draft course with an auto slug and counts', async () => {
    const res = await asTeacher(request(app).post('/api/teacher/courses')).send({ title: 'Intro to Testing' });
    expect(res.status).toBe(201);
    expect(res.body.course.status).toBe('draft');
    expect(res.body.course.slug).toBe('intro-to-testing');
    expect(res.body.course.lessonCount).toBe(0);
  });

  it('adds a lesson after oEmbed verification and exposes a cover thumbnail', async () => {
    const { courseId } = await makeCourseWithLesson();
    const res = await asTeacher(request(app).get(`/api/teacher/courses/${courseId}`));
    expect(res.status).toBe(200);
    expect(res.body.lessons.length).toBe(1);
    expect(res.body.lessons[0].visualVideoId).toBe(VID);
    expect(res.body.course.coverThumbnail).toContain(`i.ytimg.com/vi/${VID}`);
  });

  it('rejects a lesson with an invalid YouTube URL', async () => {
    const c = await asTeacher(request(app).post('/api/teacher/courses')).send({ title: 'C' });
    const res = await asTeacher(request(app).post(`/api/teacher/courses/${c.body.course.id}/lessons`)).send({
      title: 'Bad', visualUrl: 'https://example.com/not-youtube',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a lesson whose video is not embeddable', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401 });
    const c = await asTeacher(request(app).post('/api/teacher/courses')).send({ title: 'C' });
    const res = await asTeacher(request(app).post(`/api/teacher/courses/${c.body.course.id}/lessons`)).send({
      title: 'NoEmbed', visualUrl: url('bcdefghijkl'),
    });
    expect(res.status).toBe(400);
  });

  it('requires a lesson before publishing; then publishes and the student sees it', async () => {
    const student = await registerUser(app);
    const empty = await asTeacher(request(app).post('/api/teacher/courses')).send({ title: 'Empty' });
    const pub0 = await asTeacher(request(app).post(`/api/teacher/courses/${empty.body.course.id}/publish`));
    expect(pub0.status).toBe(400);

    const { courseId, slug } = await makeCourseWithLesson();
    // Not visible while draft.
    const before = await request(app).get(`/api/courses/${slug}`).set('Authorization', `Bearer ${student.token}`);
    expect(before.status).toBe(404);
    const pub = await asTeacher(request(app).post(`/api/teacher/courses/${courseId}/publish`));
    expect(pub.body.course.status).toBe('published');
    const after = await request(app).get(`/api/courses/${slug}`).set('Authorization', `Bearer ${student.token}`);
    expect(after.status).toBe(200);
  });

  it('reorders lessons', async () => {
    const c = await asTeacher(request(app).post('/api/teacher/courses')).send({ title: 'Multi' });
    const id = c.body.course.id;
    const a = await asTeacher(request(app).post(`/api/teacher/courses/${id}/lessons`)).send({ title: 'A', visualUrl: url(VID) });
    const b = await asTeacher(request(app).post(`/api/teacher/courses/${id}/lessons`)).send({ title: 'B', visualUrl: url(VID) });
    const res = await asTeacher(request(app).post(`/api/teacher/courses/${id}/lessons/reorder`)).send({
      order: [b.body.lesson.id, a.body.lesson.id],
    });
    expect(res.status).toBe(200);
    expect(res.body.lessons.map((l) => l.title)).toEqual(['B', 'A']);
  });

  it('archives a course so the student no longer sees it (analytics kept)', async () => {
    const student = await registerUser(app);
    const { courseId, slug, lessonId } = await makeCourseWithLesson();
    await asTeacher(request(app).post(`/api/teacher/courses/${courseId}/publish`));
    // Student starts a session so there is analytics data.
    const sess = await request(app).post('/api/sessions').set('Authorization', `Bearer ${student.token}`).send({ lessonId });
    expect(sess.status).toBe(201);

    await asTeacher(request(app).post(`/api/teacher/courses/${courseId}/archive`));
    const after = await request(app).get(`/api/courses/${slug}`).set('Authorization', `Bearer ${student.token}`);
    expect(after.status).toBe(404);
    // The session (analytics) survives the archive.
    const kept = await request(app).get('/api/teacher/courses/' + courseId).set('Authorization', `Bearer ${teacher.token}`);
    expect(kept.body.course.studentCount).toBe(1);
  });

  it('mid-lesson unpublish does not break the student session', async () => {
    const student = await registerUser(app);
    const { courseId, lessonId } = await makeCourseWithLesson();
    await asTeacher(request(app).post(`/api/teacher/courses/${courseId}/publish`));
    const sess = await request(app).post('/api/sessions').set('Authorization', `Bearer ${student.token}`).send({ lessonId });
    const sessionId = sess.body.sessionId;
    // Teacher unpublishes while the student is mid-lesson.
    await asTeacher(request(app).post(`/api/teacher/courses/${courseId}/unpublish`));
    // The lesson still loads and the session still ends with a summary.
    const lesson = await request(app).get(`/api/lessons/${lessonId}`).set('Authorization', `Bearer ${student.token}`);
    expect(lesson.status).toBe(200);
    const end = await request(app).post(`/api/sessions/${sessionId}/end`).set('Authorization', `Bearer ${student.token}`).send({ completed: true });
    expect(end.status).toBe(200);
    expect(end.body.summary).toBeTruthy();
  });

  it('permanently deletes only with the typed slug confirmation and cascades sessions', async () => {
    const student = await registerUser(app);
    const { courseId, slug, lessonId } = await makeCourseWithLesson();
    await asTeacher(request(app).post(`/api/teacher/courses/${courseId}/publish`));
    await request(app).post('/api/sessions').set('Authorization', `Bearer ${student.token}`).send({ lessonId });

    const wrong = await asTeacher(request(app).delete(`/api/teacher/courses/${courseId}?confirm=nope`));
    expect(wrong.status).toBe(400);
    const ok = await asTeacher(request(app).delete(`/api/teacher/courses/${courseId}?confirm=${slug}`));
    expect(ok.status).toBe(200);
    expect(ok.body.deleted.sessionsRemoved).toBe(1);
    // Course and its lessons are gone.
    const gone = await asTeacher(request(app).get(`/api/teacher/courses/${courseId}`));
    expect(gone.status).toBe(404);
  });

  describe('authorization', () => {
    it('rejects unauthenticated access with 401', async () => {
      expect((await request(app).get('/api/teacher/courses')).status).toBe(401);
    });
    it('rejects a student with 403', async () => {
      const student = await registerUser(app);
      const res = await request(app).get('/api/teacher/courses').set('Authorization', `Bearer ${student.token}`);
      expect(res.status).toBe(403);
    });
    it('does not let teacher B read, edit or delete teacher A\'s course (404)', async () => {
      const { courseId, slug } = await makeCourseWithLesson();
      const teacherB = await registerTeacher(app);
      const bTok = teacherB.token;
      expect((await request(app).get(`/api/teacher/courses/${courseId}`).set('Authorization', `Bearer ${bTok}`)).status).toBe(404);
      expect((await request(app).put(`/api/teacher/courses/${courseId}`).set('Authorization', `Bearer ${bTok}`).send({ title: 'Hijack' })).status).toBe(404);
      expect((await request(app).post(`/api/teacher/courses/${courseId}/archive`).set('Authorization', `Bearer ${bTok}`)).status).toBe(404);
      expect((await request(app).delete(`/api/teacher/courses/${courseId}?confirm=${slug}`).set('Authorization', `Bearer ${bTok}`)).status).toBe(404);
      // B's own list stays empty.
      const list = await request(app).get('/api/teacher/courses').set('Authorization', `Bearer ${bTok}`);
      expect(list.body.courses.length).toBe(0);
    });
  });
});
