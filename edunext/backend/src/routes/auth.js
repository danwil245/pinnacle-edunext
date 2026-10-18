import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { registerSchema, loginSchema } from '@edunext/shared';
import { validate } from '../middleware/validate.js';
import { signToken, rateLimit } from '../middleware/auth.js';
import { conflict, unauthorized } from '../middleware/error.js';

export function authRoutes() {
  const router = Router();
  const limiter = rateLimit({ windowMs: 60_000, max: 30 });

  // POST /api/auth/register -> { token, user }
  router.post('/register', limiter, validate(registerSchema), (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const email = req.body.email.toLowerCase();
      const { name, password } = req.body;
      if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
        return next(conflict('That email is already registered'));
      }
      const now = new Date().toISOString();
      const hash = bcrypt.hashSync(password, 10);
      const info = db
        .prepare('INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)')
        .run(email, name, hash, now);
      const userId = Number(info.lastInsertRowid);
      db.prepare('INSERT INTO profiles (user_id, updated_at) VALUES (?, ?)').run(userId, now);
      return res.status(201).json({ token: signToken(userId), user: { id: userId, email, name } });
    } catch (err) {
      return next(err);
    }
  });

  // POST /api/auth/login -> { token, user } (generic error; no user enumeration)
  router.post('/login', limiter, validate(loginSchema), (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const email = req.body.email.toLowerCase();
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!user || !bcrypt.compareSync(req.body.password, user.password_hash)) {
        return next(unauthorized('Invalid email or password'));
      }
      return res.json({ token: signToken(user.id), user: { id: user.id, email: user.email, name: user.name } });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
