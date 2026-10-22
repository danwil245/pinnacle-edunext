import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Async database layer over libSQL (@libsql/client). Production points at Turso
 * (persistent, survives restarts); dev/tests use a local SQLite file (`file:`
 * URL) or in-memory, so no network is needed. Route/service code must only use
 * the small async interface returned here: `get`, `all`, `run`, `execute`,
 * `batch`, `transaction`.
 */

/** Host of a libsql/https URL for safe logging (never the token or full URL). */
export function dbHost(url) {
  try {
    if (url.startsWith('file:') || url === ':memory:') return 'local file';
    return new URL(url.replace(/^libsql:/, 'https:')).host;
  } catch {
    return '(local)';
  }
}

/**
 * Resolve the libSQL connection from explicit opts or the environment.
 * @param {string|object} [arg] a path string (back-compat: `openDb(':memory:')`)
 *   or `{ url, authToken, path }`.
 */
export function resolveDbConfig(arg = {}) {
  const opts = typeof arg === 'string' ? { path: arg } : arg || {};
  const url = opts.url ?? process.env.TURSO_DATABASE_URL;
  const authToken = opts.authToken ?? process.env.TURSO_AUTH_TOKEN;
  if (url) {
    return { url, authToken, kind: 'Turso', host: dbHost(url), isRemote: true };
  }
  // Local file (or private in-memory for tests — isolated per client).
  const path = opts.path ?? process.env.DATABASE_PATH ?? './data/edunext.db';
  let fileUrl;
  if (path === ':memory:' || path === 'file::memory:') {
    fileUrl = ':memory:';
  } else if (path.startsWith('file:')) {
    fileUrl = path;
  } else {
    fileUrl = 'file:' + path;
  }
  return { url: fileUrl, authToken: undefined, kind: 'local file', host: fileUrl === ':memory:' ? 'in-memory' : 'local file', isRemote: false, path };
}

function wrapClient(client, cfg) {
  const toArgs = (args) => (args === undefined ? [] : args);
  return {
    kind: cfg.kind,
    host: cfg.host,
    isRemote: cfg.isRemote,
    _client: client,
    /** Low-level: run one statement. */
    async execute(sql, args) {
      return client.execute(args === undefined ? sql : { sql, args: toArgs(args) });
    },
    /** First row (or undefined). */
    async get(sql, args) {
      const r = await client.execute({ sql, args: toArgs(args) });
      return r.rows[0];
    },
    /** All rows. */
    async all(sql, args) {
      const r = await client.execute({ sql, args: toArgs(args) });
      return r.rows;
    },
    /** Write; returns { lastInsertRowid:number, changes:number }. */
    async run(sql, args) {
      const r = await client.execute({ sql, args: toArgs(args) });
      return {
        lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : undefined,
        changes: Number(r.rowsAffected || 0),
      };
    },
    /** Atomic batch of write statements: [{sql,args}, ...]. */
    async batch(statements, mode = 'write') {
      return client.batch(statements, mode);
    },
    /** Run a multi-statement SQL script (DDL / migrations; no args). */
    async executeMultiple(sql) {
      return client.executeMultiple(sql);
    },
    /**
     * Interactive transaction: fn gets a tx with the same get/all/run/execute
     * helpers; commits on success, rolls back on any thrown error.
     */
    async transaction(fn) {
      const tx = await client.transaction('write');
      const txApi = {
        async execute(sql, args) { return tx.execute(args === undefined ? sql : { sql, args: toArgs(args) }); },
        async get(sql, args) { const r = await tx.execute({ sql, args: toArgs(args) }); return r.rows[0]; },
        async all(sql, args) { const r = await tx.execute({ sql, args: toArgs(args) }); return r.rows; },
        async run(sql, args) { const r = await tx.execute({ sql, args: toArgs(args) }); return { lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : undefined, changes: Number(r.rowsAffected || 0) }; },
      };
      try {
        const out = await fn(txApi);
        await tx.commit();
        return out;
      } catch (err) {
        try { await tx.rollback(); } catch { /* ignore */ }
        throw err;
      }
    },
    async close() {
      try { client.close(); } catch { /* ignore */ }
    },
  };
}

/**
 * Open the database. Enables foreign keys. Returns the async interface.
 * @param {string|object} [arg]
 */
export function openDb(arg) {
  const cfg = resolveDbConfig(arg);
  if (!cfg.isRemote && cfg.path && !cfg.path.includes(':memory:')) {
    try { mkdirSync(dirname(cfg.path), { recursive: true }); } catch { /* ignore */ }
  }
  const client = createClient({ url: cfg.url, authToken: cfg.authToken });
  return wrapClient(client, cfg);
}

/** Enable foreign-key enforcement. Call once after open (idempotent). */
export async function enableForeignKeys(db) {
  await db.execute('PRAGMA foreign_keys = ON');
}
