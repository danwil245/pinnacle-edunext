import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { authRequired } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error.js';
import { normalizeOrigin } from './config.js';
import { authRoutes } from './routes/auth.js';
import { profileRoutes } from './routes/profile.js';
import { courseRoutes } from './routes/courses.js';
import { sessionRoutes } from './routes/sessions.js';
import { insightsRoutes } from './routes/insights.js';
import { youtubeRoutes } from './routes/youtube.js';

/**
 * App factory. Takes an open better-sqlite3 handle so tests can pass an
 * in-memory DB and the server a file-backed one.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{corsOrigin?: string, corsOrigins?: string[], corsPatterns?: RegExp[], version?: string}} [opts]
 *   `corsOrigin` (legacy, e.g. '*') kept for tests; otherwise `corsOrigins` +
 *   optional `corsPatterns` (regex) define the allow-list.
 */
export function createApp(db, opts = {}) {
  const app = express();
  const version = opts.version || process.env.npm_package_version || '0.1.0';
  const startedAt = Date.now();

  // Render (and most PaaS) put the app behind exactly one proxy; trusting one hop
  // lets express-rate-limit and req.ip see the real client without being overly
  // permissive.
  app.set('trust proxy', 1);
  app.use(helmet());

  // --- CORS -----------------------------------------------------------------
  const legacy = opts.corsOrigin; // tests pass '*'
  const allow = (opts.corsOrigins || ['http://localhost:5173', 'http://localhost:4173']).map(normalizeOrigin);
  const patterns = opts.corsPatterns || [];
  const corsMw = cors({
    origin:
      legacy === '*'
        ? true
        : legacy
          ? [legacy]
          : (origin, cb) => {
              if (!origin) return cb(null, true); // same-origin / curl / server-to-server
              const n = normalizeOrigin(origin);
              const ok = allow.includes(n) || patterns.some((re) => re.test(n));
              // Reject by withholding CORS headers (no thrown error); browser blocks it.
              return cb(null, ok);
            },
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'Authorization,Content-Type',
    maxAge: 86400,
  });
  app.use(corsMw);
  app.options('*', corsMw); // explicit preflight

  app.use(express.json({ limit: '200kb' }));
  app.locals.db = db;

  // --- Health (root, cheap — used by the frontend cold-start ping) ----------
  app.get('/health', (_req, res) =>
    res.json({ status: 'ok', version, uptime: Math.round((Date.now() - startedAt) / 1000) })
  );
  app.get('/health/ready', async (_req, res) => {
    try {
      await db.get('SELECT 1');
      res.json({ status: 'ok', db: db.kind || 'ok' });
    } catch {
      res.status(503).json({ status: 'error', db: 'unavailable' });
    }
  });
  app.get('/api/health', (_req, res) => res.json({ ok: true, status: 'ok', version })); // back-compat

  // --- Auth (rate-limited; skipped under test to not throttle the suite) ----
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50, // per IP per window on /api/auth/*
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many attempts. Please wait a few minutes.' } },
  });
  if (process.env.NODE_ENV === 'test') app.use('/api/auth', authRoutes());
  else app.use('/api/auth', authLimiter, authRoutes());

  // Everything else requires auth.
  app.use('/api', authRequired);
  app.use('/api', profileRoutes());
  app.use('/api', courseRoutes());
  app.use('/api', sessionRoutes());
  app.use('/api', insightsRoutes());
  app.use('/api', youtubeRoutes());

  // Unknown API route -> 404 in the standard error shape.
  app.use('/api', (_req, _res, next) => next(notFound('Route not found')));
  app.use(errorHandler);

  return app;
}

export default createApp;
