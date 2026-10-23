import { Router } from 'express';
import {
  CONFIG,
  avgEngagement,
  validShare,
  zoneDistribution,
  emotionDistribution,
  trend,
  flagLowEngagement,
  hasEnoughData,
  classTimeline,
  toCsv,
  round1,
} from '@edunext/shared';
import { notFound } from '../../middleware/error.js';
import { loadOwnedCourse } from './helpers.js';

/** Map a raw tick row to the camelCase shape the shared analytics expect. */
const mapTick = (r) => ({
  t: Number(r.t),
  score: r.score == null ? null : Number(r.score),
  zone: r.zone || null,
  emotion: r.emotion || null,
  faceDetected: !!Number(r.face_detected),
});

const TICK_S = CONFIG.TICK_MS / 1000;

/** Whether to fold synthetic demo rows into the query (default: include). */
function demoMode(req) {
  // ?demo=exclude hides demo rows; anything else (default) includes them. The
  // response echoes includesDemo so the UI can badge/banner accordingly.
  return req.query.demo === 'exclude' ? 'exclude' : 'include';
}
const demoSql = (mode) => (mode === 'exclude' ? 'AND s.is_demo = 0' : '');

export function teacherAnalyticsRoutes() {
  const router = Router();

  // GET /api/teacher/analytics/overview
  router.get('/analytics/overview', async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const mode = demoMode(req);
      const d = demoSql(mode);
      const courses = await db.all('SELECT * FROM courses WHERE owner_id = ? ORDER BY updated_at DESC, id DESC', [req.userId]);
      const courseIds = courses.map((c) => Number(c.id));

      const perCourse = [];
      let totalSessions = 0;
      const studentSet = new Set();
      const zoneTotals = {};
      let validSum = 0;
      let validCount = 0;
      const lessonAverages = [];

      for (const c of courses) {
        const sRow = await db.get(
          `SELECT COUNT(*) sessions, COUNT(DISTINCT s.user_id) students
             FROM sessions s JOIN lessons l ON s.lesson_id = l.id
            WHERE l.course_id = ? ${d}`,
          [c.id]
        );
        const eng = await db.get(
          `SELECT AVG(t.score) m, COUNT(*) n FROM ticks t
             JOIN sessions s ON t.session_id = s.id
             JOIN lessons l ON s.lesson_id = l.id
            WHERE l.course_id = ? AND t.face_detected = 1 AND t.score IS NOT NULL ${d}`,
          [c.id]
        );
        totalSessions += Number(sRow.sessions);
        const students = (await db.all(
          `SELECT DISTINCT s.user_id uid FROM sessions s JOIN lessons l ON s.lesson_id = l.id
            WHERE l.course_id = ? ${d}`,
          [c.id]
        )).map((r) => Number(r.uid));
        students.forEach((u) => studentSet.add(u));
        if (eng.n) { validSum += Number(eng.m) * Number(eng.n); validCount += Number(eng.n); }
        perCourse.push({
          id: Number(c.id),
          title: c.title,
          slug: c.slug,
          status: c.status || 'published',
          sessions: Number(sRow.sessions),
          students: Number(sRow.students),
          avgEngagement: eng.n ? round1(Number(eng.m)) : null,
        });

        // per-lesson averages for most/least engaging
        const lessonRows = await db.all(
          `SELECT l.id, l.title, AVG(t.score) m, COUNT(t.id) n
             FROM lessons l
             LEFT JOIN sessions s ON s.lesson_id = l.id ${mode === 'exclude' ? 'AND s.is_demo = 0' : ''}
             LEFT JOIN ticks t ON t.session_id = s.id AND t.face_detected = 1 AND t.score IS NOT NULL
            WHERE l.course_id = ?
            GROUP BY l.id`,
          [c.id]
        );
        for (const lr of lessonRows) {
          if (lr.n) lessonAverages.push({ lessonId: Number(lr.id), title: lr.title, course: c.title, avgEngagement: round1(Number(lr.m)) });
        }
      }

      // Overall zone shares (valid ticks only) across owner courses.
      if (courseIds.length) {
        const zrows = await db.all(
          `SELECT t.zone z, COUNT(*) n FROM ticks t
             JOIN sessions s ON t.session_id = s.id
             JOIN lessons l ON s.lesson_id = l.id
            WHERE l.course_id IN (${courseIds.map(() => '?').join(',')})
              AND t.face_detected = 1 AND t.zone IS NOT NULL ${d}
            GROUP BY t.zone`,
          courseIds
        );
        for (const r of zrows) zoneTotals[r.z] = Number(r.n);
      }

      // Recent activity (last 8 ended/started sessions across owner courses).
      let recent = [];
      if (courseIds.length) {
        recent = (await db.all(
          `SELECT s.id, s.started_at, s.avg_score, s.is_demo, l.title lesson, c.title course
             FROM sessions s JOIN lessons l ON s.lesson_id = l.id JOIN courses c ON l.course_id = c.id
            WHERE c.owner_id = ? ${d}
            ORDER BY s.started_at DESC LIMIT 8`,
          [req.userId]
        )).map((r) => ({
          sessionId: Number(r.id),
          lesson: r.lesson,
          course: r.course,
          startedAt: r.started_at,
          avgScore: r.avg_score == null ? null : round1(Number(r.avg_score)),
          isDemo: !!Number(r.is_demo),
        }));
      }

      lessonAverages.sort((a, b) => b.avgEngagement - a.avgEngagement);
      return res.json({
        includesDemo: mode === 'include',
        courses: perCourse,
        totals: {
          courses: courses.length,
          studentsStarted: studentSet.size,
          totalSessions,
          avgEngagement: validCount ? round1(validSum / validCount) : null,
        },
        zoneDistribution: zoneTotals,
        mostEngagingLessons: lessonAverages.slice(0, 3),
        leastEngagingLessons: lessonAverages.slice(-3).reverse(),
        recentActivity: recent,
      });
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/teacher/analytics/courses/:id -> per-lesson aggregates + timeline
  router.get('/analytics/courses/:id', async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const mode = demoMode(req);
      const d = demoSql(mode);
      const course = await loadOwnedCourse(db, req.userId, req.params.id);
      const lessons = await db.all('SELECT * FROM lessons WHERE course_id = ? ORDER BY position', [course.id]);

      const out = [];
      for (const lesson of lessons) {
        const sessions = await db.all(
          `SELECT s.id, s.variant, s.is_demo FROM sessions s WHERE s.lesson_id = ? ${d}`,
          [lesson.id]
        );
        const sessionIds = sessions.map((s) => Number(s.id));
        // Pull ticks for this lesson's sessions (bounded; aggregated server-side).
        let ticks = [];
        if (sessionIds.length) {
          ticks = (await db.all(
            `SELECT session_id, t, score, zone, emotion, face_detected FROM ticks
              WHERE session_id IN (${sessionIds.map(() => '?').join(',')})`,
            sessionIds
          )).map((r) => ({ ...mapTick(r), sessionId: Number(r.session_id) }));
        }
        // Group ticks by session for the timeline.
        const bySession = new Map();
        for (const id of sessionIds) bySession.set(id, []);
        for (const t of ticks) bySession.get(t.sessionId)?.push(t);
        const timelineSessions = sessionIds.map((id) => ({ ticks: bySession.get(id), durationS: lesson.duration_s || 0 }));

        // Valid sessions = those with at least one valid tick.
        const validSessionCount = timelineSessions.filter((s) => s.ticks.some((t) => t.faceDetected && t.score != null)).length;

        // Curation action counts.
        const actions = {};
        if (sessionIds.length) {
          for (const r of await db.all(
            `SELECT action, COUNT(*) n FROM curation_events WHERE session_id IN (${sessionIds.map(() => '?').join(',')}) GROUP BY action`,
            sessionIds
          )) actions[r.action] = Number(r.n);
        }

        // Visual vs practical average (valid ticks).
        const byVariant = { visual: [], practical: [] };
        for (const s of sessions) {
          const st = bySession.get(Number(s.id)) || [];
          byVariant[s.variant]?.push(...st);
        }

        const enough = hasEnoughData(validSessionCount);
        out.push({
          lessonId: Number(lesson.id),
          title: lesson.title,
          position: lesson.position,
          sessions: sessions.length,
          validSessions: validSessionCount,
          enoughData: enough,
          avgEngagement: enough ? round1(avgEngagement(ticks)) : null,
          validShare: round1(validShare(ticks) == null ? null : validShare(ticks) * 100),
          zoneDistribution: zoneDistribution(ticks.filter((t) => t.faceDetected)),
          emotionDistribution: emotionDistribution(ticks.filter((t) => t.faceDetected)),
          actions,
          variantEngagement: {
            visual: round1(avgEngagement(byVariant.visual)),
            practical: round1(avgEngagement(byVariant.practical)),
          },
          timeline: enough ? classTimeline(timelineSessions) : [],
        });
      }

      return res.json({
        includesDemo: mode === 'include',
        course: { id: Number(course.id), title: course.title, slug: course.slug, status: course.status },
        lessons: out,
      });
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/teacher/analytics/courses/:id/students -> per-student table
  router.get('/analytics/courses/:id/students', async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const mode = demoMode(req);
      const course = await loadOwnedCourse(db, req.userId, req.params.id);
      const rows = await studentRows(db, course.id, demoSql(mode));
      return res.json({ includesDemo: mode === 'include', course: { id: Number(course.id), title: course.title }, students: rows });
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/teacher/analytics/courses/:id/students/:studentId -> detail
  router.get('/analytics/courses/:id/students/:studentId', async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const mode = demoMode(req);
      const d = demoSql(mode);
      const course = await loadOwnedCourse(db, req.userId, req.params.id);
      const studentId = Number(req.params.studentId);

      // The student must actually have sessions in THIS course (owner scoping).
      const sessions = await db.all(
        `SELECT s.id, s.lesson_id, s.variant, s.started_at, s.avg_score, s.valid_seconds, s.is_demo, l.title lesson
           FROM sessions s JOIN lessons l ON s.lesson_id = l.id
          WHERE l.course_id = ? AND s.user_id = ? ${d}
          ORDER BY s.started_at`,
        [course.id, studentId]
      );
      if (sessions.length === 0) return next(notFound('No sessions for this student in this course'));

      const user = await db.get('SELECT id, name, is_demo FROM users WHERE id = ?', [studentId]);
      const profile = await db.get('SELECT learning_style, style_confidence FROM profiles WHERE user_id = ?', [studentId]);
      const sessionIds = sessions.map((s) => Number(s.id));
      const ticks = (await db.all(
        `SELECT session_id, t, score, zone, emotion, face_detected FROM ticks WHERE session_id IN (${sessionIds.map(() => '?').join(',')})`,
        sessionIds
      )).map(mapTick);

      const scores = sessions.map((s) => (s.avg_score == null ? null : Number(s.avg_score))).filter((x) => x != null);
      // Per-lesson rollup.
      const perLesson = {};
      for (const s of sessions) {
        const k = Number(s.lesson_id);
        (perLesson[k] ||= { lessonId: k, title: s.lesson, sessions: 0, scores: [] });
        perLesson[k].sessions += 1;
        if (s.avg_score != null) perLesson[k].scores.push(Number(s.avg_score));
      }

      return res.json({
        includesDemo: mode === 'include',
        student: {
          id: studentId,
          name: user?.name || `Student ${studentId}`,
          isDemo: !!Number(user?.is_demo),
          style: profile?.learning_style || 'unknown',
          styleConfidence: profile ? Number(profile.style_confidence) : 0,
          trend: trend(scores),
          flagged: flagLowEngagement(scores),
        },
        engagementOverTime: sessions.map((s) => ({
          sessionId: Number(s.id),
          lesson: s.lesson,
          startedAt: s.started_at,
          avgScore: s.avg_score == null ? null : round1(Number(s.avg_score)),
          isDemo: !!Number(s.is_demo),
        })),
        perLesson: Object.values(perLesson).map((p) => ({
          lessonId: p.lessonId,
          title: p.title,
          sessions: p.sessions,
          avgEngagement: round1(p.scores.length ? p.scores.reduce((a, b) => a + b, 0) / p.scores.length : null),
        })),
        zoneDistribution: zoneDistribution(ticks.filter((t) => t.faceDetected)),
        emotionDistribution: emotionDistribution(ticks.filter((t) => t.faceDetected)),
      });
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/teacher/analytics/courses/:id/export.csv -> per-student summary
  router.get('/analytics/courses/:id/export.csv', async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const mode = demoMode(req);
      const course = await loadOwnedCourse(db, req.userId, req.params.id);
      const rows = await studentRows(db, course.id, demoSql(mode));
      const csv = toCsv(
        rows.map((r) => ({
          student: r.name,
          demo: r.isDemo ? 'yes' : 'no',
          sessions: r.sessions,
          avgEngagement: r.avgEngagement ?? '',
          trend: r.trend,
          fatiguedSleepySeconds: r.fatiguedSleepySeconds,
          style: r.style,
          styleConfidence: r.styleConfidence,
          lastActive: r.lastActive,
          flagged: r.flagged ? 'check-in' : '',
        })),
        [
          { key: 'student', label: 'Student' },
          { key: 'demo', label: 'Demo' },
          { key: 'sessions', label: 'Sessions' },
          { key: 'avgEngagement', label: 'Avg engagement' },
          { key: 'trend', label: 'Trend' },
          { key: 'fatiguedSleepySeconds', label: 'Fatigued/sleepy seconds' },
          { key: 'style', label: 'Preferred style' },
          { key: 'styleConfidence', label: 'Style confidence' },
          { key: 'lastActive', label: 'Last active' },
          { key: 'flagged', label: 'Flag' },
        ]
      );
      const safe = course.slug.replace(/[^a-z0-9-]/gi, '');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safe}-students.csv"`);
      return res.send(csv);
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

/** Shared per-student rollup used by the table + CSV export. */
async function studentRows(db, courseId, d) {
  const students = await db.all(
    `SELECT DISTINCT s.user_id uid FROM sessions s JOIN lessons l ON s.lesson_id = l.id
      WHERE l.course_id = ? ${d}`,
    [courseId]
  );
  const rows = [];
  for (const { uid } of students) {
    const studentId = Number(uid);
    const sessions = await db.all(
      `SELECT s.id, s.avg_score, s.started_at, s.is_demo FROM sessions s
         JOIN lessons l ON s.lesson_id = l.id
        WHERE l.course_id = ? AND s.user_id = ? ${d}
        ORDER BY s.started_at`,
      [courseId, studentId]
    );
    const user = await db.get('SELECT name, is_demo FROM users WHERE id = ?', [studentId]);
    const profile = await db.get('SELECT learning_style, style_confidence FROM profiles WHERE user_id = ?', [studentId]);
    const eng = await db.get(
      `SELECT AVG(t.score) m FROM ticks t
         JOIN sessions s ON t.session_id = s.id JOIN lessons l ON s.lesson_id = l.id
        WHERE l.course_id = ? AND s.user_id = ? AND t.face_detected = 1 AND t.score IS NOT NULL ${d}`,
      [courseId, studentId]
    );
    const fatigue = await db.get(
      `SELECT COUNT(*) n FROM ticks t
         JOIN sessions s ON t.session_id = s.id JOIN lessons l ON s.lesson_id = l.id
        WHERE l.course_id = ? AND s.user_id = ? AND t.face_detected = 1
          AND t.zone IN ('fatigued','sleepy') ${d}`,
      [courseId, studentId]
    );
    const scores = sessions.map((s) => (s.avg_score == null ? null : Number(s.avg_score))).filter((x) => x != null);
    rows.push({
      id: studentId,
      name: user?.name || `Student ${studentId}`,
      isDemo: !!Number(user?.is_demo),
      sessions: sessions.length,
      avgEngagement: eng.m == null ? null : round1(Number(eng.m)),
      trend: trend(scores),
      fatiguedSleepySeconds: Math.round(Number(fatigue.n) * TICK_S),
      style: profile?.learning_style || 'unknown',
      styleConfidence: profile ? round1(Number(profile.style_confidence)) : 0,
      lastActive: sessions.length ? sessions[sessions.length - 1].started_at : null,
      flagged: flagLowEngagement(scores),
    });
  }
  // Highest-engagement first; unknowns last.
  rows.sort((a, b) => (b.avgEngagement ?? -1) - (a.avgEngagement ?? -1));
  return rows;
}

export default teacherAnalyticsRoutes;
