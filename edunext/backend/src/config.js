import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment configuration, validated once at boot. On invalid config we print a
 * clear message and exit non-zero (fail fast) rather than start a half-broken
 * server. Never logs secret VALUES — only which keys are missing/invalid.
 */

const INSECURE_DEFAULTS = new Set([
  'dev-only-insecure-secret-change-me',
  'changeme',
  'secret',
  '',
]);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    // DATABASE_PATH is the documented name; DB_PATH kept for back-compat.
    DATABASE_PATH: z.string().optional(),
    DB_PATH: z.string().optional(),
    JWT_SECRET: z.string().optional(),
    // Comma-separated exact origins, e.g. "https://app.vercel.app,http://localhost:4173".
    CORS_ORIGINS: z.string().optional(),
    // Optional comma-separated regex sources for preview deploys (off by default).
    CORS_ORIGIN_PATTERNS: z.string().optional(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  })
  .superRefine((env, ctx) => {
    const isProd = env.NODE_ENV === 'production';
    if (isProd) {
      if (!env.JWT_SECRET || INSECURE_DEFAULTS.has(env.JWT_SECRET) || env.JWT_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'In production JWT_SECRET must be set to a strong value (>= 32 chars, not a known default).',
        });
      }
      // NOTE: CORS_ORIGINS is intentionally NOT required to boot. On the first
      // deploy you don't yet know the frontend URL (it needs the backend URL
      // first), so the server must start with an empty allow-list and be wired up
      // afterwards. We warn (below) instead of refusing to start.
    }
  });

/** Normalize an origin: trim and drop any trailing slash (CORS needs exact match). */
export function normalizeOrigin(o) {
  return String(o || '').trim().replace(/\/+$/, '');
}

function parseList(s) {
  return String(s || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    // eslint-disable-next-line no-console
    console.error('FATAL: invalid environment configuration:\n' + lines.join('\n'));
    process.exit(1);
  }
  const e = parsed.data;
  const corsOrigins = parseList(e.CORS_ORIGINS || (e.NODE_ENV !== 'production' ? 'http://localhost:5173,http://localhost:4173' : ''));
  if (e.NODE_ENV === 'production' && corsOrigins.length === 0) {
    // eslint-disable-next-line no-console
    console.warn('[warn] CORS_ORIGINS is empty — no cross-origin browser requests will be allowed yet. Set it to your frontend URL and redeploy.');
  }
  const corsPatterns = parseList(e.CORS_ORIGIN_PATTERNS).map((p) => {
    try {
      return new RegExp(p);
    } catch {
      return null;
    }
  }).filter(Boolean);

  return {
    nodeEnv: e.NODE_ENV,
    isProd: e.NODE_ENV === 'production',
    port: e.PORT,
    databasePath: e.DATABASE_PATH || e.DB_PATH || './data/edunext.db',
    jwtSecret: e.JWT_SECRET || 'dev-only-insecure-secret-change-me',
    corsOrigins,
    corsPatterns,
    logLevel: e.LOG_LEVEL,
  };
}

export default loadConfig;
