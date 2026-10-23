import jwt from 'jsonwebtoken';
import { unauthorized, forbidden, ApiError } from './error.js';

const DEV_SECRET = 'dev-only-insecure-secret-change-me';

/** The JWT signing secret: env in all real use, a dev fallback otherwise. */
export function jwtSecret() {
  return process.env.JWT_SECRET || DEV_SECRET;
}

/** Sign a 7-day token for a user id, carrying the (signed, client-unforgeable) role. */
export function signToken(userId, role = 'student') {
  return jwt.sign({ sub: String(userId), role }, jwtSecret(), { expiresIn: '7d' });
}

/**
 * Auth guard. Requires `Authorization: Bearer <token>`; on success sets
 * `req.userId` (a number) and `req.userRole` (string, defaults 'student' for
 * tokens minted before roles existed). Any failure -> 401.
 */
export function authRequired(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, jwtSecret());
    req.userId = Number(payload.sub);
    req.userRole = payload.role === 'teacher' ? 'teacher' : 'student';
    if (!Number.isFinite(req.userId)) return next(unauthorized());
    return next();
  } catch {
    return next(unauthorized('Invalid or expired token'));
  }
}

/**
 * Role guard. Use after `authRequired`. Rejects a mismatched role with 403.
 * The role comes from the signed JWT claim, so a client cannot elevate itself.
 * @param {'teacher'|'student'} role
 */
export function requireRole(role) {
  return (req, _res, next) => {
    if (req.userRole !== role) return next(forbidden('This area is for teachers only'));
    return next();
  };
}

/**
 * Tiny in-memory rate limiter for auth routes (per IP). Not for production
 * scale — just enough to blunt brute-force in a demo. Fixed window.
 */
export function rateLimit({ windowMs = 60_000, max = 20 } = {}) {
  const hits = new Map();
  return (req, _res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now > entry.reset) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      return next(new ApiError(429, 'rate_limited', 'Too many requests, slow down'));
    }
    return next();
  };
}
