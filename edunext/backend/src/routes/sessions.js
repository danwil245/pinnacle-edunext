import { Router } from 'express';
import {
  CONFIG,
  sessionCreateSchema,
  ticksBatchSchema,
  feedbackSchema,
  curationSchema,
  endSessionSchema,
  chooseVariant,
  addSession,
  detectStyle,
} from '@edunext/shared';
import { validate } from '../middleware/validate.js';
import { notFound } from '../middleware/error.js';
import { loadProfile, loadOwnedSession } from './helpers.js';

export function sessionRoutes() {
  const router = Router();

  // POST /api/sessions { lessonId } -> { sessionId, variant }
  router.post('/sessions', validate(sessionCreateSchema), async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const lesson = await db.get('SELECT * FROM lessons WHERE id = ?', [req.body.lessonId]);
      if (!lesson) return next(notFound('Lesson not found'));

      const profile = await loadProfile(db, req.userId);
      const variant = chooseVariant(profile.learningStyle, profile.styleConfidence);
      const now = new Date().toISOString();

      const sessionId = await db.transaction(async (tx) => {
        await tx.run('INSERT OR IGNORE INTO enrollments (user_id, course_id, started_at) VALUES (?, ?, ?)', [
          req.userId,
          Number(lesson.course_id),
          now,
        ]);
        const info = await tx.run('INSERT INTO sessions (user_id, lesson_id, variant, started_at) VALUES (?, ?, ?, ?)', [
          req.userId,
          Number(lesson.id),
          variant,
          now,
        ]);
        return Number(info.lastInsertRowid);
      });
      return res.status(201).json({ sessionId, variant });
    } catch (err) {
      return next(err);
    }
  });

  // POST /api/sessions/:id/ticks { ticks: [...] } (<=200, owner-checked)
  router.post('/sessions/:id/ticks', validate(ticksBatchSchema), async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const sessionId = Number(req.params.id);
      await loadOwnedSession(db, req.userId, sessionId);
      const statements = req.body.ticks.map((t) => ({
        sql: `INSERT INTO ticks (session_id, t, bpm, zone, emotion, score, face_detected, observed_s)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [sessionId, t.t, t.bpm ?? null, t.zone ?? null, t.emotion ?? null, t.score ?? null, t.faceDetected ? 1 : 0, t.observedS ?? null],
      }));
      if (statements.length) await db.batch(statements, 'write');
      return res.json({ ok: true, stored: req.body.ticks.length });
    } catch (err) {
      return next(err);
    }
  });

  // POST /api/sessions/:id/feedback { t, kind, value }
  router.post('/sessions/:id/feedback', validate(feedbackSchema), async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const sessionId = Number(req.params.id);
      await loadOwnedSession(db, req.userId, sessionId);
      await db.run('INSERT INTO feedback_events (session_id, t, kind, value) VALUES (?, ?, ?, ?)', [
        sessionId,
        req.body.t,
        req.body.kind,
        req.body.value,
      ]);
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  // POST /api/sessions/:id/curation { t, action, reason, outcome }
  router.post('/sessions/:id/curation', validate(curationSchema), async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const sessionId = Number(req.params.id);
      await loadOwnedSession(db, req.userId, sessionId);
      await db.run('INSERT INTO curation_events (session_id, t, action, reason, outcome) VALUES (?, ?, ?, ?, ?)', [
        sessionId,
        req.body.t,
        req.body.action,
        req.body.reason,
        req.body.outcome,
      ]);
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  // POST /api/sessions/:id/end { completed } -> summary (idempotent)
  router.post('/sessions/:id/end', validate(endSessionSchema), async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const sessionId = Number(req.params.id);
      const session = await loadOwnedSession(db, req.userId, sessionId);

      // Idempotent: a second call returns the stored summary, no re-counting.
      if (session.ended_at) {
        return res.json({ summary: session.summary ? JSON.parse(session.summary) : null, alreadyEnded: true });
      }

      const summary = await buildAndPersistSummary(db, session, req.userId, req.body.completed);
      return res.json({ summary });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

/** Compute the session summary from stored ticks, update style, mark progress — all in one transaction. */
async function buildAndPersistSummary(db, session, userId, completed) {
  const ticks = await db.all('SELECT * FROM ticks WHERE session_id = ? ORDER BY t', [session.id]);
  const scored = ticks.filter((t) => t.score != null);
  const avgScore = scored.length ? scored.reduce((a, t) => a + t.score, 0) / scored.length : null;

  // Valid seconds: ticks with a face AND a real score, each worth one TICK_MS.
  const validTicks = ticks.filter((t) => t.face_detected && t.score != null);
  const validSeconds = Math.round((validTicks.length * CONFIG.TICK_MS) / 1000);

  const zoneDistribution = {};
  const emotionDistribution = {};
  for (const t of ticks) {
    if (t.zone) zoneDistribution[t.zone] = (zoneDistribution[t.zone] || 0) + 1;
    if (t.emotion) emotionDistribution[t.emotion] = (emotionDistribution[t.emotion] || 0) + 1;
  }

  const curationRows = await db.all(
    'SELECT t, action, reason, outcome FROM curation_events WHERE session_id = ? ORDER BY t',
    [session.id]
  );
  const curationEvents = curationRows.map((r) => ({ t: Number(r.t), action: r.action, reason: r.reason, outcome: r.outcome }));

  const profile = await loadProfile(db, userId);
  const nextStats = addSession(profile.styleStats, session.variant, avgScore, validSeconds);
  const detected = detectStyle(nextStats);

  const summary = {
    sessionId: Number(session.id),
    lessonId: Number(session.lesson_id),
    variant: session.variant,
    completed: !!completed,
    avgScore,
    validSeconds,
    zoneDistribution,
    emotionDistribution,
    curationEvents,
    style: { style: detected.style, confidence: detected.confidence },
    scoreSeries: scored.map((t) => ({ t: Number(t.t), score: t.score })),
  };

  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.run('UPDATE sessions SET ended_at = ?, valid_seconds = ?, avg_score = ?, summary = ? WHERE id = ?', [
      now,
      validSeconds,
      avgScore,
      JSON.stringify(summary),
      Number(session.id),
    ]);
    await tx.run(
      `UPDATE profiles SET style_stats = ?, learning_style = ?, style_confidence = ?, updated_at = ? WHERE user_id = ?`,
      [JSON.stringify(nextStats), detected.style, detected.confidence, now, userId]
    );
    if (completed) {
      await tx.run('INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?, ?, ?)', [
        userId,
        Number(session.lesson_id),
        now,
      ]);
    }
  });

  return summary;
}
