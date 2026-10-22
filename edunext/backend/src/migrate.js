import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { openDb, enableForeignKeys } from './db.js';

/**
 * Create every table + index if absent. Idempotent: safe to run repeatedly.
 * Mirrors the data model in the build spec (Section 5).
 *
 * @param {ReturnType<import('./db.js').openDb>} db
 */
export async function migrate(db) {
  await enableForeignKeys(db);
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      interests TEXT NOT NULL DEFAULT '[]',
      onboarding_complete INTEGER NOT NULL DEFAULT 0,
      calibration TEXT,
      learning_style TEXT NOT NULL DEFAULT 'unknown',
      style_confidence REAL NOT NULL DEFAULT 0,
      style_stats TEXT NOT NULL DEFAULT '{"visual":{"sum":0,"w":0},"practical":{"sum":0,"w":0}}',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      description TEXT NOT NULL,
      level TEXT NOT NULL,
      practical_ratio REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      title TEXT NOT NULL,
      duration_s INTEGER NOT NULL,
      visual TEXT NOT NULL,
      practical TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      PRIMARY KEY (user_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS lesson_progress (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      completed_at TEXT NOT NULL,
      PRIMARY KEY (user_id, lesson_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      variant TEXT NOT NULL CHECK (variant IN ('visual','practical')),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      valid_seconds INTEGER NOT NULL DEFAULT 0,
      avg_score REAL,
      summary TEXT
    );

    CREATE TABLE IF NOT EXISTS ticks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      t INTEGER NOT NULL,
      bpm REAL,
      zone TEXT,
      emotion TEXT,
      score REAL,
      face_detected INTEGER NOT NULL,
      observed_s REAL
    );

    CREATE TABLE IF NOT EXISTS feedback_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      t INTEGER NOT NULL,
      kind TEXT NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS curation_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      t INTEGER NOT NULL,
      action TEXT NOT NULL,
      reason TEXT NOT NULL,
      outcome TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ticks_session ON ticks(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id, position);
  `);
  return db;
}

// CLI: `npm run migrate` (cross-platform entry check)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDb();
  await migrate(db);
  // eslint-disable-next-line no-console
  console.log(`Migrated database (${db.kind}: ${db.host})`);
  await db.close();
}
