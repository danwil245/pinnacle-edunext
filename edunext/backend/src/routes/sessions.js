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
  router.post('/sessions', validate(sessionCreateSchema), (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.body.lessonId);
      if (!lesson) return next(notFound('Lesson not found'));

      const profile = loadProfile(db, req.userId);
      const variant = chooseVariant(profile.learningStyle, profile.styleConfidence);
      const now = new Date().toISOString();

      const tx = db.transaction(() => {
        db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id, started_at) VALUES (?, ?, ?)').run(
          req.userId,
          lesson.course_id,
          now
        );
        const info = db
          .prepare('INSERT INTO sessions (user_id, lesson_id, variant, started_at) VALUES (?, ?, ?, ?)')
          .run(req.userId, lesson.id, variant, now);
        return Number(info.lastInsertRowid);
      });
      const sessionId = tx();
      return res.status(201).json({ sessionId, variant });
    } catch (err) {
      return next(err);
    }
  });

  // POST /api/sessions/:id/ticks { ticks: [...] } (<=200, owner-checked)
  router.post('/sessions/:id/ticks', validate(ticksBatchSchema), (req, res, next) => {
    try {
      const db = req.app.locals.db;
      loadOwnedSession(db, req.userId, Number(req.params.id));
      const stmt = db.prepare(
        `INSERT INTO ticks (session_id, t, bpm, zone, emotion, score, face_detected, observed_s)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const insertAll = db.transaction((ticks) => {
        for (const t of ticks) {
          stmt.run(Number(req.params.id), t.t, t.bpm, t.zone, t.emotion, t.score, t.faceDetected ? 1 : 0, t.observedS);
        }
      });
      insertAll(req.body.ticks);
      return res.json({ ok: true, stored: req.body.ticks.length });
    } catch (err) {
      return next(err);
    }
  });

  // POST /api/sessions/:id/feedback { t, kind, value }
  router.post('/sessions/:id/feedback', validate(feedbackSchema), (req, res, next) => {
    try {
      const db = req.app.locals.db;
      loadOwnedSession(db, req.userId, Number(req.params.id));
      db.prepare('INSERT INTO feedback_events (session_id, t, kind, value) VALUES (?, ?, ?, ?)').run(
        Number(req.params.id),
        req.body.t,
        req.body.kind,
        req.body.value
      );
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  // POST /api/sessions/:id/curation { t, action, reason, outcome }
  router.post('/sessions/:id/curation', validate(curationSchema), (req, res, next) => {
    try {
      const db = req.app.locals.db;
      loadOwnedSession(db, req.userId, Number(req.params.id));
      db.prepare('INSERT INTO curation_events (session_id, t, action, reason, outcome) VALUES (?, ?, ?, ?, ?)').run(
        Number(req.params.id),
        req.body.t,
        req.body.action,
        req.body.reason,
        req.body.outcome
      );
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  // POST /api/sessions/:id/end { completed } -> summary (idempotent)
  router.post('/sessions/:id/end', validate(endSessionSchema), (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const sessionId = Number(req.params.id);
      const session = loadOwnedSession(db, req.userId, sessionId);

      // Idempotent: a second call returns the stored summary, no re-counting.
      if (session.ended_at) {
        return res.json({ summary: session.summary ? JSON.parse(session.summary) : null, alreadyEnded: true });
      }

      const summary = buildAndPersistSummary(db, session, req.userId, req.body.completed);
      return res.json({ summary });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

/** Compute the session summary from stored ticks, update style, mark progress — all in one transaction. */
function buildAndPersistSummary(db, session, userId, completed) {
  const ticks = db.prepare('SELECT * FROM ticks WHERE session_id = ? ORDER BY t').all(session.id);
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

  const curationEvents = db
    .prepare('SELECT t, action, reason, outcome FROM curation_events WHERE session_id = ? ORDER BY t')
    .all(session.id);

  const profile = loadProfile(db, userId);
  const nextStats = addSession(profile.styleStats, session.variant, avgScore, validSeconds);
  const detected = detectStyle(nextStats);

  const summary = {
    sessionId: session.id,
    lessonId: session.lesson_id,
    variant: session.variant,
    completed: !!completed,
    avgScore,
    validSeconds,
    zoneDistribution,
    emotionDistribution,
    curationEvents,
    style: { style: detected.style, confidence: detected.confidence },
    scoreSeries: scored.map((t) => ({ t: t.t, score: t.score })),
  };

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare('UPDATE sessions SET ended_at = ?, valid_seconds = ?, avg_score = ?, summary = ? WHERE id = ?').run(
      now,
      validSeconds,
      avgScore,
      JSON.stringify(summary),
      session.id
    );
    db.prepare(
      `UPDATE profiles SET style_stats = ?, learning_style = ?, style_confidence = ?, updated_at = ? WHERE user_id = ?`
    ).run(JSON.stringify(nextStats), detected.style, detected.confidence, now, userId);
    if (completed) {
      db.prepare('INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?, ?, ?)').run(
        userId,
        session.lesson_id,
        now
      );
    }
  });
  tx();

  return summary;
}
