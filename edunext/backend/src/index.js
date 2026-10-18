import { existsSync } from 'node:fs';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';

const log = (...a) => console.log('[edunext]', ...a); // eslint-disable-line no-console

const cfg = loadConfig();

// Was this a brand-new database file? (accounts will be empty / reset)
const fresh = cfg.databasePath !== ':memory:' && !existsSync(cfg.databasePath);

const db = openDb(cfg.databasePath);
migrate(db); // idempotent

// Auto-seed placeholder courses so a fresh/wiped DB works with no manual step.
const courseCount = db.prepare('SELECT COUNT(*) AS n FROM courses').get().n;
if (courseCount === 0) {
  const counts = seed(db);
  log(`seeded ${counts.courses} courses / ${counts.lessons} lessons`);
}

log(`db: ${cfg.databasePath}${fresh ? ' (freshly created — accounts reset)' : ''}`);
log(`env: ${cfg.nodeEnv}, cors: [${cfg.corsOrigins.join(', ') || 'none'}]`);

const app = createApp(db, { corsOrigins: cfg.corsOrigins, corsPatterns: cfg.corsPatterns });

const server = app.listen(cfg.port, '0.0.0.0', () => {
  log(`listening on 0.0.0.0:${cfg.port}`);
});

// Graceful shutdown: Render sends SIGTERM on deploys. Finish in-flight requests,
// close the DB cleanly (flush WAL), then exit.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`${signal} received — shutting down`);
  server.close(() => {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(0);
  });
  // Safety net if connections hang.
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
