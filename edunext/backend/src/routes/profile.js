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
  router.get('/me', async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const user = await db.get('SELECT id, email, name, created_at, role FROM users WHERE id = ?', [req.userId]);
      if (!user) return next(notFound('User not found'));
      return res.json({ user: { ...user, role: user.role || 'student' }, profile: await loadProfile(db, req.userId) });
    } catch (err) {
      return next(err);
    }
  });

  // DELETE /api/me -> delete the user and all their data (cascades)
  router.delete('/me', async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      await db.run('DELETE FROM users WHERE id = ?', [req.userId]);
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  // PUT /api/profile/interests -> validate slugs against known topics
  router.put('/profile/interests', validate(interestsSchema), async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const topics = new Set(await knownTopics(db));
      const invalid = req.body.interests.filter((s) => !topics.has(s));
      if (invalid.length) return next(badRequest(`Unknown topic(s): ${invalid.join(', ')}`));
      await db.run('UPDATE profiles SET interests = ?, updated_at = ? WHERE user_id = ?', [
        JSON.stringify(req.body.interests),
        new Date().toISOString(),
        req.userId,
      ]);
      return res.json({ profile: await loadProfile(db, req.userId) });
    } catch (err) {
      return next(err);
    }
  });

  // PUT /api/profile/calibration -> store calibration, seed initial style, finish onboarding
  router.put('/profile/calibration', validate(calibrationSchema), async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const { calibration, styleProbe } = req.body;
      const current = await loadProfile(db, req.userId);

      let stats = current.styleStats;
      let style = current.learningStyle;
      let confidence = current.styleConfidence;
      if (styleProbe) {
        stats = addProbe(stats, styleProbe);
        const detected = detectStyle(stats);
        style = detected.style;
        confidence = detected.confidence;
      }

      await db.run(
        `UPDATE profiles SET calibration = ?, onboarding_complete = 1, learning_style = ?,
         style_confidence = ?, style_stats = ?, updated_at = ? WHERE user_id = ?`,
        [JSON.stringify(calibration), style, confidence, JSON.stringify(stats), new Date().toISOString(), req.userId]
      );
      return res.json({ profile: await loadProfile(db, req.userId) });
    } catch (err) {
      return next(err);
    }
  });

  // DELETE /api/profile/calibration -> reset for recalibration
  router.delete('/profile/calibration', async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      await db.run(
        `UPDATE profiles SET calibration = NULL, onboarding_complete = 0, learning_style = 'unknown',
         style_confidence = 0, style_stats = ?, updated_at = ? WHERE user_id = ?`,
        [DEFAULT_STYLE_STATS, new Date().toISOString(), req.userId]
      );
      return res.json({ profile: await loadProfile(db, req.userId) });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
