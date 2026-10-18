import { Router } from 'express';
import {
  interestsSchema,
  calibrationSchema,
  addProbe,
  detectStyle,
} from '@edunext/shared';
import { validate } from '../middleware/validate.js';
import { badRequest, notFound } from '../middleware/error.js';
import { loadProfile, knownTopics } from './helpers.js';

const DEFAULT_STYLE_STATS = '{"visual":{"sum":0,"w":0},"practical":{"sum":0,"w":0}}';

export function profileRoutes() {
  const router = Router();

  // GET /api/me -> user + profile
  router.get('/me', (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const user = db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(req.userId);
      if (!user) return next(notFound('User not found'));
      return res.json({ user, profile: loadProfile(db, req.userId) });
    } catch (err) {
      return next(err);
    }
  });

  // DELETE /api/me -> delete the user and all their data (cascades)
  router.delete('/me', (req, res, next) => {
    try {
      const db = req.app.locals.db;
      db.prepare('DELETE FROM users WHERE id = ?').run(req.userId);
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  // PUT /api/profile/interests -> validate slugs against known topics
  router.put('/profile/interests', validate(interestsSchema), (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const topics = new Set(knownTopics(db));
      const invalid = req.body.interests.filter((s) => !topics.has(s));
      if (invalid.length) return next(badRequest(`Unknown topic(s): ${invalid.join(', ')}`));
      db.prepare('UPDATE profiles SET interests = ?, updated_at = ? WHERE user_id = ?').run(
        JSON.stringify(req.body.interests),
        new Date().toISOString(),
        req.userId
      );
      return res.json({ profile: loadProfile(db, req.userId) });
    } catch (err) {
      return next(err);
    }
  });

  // PUT /api/profile/calibration -> store calibration, seed initial style, finish onboarding
  router.put('/profile/calibration', validate(calibrationSchema), (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const { calibration, styleProbe } = req.body;
      const current = loadProfile(db, req.userId);

      let stats = current.styleStats;
      let style = current.learningStyle;
      let confidence = current.styleConfidence;
      if (styleProbe) {
        stats = addProbe(stats, styleProbe);
        const detected = detectStyle(stats);
        style = detected.style;
        confidence = detected.confidence;
      }

      db.prepare(
        `UPDATE profiles SET calibration = ?, onboarding_complete = 1, learning_style = ?,
         style_confidence = ?, style_stats = ?, updated_at = ? WHERE user_id = ?`
      ).run(
        JSON.stringify(calibration),
        style,
        confidence,
        JSON.stringify(stats),
        new Date().toISOString(),
        req.userId
      );
      return res.json({ profile: loadProfile(db, req.userId) });
    } catch (err) {
      return next(err);
    }
  });

  // DELETE /api/profile/calibration -> reset for recalibration
  router.delete('/profile/calibration', (req, res, next) => {
    try {
      const db = req.app.locals.db;
      db.prepare(
        `UPDATE profiles SET calibration = NULL, onboarding_complete = 0, learning_style = 'unknown',
         style_confidence = 0, style_stats = ?, updated_at = ? WHERE user_id = ?`
      ).run(DEFAULT_STYLE_STATS, new Date().toISOString(), req.userId);
      return res.json({ profile: loadProfile(db, req.userId) });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
