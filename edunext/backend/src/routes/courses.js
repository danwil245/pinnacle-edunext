import { Router } from 'express';
import { rankCourses, chooseVariant } from '@edunext/shared';
import { notFound } from '../middleware/error.js';
import { loadProfile, publicCourse } from './helpers.js';

async function courseProgress(db, courseId, userId) {
  const total = Number((await db.get('SELECT COUNT(*) n FROM lessons WHERE course_id = ?', [courseId])).n);
  const completed = Number(
    (await db.get(
      `SELECT COUNT(*) n FROM lesson_progress lp
       JOIN lessons l ON lp.lesson_id = l.id
       WHERE l.course_id = ? AND lp.user_id = ?`,
      [courseId, userId]
    )).n
  );
  const enr = await db.get('SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?', [userId, courseId]);
  const sess = await db.get(
    'SELECT 1 FROM sessions s JOIN lessons l ON s.lesson_id = l.id WHERE s.user_id = ? AND l.course_id = ? LIMIT 1',
    [userId, courseId]
  );
  return { total, completed, started: !!enr || !!sess };
}

export function courseRoutes() {
  const router = Router();

  // GET /api/courses -> ranked list with reasons
  router.get('/courses', async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const profile = await loadProfile(db, req.userId);
      const rows = await db.all('SELECT * FROM courses');

      const sessionsByTopic = Object.fromEntries(
        (await db.all(
          `SELECT c.topic topic, AVG(s.avg_score) m FROM sessions s
             JOIN lessons l ON s.lesson_id = l.id
             JOIN courses c ON l.course_id = c.id
             WHERE s.user_id = ? AND s.avg_score IS NOT NULL
             GROUP BY c.topic`,
          [req.userId]
        )).map((r) => [r.topic, r.m])
      );

      const progressBySlug = {};
      const progressByCourse = {};
      for (const r of rows) {
        const p = await courseProgress(db, r.id, req.userId);
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
  router.get('/courses/:slug', async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const course = await db.get('SELECT * FROM courses WHERE slug = ?', [req.params.slug]);
      if (!course) return next(notFound('Course not found'));

      const lessons = await db.all(
        'SELECT id, position, title, duration_s FROM lessons WHERE course_id = ? ORDER BY position',
        [course.id]
      );
      const completed = new Set(
        (await db.all(
          `SELECT lp.lesson_id id FROM lesson_progress lp
             JOIN lessons l ON lp.lesson_id = l.id
             WHERE l.course_id = ? AND lp.user_id = ?`,
          [course.id, req.userId]
        )).map((r) => Number(r.id))
      );

      const profile = await loadProfile(db, req.userId);
      return res.json({
        course: publicCourse(course),
        lessons: lessons.map((l) => ({
          id: Number(l.id),
          position: l.position,
          title: l.title,
          durationS: l.duration_s,
          completed: completed.has(Number(l.id)),
        })),
        progress: await courseProgress(db, course.id, req.userId),
        servedStyle: { style: profile.learningStyle, confidence: profile.styleConfidence },
      });
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/lessons/:id -> both variant bodies + server-chosen servedVariant
  router.get('/lessons/:id', async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const lesson = await db.get('SELECT * FROM lessons WHERE id = ?', [Number(req.params.id)]);
      if (!lesson) return next(notFound('Lesson not found'));
      const profile = await loadProfile(db, req.userId);
      const servedVariant = chooseVariant(profile.learningStyle, profile.styleConfidence);
      return res.json({
        lesson: {
          id: Number(lesson.id),
          courseId: Number(lesson.course_id),
          position: lesson.position,
          title: lesson.title,
          durationS: lesson.duration_s,
          visual: {
            ...JSON.parse(lesson.visual),
            videoId: lesson.visual_video_id || null,
            startSeconds: Number(lesson.visual_start_s || 0),
            notes: lesson.visual_notes || null,
          },
          practical: {
            ...JSON.parse(lesson.practical),
            videoId: lesson.practical_video_id || null,
            startSeconds: Number(lesson.practical_start_s || 0),
            exercise: lesson.practical_exercise || null,
          },
          servedVariant,
        },
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
