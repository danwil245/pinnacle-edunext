# Turso (libSQL) migration — inventory (T0)

Goal: replace the synchronous `better-sqlite3` file DB with the **async**
`@libsql/client` so production can use Turso (persistent, survives restarts),
while dev/tests keep a local SQLite file (`file:` URL). No product behaviour
changes. This is an **all-or-nothing async refactor**: every DB call becomes
`await`, and a partially-converted backend will not run.

## Every database touch point

| File | DB calls | Notes for conversion |
|---|---|---|
| `backend/src/db.js` | `openDb()` + 3 `pragma` | Rewrite as the async libSQL wrapper (`get/all/run/execute/batch/transaction`). `PRAGMA foreign_keys=ON` must be set per connection (verify libSQL support). WAL/busy_timeout are better-sqlite3-only → drop for libSQL. |
| `backend/src/migrate.js` | 1 `db.exec(bigSQL)` | Split into statements and run via `batch()` (libSQL `execute` is single-statement). Keep schema + constraints identical. Idempotent (`CREATE TABLE IF NOT EXISTS`). |
| `backend/src/seed.js` | ~15 incl. 1 `db.transaction()` | Upserts in a transaction → `batch([...], 'write')`. Idempotent. |
| `backend/src/index.js` | `openDb`, `migrate`, `seed`, `listen` | Boot becomes async: `await migrate`, `await seed`, retry-with-backoff on connect, log which backend ("local file" / "Turso <host>", never the token/full URL), refuse to start in prod without `TURSO_DATABASE_URL` unless `ALLOW_LOCAL_DB=1`. |
| `backend/src/app.js` | `createApp(db)`, `/health`, `/health/ready` (`db.prepare('SELECT 1').get()`) | `/health/ready` → `await db.get('SELECT 1')` (real round trip). Handlers already async-capable. |
| `backend/src/middleware/auth.js` | 1 user lookup | → `await db.get(...)`; make middleware async. |
| `backend/src/routes/auth.js` | 6, incl. `lastInsertRowid` (register) | `info.lastInsertRowid` → `run().lastInsertRowid`. Map UNIQUE-constraint error (duplicate email) to the same 409 API error. |
| `backend/src/routes/profile.js` | 8 | straight `await` conversion. |
| `backend/src/routes/courses.js` | 18 | densest reads; `all`/`get` → `await`. |
| `backend/src/routes/insights.js` | 11 | aggregate reads → `await`. |
| `backend/src/routes/sessions.js` | 19, **3 transactions**, `lastInsertRowid` | create-session, **bulk tick insert** (→ `batch`), **session end + idempotent end** (→ `transaction`/`batch`). Highest-risk file. |
| `backend/src/routes/helpers.js` | 3 (`loadProfile`, `knownTopics`) | shared async helpers; callers must `await`. |
| `backend/test/*.js` (auth, courses, profile, sessions, privacy, helpers) | ~13 | setup `openDb(':memory:')` → libSQL `file::memory:` (or temp file); `migrate`/`seed` become `await`; `createApp` stays sync but all request assertions already go through HTTP (supertest), so most tests only change the async setup. |

## Behaviours to preserve
- **Foreign keys + cascades** on every connection.
- **Idempotent** migrate + seed (safe to run at every boot).
- **Transactions**: session-end summary/style/progress must stay atomic; bulk
  tick insert atomic; idempotent "end twice" returns `alreadyEnded`.
- **Unique email** violation → 409 (same error shape as today).
- **`lastInsertRowid`** for new user / new session ids.
- No secrets printed: log DB **host only**, never the token or full URL.

## Config
- `TURSO_DATABASE_URL` (`libsql://…`) + `TURSO_AUTH_TOKEN` → production (Turso).
- Unset URL → local file from `DATABASE_PATH` (default `file:./data/edunext.db`).
- Tests → in-memory / temp file (no network).
- Prod without URL → refuse to boot unless `ALLOW_LOCAL_DB=1`.
