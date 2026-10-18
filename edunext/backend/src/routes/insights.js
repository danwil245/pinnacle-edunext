import { Router } from 'express';

export function insightsRoutes() {
  const router = Router();

  // GET /api/insights -> score series per session + overall distributions + style-by-variant
  router.get('/insights', (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const sessions = db
        .prepare(
          `SELECT s.id, s.lesson_id, s.variant, s.started_at, s.ended_at, s.avg_score, s.valid_seconds, l.title
           FROM sessions s JOIN lessons l ON s.lesson_id = l.id
           WHERE s.user_id = ? AND s.ended_at IS NOT NULL
           ORDER BY s.started_at`
        )
        .all(req.userId);

      const seriesStmt = db.prepare(
        'SELECT t, score FROM ticks WHERE session_id = ? AND score IS NOT NULL ORDER BY t'
      );

      const sessionOut = sessions.map((s) => ({
        id: s.id,
        lessonId: s.lesson_id,
        lessonTitle: s.title,
        variant: s.variant,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        avgScore: s.avg_score,
        validSeconds: s.valid_seconds,
        series: seriesStmt.all(s.id),
      }));

      // Overall zone/emotion distributions across the user's ticks.
      const zoneDistribution = toMap(
        db
          .prepare(
            `SELECT t.zone k, COUNT(*) n FROM ticks t JOIN sessions s ON t.session_id = s.id
             WHERE s.user_id = ? AND t.zone IS NOT NULL GROUP BY t.zone`
          )
          .all(req.userId)
      );
      const emotionDistribution = toMap(
        db
          .prepare(
            `SELECT t.emotion k, COUNT(*) n FROM ticks t JOIN sessions s ON t.session_id = s.id
             WHERE s.user_id = ? AND t.emotion IS NOT NULL GROUP BY t.emotion`
          )
          .all(req.userId)
      );

      // Mean engagement by variant.
      const styleByVariant = {};
      for (const row of db
        .prepare(
          `SELECT variant, AVG(avg_score) m, COUNT(*) n FROM sessions
           WHERE user_id = ? AND avg_score IS NOT NULL GROUP BY variant`
        )
        .all(req.userId)) {
        styleByVariant[row.variant] = { meanScore: row.m, count: row.n };
      }

      return res.json({ sessions: sessionOut, zoneDistribution, emotionDistribution, styleByVariant });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

function toMap(rows) {
  return Object.fromEntries(rows.map((r) => [r.k, r.n]));
}
