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

  // Additive (idempotent): per-variant YouTube video references + optional notes.
  // SQLite has no "ADD COLUMN IF NOT EXISTS", so check table_info first.
  await addColumnIfMissing(db, 'lessons', 'visual_video_id', 'TEXT');
  await addColumnIfMissing(db, 'lessons', 'practical_video_id', 'TEXT');
  await addColumnIfMissing(db, 'lessons', 'visual_start_s', 'INTEGER');
  await addColumnIfMissing(db, 'lessons', 'practical_start_s', 'INTEGER');
  await addColumnIfMissing(db, 'lessons', 'visual_notes', 'TEXT');
  await addColumnIfMissing(db, 'lessons', 'practical_exercise', 'TEXT');

  // --- Teacher dashboard (Prompt B) -----------------------------------------
  // Roles: existing users default to 'student'. A CHECK can't be added to an
  // existing column via ALTER in SQLite, so the role vocabulary is enforced in
  // the app layer (auth route + requireRole).
  await addColumnIfMissing(db, 'users', 'role', "TEXT NOT NULL DEFAULT 'student'");
  await addColumnIfMissing(db, 'users', 'is_demo', 'INTEGER NOT NULL DEFAULT 0');

  // Course ownership + lifecycle. owner_id nullable (seeded demo courses are
  // assigned to the demo teacher at seed time). Pre-existing courses default to
  // 'published' so the student catalogue keeps working through the migration.
  await addColumnIfMissing(db, 'courses', 'owner_id', 'INTEGER REFERENCES users(id)');
  await addColumnIfMissing(db, 'courses', 'status', "TEXT NOT NULL DEFAULT 'published'");
  await addColumnIfMissing(db, 'courses', 'created_at', 'TEXT');
  await addColumnIfMissing(db, 'courses', 'updated_at', 'TEXT');

  // Optional teacher-authored lesson description (notes/exercise already exist).
  await addColumnIfMissing(db, 'lessons', 'description', 'TEXT');

  // Synthetic demo-analytics sessions are flagged so they never mix into real
  // numbers without a badge.
  await addColumnIfMissing(db, 'sessions', 'is_demo', 'INTEGER NOT NULL DEFAULT 0');

  // Indexes for the analytics queries.
  await db.executeMultiple(`
    CREATE INDEX IF NOT EXISTS idx_sessions_lesson ON sessions(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_lesson ON sessions(user_id, lesson_id);
    CREATE INDEX IF NOT EXISTS idx_courses_owner ON courses(owner_id, status);
  `);

  return db;
}

async function addColumnIfMissing(db, table, col, type) {
  const cols = await db.all(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === col)) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  }
}

// CLI: `npm run migrate` (cross-platform entry check)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDb();
  await migrate(db);
  // eslint-disable-next-line no-console
  console.log(`Migrated database (${db.kind}: ${db.host})`);
  await db.close();
}
