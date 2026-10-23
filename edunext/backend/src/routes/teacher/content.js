import { Router } from 'express';
import {
  courseCreateSchema,
  courseUpdateSchema,
  lessonWriteSchema,
  lessonReorderSchema,
} from '@edunext/shared';
import { validate } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../middleware/error.js';
import { loadOwnedCourse, uniqueSlug, resolveVerifiedVideo, thumbnailUrl } from './helpers.js';

const DEFAULTS = { topic: 'general', level: 'Beginner', practicalRatio: 0.5 };

/** Count lessons + distinct students (users with a session) for a course. */
async function courseCounts(db, courseId) {
  const lessons = Number((await db.get('SELECT COUNT(*) n FROM lessons WHERE course_id = ?', [courseId])).n);
  const students = Number(
    (await db.get(
      `SELECT COUNT(DISTINCT s.user_id) n FROM sessions s
         JOIN lessons l ON s.lesson_id = l.id WHERE l.course_id = ?`,
      [courseId]
    )).n
  );
  return { lessons, students };
}

/** First lesson's visual video id, for the cover thumbnail. */
async function coverVideoId(db, courseId) {
  const row = await db.get(
    'SELECT visual_video_id FROM lessons WHERE course_id = ? ORDER BY position LIMIT 1',
    [courseId]
  );
  return row?.visual_video_id || null;
}

/** Teacher-facing course shape (camelCase, includes status + counts + cover). */
async function teacherCourse(db, row) {
  const counts = await courseCounts(db, row.id);
  const cover = await coverVideoId(db, row.id);
  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    topic: row.topic,
    description: row.description,
    level: row.level,
    practicalRatio: row.practical_ratio,
    status: row.status || 'published',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    coverThumbnail: thumbnailUrl(cover),
    lessonCount: counts.lessons,
    studentCount: counts.students,
  };
}

/** Teacher-facing lesson shape (includes the editable URLs/ids + text). */
function teacherLesson(row) {
  return {
    id: Number(row.id),
    position: row.position,
    title: row.title,
    description: row.description || '',
    durationS: row.duration_s,
    visualVideoId: row.visual_video_id || null,
    practicalVideoId: row.practical_video_id || null,
    visualStartSeconds: Number(row.visual_start_s || 0),
    practicalStartSeconds: Number(row.practical_start_s || 0),
    visualNotes: row.visual_notes || '',
    practicalExercise: row.practical_exercise || '',
    visualThumbnail: thumbnailUrl(row.visual_video_id),
    practicalThumbnail: thumbnailUrl(row.practical_video_id),
  };
}

/**
 * Build the lesson column values from a validated body. Verifies at least one
 * YouTube URL and oEmbed-checks each provided one. A missing variant mirrors the
 * other so the lesson always plays for whichever variant the student is served.
 */
async function resolveLessonFields(body) {
  if (!body.visualUrl && !body.practicalUrl) {
    throw badRequest('Add at least one YouTube link (visual or practical).');
  }
  let visual = body.visualUrl ? await resolveVerifiedVideo(body.visualUrl, 'visual') : null;
  let practical = body.practicalUrl ? await resolveVerifiedVideo(body.practicalUrl, 'practical') : null;
  if (!visual) visual = practical;
  if (!practical) practical = visual;

  return {
    visual_video_id: visual.videoId,
    practical_video_id: practical.videoId,
    visual_start_s: body.visualStartSeconds ?? visual.startSeconds ?? 0,
    practical_start_s: body.practicalStartSeconds ?? practical.startSeconds ?? 0,
    visual_notes: body.visualNotes || null,
    practical_exercise: body.practicalExercise || null,
    description: body.description || null,
    duration_s: body.durationSeconds ?? 0,
    // Minimal valid JSON bodies so the student lesson endpoint can parse them.
    visual: JSON.stringify({ summary: body.visualNotes || '', keyPoints: [] }),
    practical: JSON.stringify({ task: { title: body.practicalExercise || '' }, steps: [] }),
  };
}

export function teacherContentRoutes() {
  const router = Router();

  // --- Courses --------------------------------------------------------------

  // POST /api/teacher/courses -> create a draft course
  router.post('/courses', validate(courseCreateSchema), async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const now = new Date().toISOString();
      const slug = await uniqueSlug(db, req.body.title);
      const info = await db.run(
        `INSERT INTO courses (slug, title, topic, description, level, practical_ratio, owner_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
        [
          slug,
          req.body.title,
          req.body.topic || DEFAULTS.topic,
          req.body.description || '',
          req.body.level || DEFAULTS.level,
          req.body.practicalRatio ?? DEFAULTS.practicalRatio,
          req.userId,
          now,
          now,
        ]
      );
      const row = await db.get('SELECT * FROM courses WHERE id = ?', [Number(info.lastInsertRowid)]);
      return res.status(201).json({ course: await teacherCourse(db, row) });
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/teacher/courses -> own courses + counts
  router.get('/courses', async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const rows = await db.all('SELECT * FROM courses WHERE owner_id = ? ORDER BY updated_at DESC, id DESC', [req.userId]);
      const courses = [];
      for (const r of rows) courses.push(await teacherCourse(db, r));
      return res.json({ courses });
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/teacher/courses/:id -> own course + lessons
  router.get('/courses/:id', async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const course = await loadOwnedCourse(db, req.userId, req.params.id);
      const lessons = await db.all('SELECT * FROM lessons WHERE course_id = ? ORDER BY position', [course.id]);
      return res.json({ course: await teacherCourse(db, course), lessons: lessons.map(teacherLesson) });
    } catch (err) {
      return next(err);
    }
  });

  // PUT /api/teacher/courses/:id -> edit fields
  router.put('/courses/:id', validate(courseUpdateSchema), async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const course = await loadOwnedCourse(db, req.userId, req.params.id);
      const b = req.body;
      const next_ = {
        title: b.title ?? course.title,
        topic: b.topic ?? course.topic,
        description: b.description ?? course.description,
        level: b.level ?? course.level,
        practical_ratio: b.practicalRatio ?? course.practical_ratio,
      };
      await db.run(
        'UPDATE courses SET title=?, topic=?, description=?, level=?, practical_ratio=?, updated_at=? WHERE id=?',
        [next_.title, next_.topic, next_.description, next_.level, next_.practical_ratio, new Date().toISOString(), course.id]
      );
      const row = await db.get('SELECT * FROM courses WHERE id = ?', [course.id]);
      return res.json({ course: await teacherCourse(db, row) });
    } catch (err) {
      return next(err);
    }
  });

  // Status transitions.
  const setStatus = (status, opts = {}) => async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const course = await loadOwnedCourse(db, req.userId, req.params.id);
      if (opts.requireLessons) {
        const n = Number((await db.get('SELECT COUNT(*) n FROM lessons WHERE course_id = ?', [course.id])).n);
        if (n === 0) return next(badRequest('Add at least one lesson before publishing.'));
      }
      await db.run('UPDATE courses SET status=?, updated_at=? WHERE id=?', [status, new Date().toISOString(), course.id]);
      const row = await db.get('SELECT * FROM courses WHERE id = ?', [course.id]);
      return res.json({ course: await teacherCourse(db, row) });
    } catch (err) {
      return next(err);
    }
  };
  router.post('/courses/:id/publish', setStatus('published', { requireLessons: true }));
  router.post('/courses/:id/unpublish', setStatus('draft'));
  router.post('/courses/:id/archive', setStatus('archived'));

  // DELETE /api/teacher/courses/:id?confirm=<slug> -> permanent cascade
  router.delete('/courses/:id', async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const course = await loadOwnedCourse(db, req.userId, req.params.id);
      if (String(req.query.confirm || '') !== course.slug) {
        return next(badRequest('Type the course slug to confirm permanent deletion.'));
      }
      // Count sessions removed (for the response / warning echo).
      const sessions = Number(
        (await db.get(
          'SELECT COUNT(*) n FROM sessions s JOIN lessons l ON s.lesson_id = l.id WHERE l.course_id = ?',
          [course.id]
        )).n
      );
      // FK ON DELETE CASCADE handles lessons -> sessions -> ticks/feedback/curation.
      await db.run('DELETE FROM courses WHERE id = ?', [course.id]);
      return res.json({ ok: true, deleted: { courseId: course.id, sessionsRemoved: sessions } });
    } catch (err) {
      return next(err);
    }
  });

  // --- Lessons --------------------------------------------------------------

  // POST /api/teacher/courses/:id/lessons -> add (oEmbed-verified)
  router.post('/courses/:id/lessons', validate(lessonWriteSchema), async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const course = await loadOwnedCourse(db, req.userId, req.params.id);
      const fields = await resolveLessonFields(req.body);
      const pos = Number((await db.get('SELECT COALESCE(MAX(position),0) m FROM lessons WHERE course_id = ?', [course.id])).m) + 1;
      const info = await db.run(
        `INSERT INTO lessons (course_id, position, title, description, duration_s, visual, practical,
           visual_video_id, practical_video_id, visual_start_s, practical_start_s, visual_notes, practical_exercise)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          course.id, pos, req.body.title, fields.description, fields.duration_s, fields.visual, fields.practical,
          fields.visual_video_id, fields.practical_video_id, fields.visual_start_s, fields.practical_start_s,
          fields.visual_notes, fields.practical_exercise,
        ]
      );
      await db.run('UPDATE courses SET updated_at=? WHERE id=?', [new Date().toISOString(), course.id]);
      const row = await db.get('SELECT * FROM lessons WHERE id = ?', [Number(info.lastInsertRowid)]);
      return res.status(201).json({ lesson: teacherLesson(row) });
    } catch (err) {
      return next(err);
    }
  });

  // PUT /api/teacher/courses/:id/lessons/:lessonId -> edit
  router.put('/courses/:id/lessons/:lessonId', validate(lessonWriteSchema), async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const course = await loadOwnedCourse(db, req.userId, req.params.id);
      const lessonId = Number(req.params.lessonId);
      const existing = await db.get('SELECT * FROM lessons WHERE id = ? AND course_id = ?', [lessonId, course.id]);
      if (!existing) return next(notFound('Lesson not found'));
      const fields = await resolveLessonFields(req.body);
      await db.run(
        `UPDATE lessons SET title=?, description=?, duration_s=?, visual=?, practical=?,
           visual_video_id=?, practical_video_id=?, visual_start_s=?, practical_start_s=?, visual_notes=?, practical_exercise=?
         WHERE id=?`,
        [
          req.body.title, fields.description, fields.duration_s, fields.visual, fields.practical,
          fields.visual_video_id, fields.practical_video_id, fields.visual_start_s, fields.practical_start_s,
          fields.visual_notes, fields.practical_exercise, lessonId,
        ]
      );
      await db.run('UPDATE courses SET updated_at=? WHERE id=?', [new Date().toISOString(), course.id]);
      const row = await db.get('SELECT * FROM lessons WHERE id = ?', [lessonId]);
      return res.json({ lesson: teacherLesson(row) });
    } catch (err) {
      return next(err);
    }
  });

  // POST /api/teacher/courses/:id/lessons/reorder -> { order: [lessonId,...] }
  router.post('/courses/:id/lessons/reorder', validate(lessonReorderSchema), async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const course = await loadOwnedCourse(db, req.userId, req.params.id);
      const owned = await db.all('SELECT id FROM lessons WHERE course_id = ?', [course.id]);
      const ownedIds = new Set(owned.map((r) => Number(r.id)));
      const order = req.body.order.map(Number);
      if (order.length !== ownedIds.size || !order.every((id) => ownedIds.has(id))) {
        return next(badRequest('Reorder must list exactly the lessons in this course.'));
      }
      // Two-phase to avoid UNIQUE-ish collisions: offset, then set final positions.
      await db.transaction(async (tx) => {
        for (const id of order) await tx.run('UPDATE lessons SET position = position + 1000 WHERE id = ?', [id]);
        let p = 1;
        for (const id of order) await tx.run('UPDATE lessons SET position = ? WHERE id = ?', [p++, id]);
      });
      await db.run('UPDATE courses SET updated_at=? WHERE id=?', [new Date().toISOString(), course.id]);
      const lessons = await db.all('SELECT * FROM lessons WHERE course_id = ? ORDER BY position', [course.id]);
      return res.json({ lessons: lessons.map(teacherLesson) });
    } catch (err) {
      return next(err);
    }
  });

  // DELETE /api/teacher/courses/:id/lessons/:lessonId
  router.delete('/courses/:id/lessons/:lessonId', async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const course = await loadOwnedCourse(db, req.userId, req.params.id);
      const lessonId = Number(req.params.lessonId);
      const existing = await db.get('SELECT id FROM lessons WHERE id = ? AND course_id = ?', [lessonId, course.id]);
      if (!existing) return next(notFound('Lesson not found'));
      const sessions = Number((await db.get('SELECT COUNT(*) n FROM sessions WHERE lesson_id = ?', [lessonId])).n);
      await db.run('DELETE FROM lessons WHERE id = ?', [lessonId]);
      await db.run('UPDATE courses SET updated_at=? WHERE id=?', [new Date().toISOString(), course.id]);
      return res.json({ ok: true, deleted: { lessonId, sessionsRemoved: sessions } });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

export default teacherContentRoutes;
