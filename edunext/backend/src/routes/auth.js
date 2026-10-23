import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { registerSchema, loginSchema } from '@edunext/shared';
import { validate } from '../middleware/validate.js';
import { signToken, rateLimit } from '../middleware/auth.js';
import { conflict, unauthorized, badRequest } from '../middleware/error.js';

/**
 * Constant-time string compare that never short-circuits on length. Returns
 * false for any non-string or empty expected secret.
 */
export function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual requires equal lengths; hash to a fixed width first so the
  // comparison time doesn't leak the length either.
  if (ba.length !== bb.length) {
    // Compare against itself to keep timing roughly constant, then fail.
    try { timingSafeEqual(ba, ba); } catch { /* ignore */ }
    return false;
  }
  return timingSafeEqual(ba, bb);
}

export function authRoutes() {
  const router = Router();
  const limiter = rateLimit({ windowMs: 60_000, max: 30 });

  // POST /api/auth/register -> { token, user }
  router.post('/register', limiter, validate(registerSchema), async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const email = req.body.email.toLowerCase();
      const { name, password } = req.body;
      const wantsTeacher = req.body.role === 'teacher';

      // Teacher registration requires a valid invite code. The wrong code gives a
      // generic error (no hint which field failed) and still counts toward the
      // auth rate limit (the limiter ran above before we got here).
      if (wantsTeacher) {
        const expected = process.env.TEACHER_INVITE_CODE || '';
        if (!constantTimeEqual(String(req.body.inviteCode || ''), expected)) {
          return next(badRequest('Registration is not available with those details.'));
        }
      }
      const role = wantsTeacher ? 'teacher' : 'student';

      if (await db.get('SELECT id FROM users WHERE email = ?', [email])) {
        return next(conflict('That email is already registered'));
      }
      const now = new Date().toISOString();
      const hash = bcrypt.hashSync(password, 10);
      const info = await db.run(
        'INSERT INTO users (email, name, password_hash, created_at, role) VALUES (?, ?, ?, ?, ?)',
        [email, name, hash, now, role]
      );
      const userId = Number(info.lastInsertRowid);
      // Teachers get a profile row (uniform /me shape) already marked onboarded —
      // they need no camera calibration.
      await db.run(
        'INSERT INTO profiles (user_id, onboarding_complete, updated_at) VALUES (?, ?, ?)',
        [userId, role === 'teacher' ? 1 : 0, now]
      );
      return res
        .status(201)
        .json({ token: signToken(userId, role), user: { id: userId, email, name, role } });
    } catch (err) {
      // A unique-constraint race maps to the same 409 as the pre-check above.
      if (/UNIQUE constraint failed/i.test(err?.message || '')) {
        return next(conflict('That email is already registered'));
      }
      return next(err);
    }
  });

  // POST /api/auth/login -> { token, user } (generic error; no user enumeration)
  router.post('/login', limiter, validate(loginSchema), async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const email = req.body.email.toLowerCase();
      const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
      if (!user || !bcrypt.compareSync(req.body.password, user.password_hash)) {
        return next(unauthorized('Invalid email or password'));
      }
      const id = Number(user.id);
      const role = user.role === 'teacher' ? 'teacher' : 'student';
      return res.json({ token: signToken(id, role), user: { id, email: user.email, name: user.name, role } });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
