import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { CONFIG } from '@edunext/shared';
import { openDb } from './db.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';

/**
 * Seed ~8 clearly-named demo students with plausible synthetic sessions for the
 * seeded courses, so the teacher dashboard isn't empty at a demo.
 *
 * Safety:
 * - Refuses to run in production unless ALLOW_DEMO_ANALYTICS=1.
 * - Every synthetic student AND session is flagged is_demo=1, so the teacher UI
 *   badges them and can hide them, and they never silently mix into real numbers.
 * - Idempotent: existing demo students are removed (cascade) and recreated.
 */

const NAMES = ['Aarav', 'Bianca', 'Chen', 'Diya', 'Ethan', 'Fatima', 'Grace', 'Hiro'];
const STYLES = ['visual', 'practical', 'balanced', 'unknown'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Build a plausible score curve for one session (0..100), some sessions dip. */
function scoreCurve(n, base, dip) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const prog = i / Math.max(1, n - 1);
    // Optional mid/late attention dip.
    const dipAmt = dip ? Math.max(0, 1 - Math.abs(prog - 0.7) * 4) * 25 : 0;
    const noise = (Math.random() - 0.5) * 12;
    out.push(Math.max(2, Math.min(100, base - dipAmt + noise)));
  }
  return out;
}

function zoneFor(score) {
  if (score >= 82) return 'attentive';
  if (score >= 68) return 'neutral';
  if (score >= 48) return 'neutral';
  if (score >= 30) return 'fatigued';
  return 'sleepy';
}
function emotionFor(score) {
  if (score >= 75) return 'engaged';
  if (score >= 55) return 'neutral';
  if (score >= 40) return 'confused';
  return 'bored';
}

export async function seedDemoAnalytics(db, env = process.env) {
  if (env.NODE_ENV === 'production' && env.ALLOW_DEMO_ANALYTICS !== '1') {
    throw new Error('Refusing to seed demo analytics in production. Set ALLOW_DEMO_ANALYTICS=1 to override.');
  }

  // Ensure content exists (seeded courses owned by the demo teacher).
  const courseCount = Number((await db.get('SELECT COUNT(*) n FROM courses')).n);
  if (courseCount === 0) await seed(db, env);

  // Remove any previous demo students (cascades their sessions/ticks).
  await db.run("DELETE FROM users WHERE is_demo = 1 AND role = 'student'");

  const lessons = await db.all(
    `SELECT l.id, l.duration_s FROM lessons l JOIN courses c ON l.course_id = c.id
      WHERE c.status = 'published' ORDER BY l.course_id, l.position`
  );
  if (lessons.length === 0) throw new Error('No published lessons to attach demo sessions to.');

  const hash = bcrypt.hashSync('demo-student-pass', 8);
  const now = Date.now();
  let students = 0;
  let sessions = 0;

  for (let i = 0; i < NAMES.length; i++) {
    const name = `Demo · ${NAMES[i]}`;
    const email = `demo.student.${NAMES[i].toLowerCase()}@edunext.demo`;
    const createdAt = new Date(now - (i + 1) * 86400000).toISOString();
    const info = await db.run(
      "INSERT INTO users (email, name, password_hash, created_at, role, is_demo) VALUES (?, ?, ?, ?, 'student', 1)",
      [email, name, hash, createdAt]
    );
    const userId = Number(info.lastInsertRowid);
    const style = pick(STYLES);
    await db.run(
      `INSERT INTO profiles (user_id, interests, onboarding_complete, learning_style, style_confidence, updated_at)
       VALUES (?, '["web-development"]', 1, ?, ?, ?)`,
      [userId, style, Math.round(Math.random() * 60) / 100 + 0.3, createdAt]
    );
    students += 1;

    // Each student does 2–4 sessions on random lessons. One student (last) is a
    // persistent low-engagement case so the "check-in" flag demonstrates.
    const nSessions = 2 + Math.floor(Math.random() * 3);
    const lowStudent = i === NAMES.length - 1;
    for (let sIdx = 0; sIdx < nSessions; sIdx++) {
      const lesson = pick(lessons);
      const variant = Math.random() < 0.5 ? 'visual' : 'practical';
      const base = lowStudent ? 35 + Math.random() * 8 : 55 + Math.random() * 35;
      const nTicks = 18 + Math.floor(Math.random() * 12);
      const curve = scoreCurve(nTicks, base, Math.random() < 0.5);
      const startedAt = new Date(now - (i * 3 + sIdx) * 3600000).toISOString();

      const sessInfo = await db.run(
        `INSERT INTO sessions (user_id, lesson_id, variant, started_at, ended_at, valid_seconds, avg_score, summary, is_demo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [userId, Number(lesson.id), variant, startedAt, startedAt, 0, 0, null]
      );
      const sessionId = Number(sessInfo.lastInsertRowid);

      let validCount = 0;
      let scoreSum = 0;
      const stmts = [];
      for (let k = 0; k < nTicks; k++) {
        const score = Math.round(curve[k]);
        const face = Math.random() < 0.9; // ~10% invalid (no face / multi-person)
        if (face) { validCount += 1; scoreSum += score; }
        stmts.push({
          sql: `INSERT INTO ticks (session_id, t, bpm, zone, emotion, score, face_detected, observed_s)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [sessionId, k * CONFIG.TICK_MS, 12 + Math.random() * 10, zoneFor(score), emotionFor(score), face ? score : null, face ? 1 : 0, CONFIG.TICK_MS / 1000],
        });
      }
      await db.batch(stmts, 'write');
      const avg = validCount ? Math.round((scoreSum / validCount) * 10) / 10 : null;
      await db.run('UPDATE sessions SET valid_seconds = ?, avg_score = ? WHERE id = ?', [
        Math.round((validCount * CONFIG.TICK_MS) / 1000),
        avg,
        sessionId,
      ]);
      sessions += 1;
    }
  }

  return { students, sessions };
}

// CLI: `npm run seed:demo-analytics`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDb();
  await migrate(db);
  const counts = await seedDemoAnalytics(db);
  // eslint-disable-next-line no-console
  console.log(`Seeded ${counts.students} demo students, ${counts.sessions} demo sessions (${db.kind}: ${db.host})`);
  await db.close();
}

export default seedDemoAnalytics;
