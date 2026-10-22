import request from 'supertest';
import { openDb } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { seed } from '../src/seed.js';
import { createApp } from '../src/app.js';

/** A fresh in-memory app (migrated + seeded) for each test. */
export async function makeApp() {
  const db = openDb(':memory:');
  await migrate(db);
  await seed(db);
  return createApp(db, { corsOrigin: '*' });
}

/** Register a user and return { token, user }. */
export async function registerUser(app, over = {}) {
  const body = { email: `u${Math.random().toString(36).slice(2)}@ex.com`, name: 'Test', password: 'password1', ...over };
  const res = await request(app).post('/api/auth/register').send(body);
  return { token: res.body.token, user: res.body.user, status: res.status };
}

/** Add a Bearer header to a supertest request. */
export const auth = (token) => (req) => req.set('Authorization', `Bearer ${token}`);

/** Grab the first lesson id of the first seeded course. */
export async function firstLessonId(app, token) {
  const courses = await request(app).get('/api/courses').set('Authorization', `Bearer ${token}`);
  const slug = courses.body.courses[0].slug;
  const course = await request(app).get(`/api/courses/${slug}`).set('Authorization', `Bearer ${token}`);
  return course.body.lessons[0].id;
}
