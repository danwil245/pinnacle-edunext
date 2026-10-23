import bcrypt from 'bcryptjs';

/**
 * Idempotent demo-teacher seed. Creates exactly one teacher from
 * DEMO_TEACHER_EMAIL / DEMO_TEACHER_PASSWORD. Never overwrites an existing
 * password (re-running only ensures the row exists and has role='teacher').
 *
 * In production both env vars are required and the documented dev defaults are
 * refused, so a real deploy can never ship a known-credential teacher by
 * accident. In dev/test, documented defaults are used.
 *
 * @param {ReturnType<import('./db.js').openDb>} db
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Promise<{id:number, email:string, created:boolean}>}
 */
export const DEV_DEMO_TEACHER = Object.freeze({
  email: 'teacher@edunext.dev',
  password: 'teach-demo-1234',
  name: 'Demo Teacher',
});

export async function seedDemoTeacher(db, env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const email = (env.DEMO_TEACHER_EMAIL || (isProd ? '' : DEV_DEMO_TEACHER.email)).toLowerCase().trim();
  const password = env.DEMO_TEACHER_PASSWORD || (isProd ? '' : DEV_DEMO_TEACHER.password);
  const name = env.DEMO_TEACHER_NAME || DEV_DEMO_TEACHER.name;

  if (isProd && (!email || !password)) {
    throw new Error(
      'In production set DEMO_TEACHER_EMAIL and DEMO_TEACHER_PASSWORD to seed the demo teacher.'
    );
  }
  if (isProd && (email === DEV_DEMO_TEACHER.email || password === DEV_DEMO_TEACHER.password)) {
    throw new Error('Refusing to seed the demo teacher with the documented dev defaults in production.');
  }

  const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
  const now = new Date().toISOString();
  if (existing) {
    // Idempotent: ensure the role is teacher, but never touch the password.
    await db.run("UPDATE users SET role = 'teacher' WHERE id = ?", [Number(existing.id)]);
    return { id: Number(existing.id), email, created: false };
  }
  const hash = bcrypt.hashSync(password, 10);
  const info = await db.run(
    "INSERT INTO users (email, name, password_hash, created_at, role) VALUES (?, ?, ?, ?, 'teacher')",
    [email, name, hash, now]
  );
  const id = Number(info.lastInsertRowid);
  // Teachers get a profile row too (so /me shape is uniform) but need no onboarding.
  await db.run(
    'INSERT OR IGNORE INTO profiles (user_id, onboarding_complete, updated_at) VALUES (?, 1, ?)',
    [id, now]
  );
  return { id, email, created: true };
}

export default seedDemoTeacher;
