import { describe, it, expect, vi } from 'vitest';
import { resolveDbConfig, dbHost, openDb, enableForeignKeys } from '../src/db.js';
import { loadConfig } from '../src/config.js';

describe('db config (no network)', () => {
  it('uses Turso when TURSO_DATABASE_URL is set', () => {
    const c = resolveDbConfig({ url: 'libsql://db-xyz.turso.io', authToken: 't0ken' });
    expect(c.isRemote).toBe(true);
    expect(c.kind).toBe('Turso');
    expect(c.host).toBe('db-xyz.turso.io');
    expect(c.authToken).toBe('t0ken');
  });

  it('falls back to a local file when no url', () => {
    const c = resolveDbConfig({ path: './data/x.db' });
    expect(c.isRemote).toBe(false);
    expect(c.url).toBe('file:./data/x.db');
  });

  it('maps :memory: to a private in-memory db', () => {
    expect(resolveDbConfig(':memory:').url).toBe(':memory:');
  });

  it('dbHost never leaks the token or full url', () => {
    expect(dbHost('libsql://h.turso.io?authToken=supersecret')).toBe('h.turso.io');
    expect(dbHost('file:./x.db')).toBe('local file');
  });
});

describe('transaction helper', () => {
  it('rolls back on error', async () => {
    const db = openDb(':memory:');
    await enableForeignKeys(db);
    await db.execute('CREATE TABLE t (x INTEGER)');
    await expect(
      db.transaction(async (tx) => {
        await tx.run('INSERT INTO t VALUES (1)');
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    const row = await db.get('SELECT COUNT(*) n FROM t');
    expect(Number(row.n)).toBe(0); // rolled back
    await db.close();
  });

  it('commits on success and returns the callback value', async () => {
    const db = openDb(':memory:');
    await db.execute('CREATE TABLE t (x INTEGER)');
    const out = await db.transaction(async (tx) => {
      await tx.run('INSERT INTO t VALUES (1)');
      await tx.run('INSERT INTO t VALUES (2)');
      return 'done';
    });
    expect(out).toBe('done');
    expect(Number((await db.get('SELECT COUNT(*) n FROM t')).n)).toBe(2);
    await db.close();
  });
});

describe('production boot guard', () => {
  const base = { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) };

  it('refuses to start in production without a Turso URL', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit called');
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => loadConfig({ ...base })).toThrow('exit called');
    exit.mockRestore();
    err.mockRestore();
  });

  it('allows a local DB in production with ALLOW_LOCAL_DB=1', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cfg = loadConfig({ ...base, ALLOW_LOCAL_DB: '1' });
    expect(cfg.dbKind).toBe('local file');
    warn.mockRestore();
  });

  it('accepts a Turso URL in production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cfg = loadConfig({ ...base, TURSO_DATABASE_URL: 'libsql://h.turso.io', TURSO_AUTH_TOKEN: 't' });
    expect(cfg.dbKind).toBe('Turso');
    expect(cfg.tursoUrl).toBe('libsql://h.turso.io');
    warn.mockRestore();
  });
});
