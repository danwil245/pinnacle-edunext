import { Router } from 'express';
import { rankCourses, chooseVariant } from '@edunext/shared';
import { notFound } from '../middleware/error.js';
import { loadProfile, publicCourse } from './helpers.js';

function courseProgress(db, courseId, userId) {
  const total = db.prepare('SELECT COUNT(*) n FROM lessons WHERE course_id = ?').get(courseId).n;
  const completed = db
    .prepare(
      `SELECT COUNT(*) n FROM lesson_progress lp
       JOIN lessons l ON lp.lesson_id = l.id
       WHERE l.course_id = ? AND lp.user_id = ?`
    )
    .get(courseId, userId).n;
  const started =
    !!db.prepare('SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?').get(userId, courseId) ||
    !!db
      .prepare('SELECT 1 FROM sessions s JOIN lessons l ON s.lesson_id = l.id WHERE s.user_id = ? AND l.course_id = ? LIMIT 1')
      .get(userId, courseId);
  return { total, completed, started };
}

export function courseRoutes() {
  const router = Router();

  // GET /api/courses -> ranked list with reasons
  router.get('/courses', (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const profile = loadProfile(db, req.userId);
      const rows = db.prepare('SELECT * FROM courses').all();

      const sessionsByTopic = Object.fromEntries(
        db
          .prepare(
            `SELECT c.topic topic, AVG(s.avg_score) m FROM sessions s
             JOIN lessons l ON s.lesson_id = l.id
             JOIN courses c ON l.course_id = c.id
             WHERE s.user_id = ? AND s.avg_score IS NOT NULL
             GROUP BY c.topic`
          )
          .all(req.userId)
          .map((r) => [r.topic, r.m])
      );

      const progressBySlug = {};
      const progressByCourse = {};
      for (const r of rows) {
        const p = courseProgress(db, r.id, req.userId);
        progressBySlug[r.slug] = { completed: p.completed, total: p.total };
        progressByCourse[r.slug] = (p.started || p.completed > 0) && p.completed < p.total;
      }

      const ranked = rankCourses({
        courses: rows.map((r) => ({ slug: r.slug, title: r.title, topic: r.topic, practicalRatio: r.practical_ratio })),
        interests: profile.interests,
        style: profile.learningStyle,
        styleConfidence: profile.styleConfidence,
        sessionsByTopic,
        progressByCourse,
      });

      const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r]));
      return res.json({
        courses: ranked.map(({ course, score, reasons }) => ({
          ...publicCourse(bySlug[course.slug]),
          score,
          reasons,
          progress: progressBySlug[course.slug],
        })),
      });
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/courses/:slug -> course + lessons (no variant bodies) + progress
  router.get('/courses/:slug', (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const course = db.prepare('SELECT * FROM courses WHERE slug = ?').get(req.params.slug);
      if (!course) return next(notFound('Course not found'));

      const lessons = db
        .prepare('SELECT id, position, title, duration_s FROM lessons WHERE course_id = ? ORDER BY position')
        .all(course.id);
      const completed = new Set(
        db
          .prepare(
            `SELECT lp.lesson_id id FROM lesson_progress lp
             JOIN lessons l ON lp.lesson_id = l.id
             WHERE l.course_id = ? AND lp.user_id = ?`
          )
          .all(course.id, req.userId)
          .map((r) => r.id)
      );

      const profile = loadProfile(db, req.userId);
      return res.json({
        course: publicCourse(course),
        lessons: lessons.map((l) => ({
          id: l.id,
          position: l.position,
          title: l.title,
          durationS: l.duration_s,
          completed: completed.has(l.id),
        })),
        progress: courseProgress(db, course.id, req.userId),
        servedStyle: { style: profile.learningStyle, confidence: profile.styleConfidence },
      });
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/lessons/:id -> both variant bodies + server-chosen servedVariant
  router.get('/lessons/:id', (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(Number(req.params.id));
      if (!lesson) return next(notFound('Lesson not found'));
      const profile = loadProfile(db, req.userId);
      const servedVariant = chooseVariant(profile.learningStyle, profile.styleConfidence);
      return res.json({
        lesson: {
          id: lesson.id,
          courseId: lesson.course_id,
          position: lesson.position,
          title: lesson.title,
          durationS: lesson.duration_s,
          visual: JSON.parse(lesson.visual),
          practical: JSON.parse(lesson.practical),
          servedVariant,
        },
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
