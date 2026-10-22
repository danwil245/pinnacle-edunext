import { Router } from 'express';

export function insightsRoutes() {
  const router = Router();

  // GET /api/insights -> score series per session + overall distributions + style-by-variant
  router.get('/insights', async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const sessions = await db.all(
        `SELECT s.id, s.lesson_id, s.variant, s.started_at, s.ended_at, s.avg_score, s.valid_seconds, l.title
           FROM sessions s JOIN lessons l ON s.lesson_id = l.id
           WHERE s.user_id = ? AND s.ended_at IS NOT NULL
           ORDER BY s.started_at`,
        [req.userId]
      );

      const sessionOut = [];
      for (const s of sessions) {
        const series = await db.all(
          'SELECT t, score FROM ticks WHERE session_id = ? AND score IS NOT NULL ORDER BY t',
          [s.id]
        );
        sessionOut.push({
          id: Number(s.id),
          lessonId: Number(s.lesson_id),
          lessonTitle: s.title,
          variant: s.variant,
          startedAt: s.started_at,
          endedAt: s.ended_at,
          avgScore: s.avg_score,
          validSeconds: s.valid_seconds,
          series: series.map((r) => ({ t: Number(r.t), score: r.score })),
        });
      }

      // Overall zone/emotion distributions across the user's ticks.
      const zoneDistribution = toMap(
        await db.all(
          `SELECT t.zone k, COUNT(*) n FROM ticks t JOIN sessions s ON t.session_id = s.id
             WHERE s.user_id = ? AND t.zone IS NOT NULL GROUP BY t.zone`,
          [req.userId]
        )
      );
      const emotionDistribution = toMap(
        await db.all(
          `SELECT t.emotion k, COUNT(*) n FROM ticks t JOIN sessions s ON t.session_id = s.id
             WHERE s.user_id = ? AND t.emotion IS NOT NULL GROUP BY t.emotion`,
          [req.userId]
        )
      );

      // Mean engagement by variant.
      const styleByVariant = {};
      for (const row of await db.all(
        `SELECT variant, AVG(avg_score) m, COUNT(*) n FROM sessions
           WHERE user_id = ? AND avg_score IS NOT NULL GROUP BY variant`,
        [req.userId]
      )) {
        styleByVariant[row.variant] = { meanScore: row.m, count: Number(row.n) };
      }

      return res.json({ sessions: sessionOut, zoneDistribution, emotionDistribution, styleByVariant });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

function toMap(rows) {
  return Object.fromEntries(rows.map((r) => [r.k, Number(r.n)]));
}
