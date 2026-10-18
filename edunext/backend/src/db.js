import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Open a better-sqlite3 handle with foreign keys + WAL enabled. Pass ':memory:'
 * for tests. For a file path, the parent directory is created if missing.
 *
 * @param {string} [path]  file path or ':memory:'
 * @returns {import('better-sqlite3').Database}
 */
export function openDb(path = ':memory:') {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL'); // no-op for :memory:, safe
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000'); // wait up to 5s on a locked DB instead of erroring
  return db;
}
