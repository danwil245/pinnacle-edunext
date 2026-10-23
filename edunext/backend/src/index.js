import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
import { seedDemoTeacher } from './seedTeacher.js';

const log = (...a) => console.log('[edunext]', ...a); // eslint-disable-line no-console

const cfg = loadConfig();

/** Retry with short backoff — a remote DB can be briefly unavailable at boot. */
async function withRetry(fn, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      log(`db init attempt ${i + 1}/${tries} failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw last;
}

// openDb reads TURSO_DATABASE_URL / DATABASE_PATH from the environment; Turso
// (if configured) takes precedence over the local file path.
const db = openDb({ path: cfg.databasePath });

try {
  await withRetry(() => migrate(db)); // idempotent
  // Ensure the demo teacher exists on every boot (idempotent; never overwrites a
  // password). Independent of content seeding so an already-seeded DB still gets
  // the teacher once DEMO_TEACHER_* env is set.
  try {
    const t = await seedDemoTeacher(db);
    // Backfill ownership of still-unowned seeded courses onto the demo teacher.
    await db.run('UPDATE courses SET owner_id = ? WHERE owner_id IS NULL', [t.id]);
    log(`demo teacher ${t.created ? 'created' : 'present'} (${t.email})`);
  } catch (err) {
    log('demo teacher not seeded:', err.message);
  }
  // Auto-seed so a fresh/wiped DB works with no manual step. Also re-run when an
  // existing DB is missing lesson content added by a later migration (e.g. the
  // video-id columns) so those rows get backfilled on deploy. seed() is an
  // idempotent upsert on courses/lessons only — it never touches user data.
  const row = await db.get('SELECT COUNT(*) AS n FROM courses');
  const missing = await db.get(
    'SELECT COUNT(*) AS n FROM lessons WHERE visual_video_id IS NULL OR practical_video_id IS NULL'
  );
  const needsSeed = Number(row?.n || 0) === 0;
  const needsBackfill = Number(missing?.n || 0) > 0;
  if (needsSeed || needsBackfill) {
    const counts = await seed(db);
    log(
      `${needsSeed ? 'seeded' : 'backfilled'} ${counts.courses} courses / ${counts.lessons} lessons`
    );
  }
} catch (err) {
  log('FATAL: database initialisation failed:', err.message);
  process.exit(1);
}

// Never log the token or full URL — host only.
log(`db: ${db.kind} (${db.host})`);
log(`env: ${cfg.nodeEnv}, cors: [${cfg.corsOrigins.join(', ') || 'none'}]`);

const app = createApp(db, { corsOrigins: cfg.corsOrigins, corsPatterns: cfg.corsPatterns });

const server = app.listen(cfg.port, '0.0.0.0', () => {
  log(`listening on 0.0.0.0:${cfg.port}`);
});

// Graceful shutdown: Render sends SIGTERM on deploys. Finish in-flight requests,
// close the DB cleanly, then exit.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`${signal} received — shutting down`);
  server.close(async () => {
    try {
      await db.close();
    } catch {
      /* ignore */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
