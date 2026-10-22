import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { makeApp, registerUser } from './helpers.js';

describe('course routes', () => {
  let app;
  let token;
  beforeEach(async () => {
    app = await makeApp();
    ({ token } = await registerUser(app));
  });

  it('ranks courses and always includes reasons', async () => {
    await request(app).put('/api/profile/interests').set('Authorization', `Bearer ${token}`).send({ interests: ['design'] });
    const res = await request(app).get('/api/courses').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.courses.length).toBe(3);
    for (const c of res.body.courses) expect(c.reasons.length).toBeGreaterThan(0);
    expect(res.body.courses[0].topic).toBe('design'); // interest wins
  });

  it('returns a course with its lessons (no variant bodies)', async () => {
    const list = await request(app).get('/api/courses').set('Authorization', `Bearer ${token}`);
    const slug = list.body.courses[0].slug;
    const res = await request(app).get(`/api/courses/${slug}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.lessons.length).toBe(3);
    expect(res.body.lessons[0].visual).toBeUndefined();
  });

  it('serves a lesson with both variants and a servedVariant', async () => {
    const res = await request(app).get('/api/lessons/1').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.lesson.visual).toBeTruthy();
    expect(res.body.lesson.practical).toBeTruthy();
    expect(['visual', 'practical']).toContain(res.body.lesson.servedVariant);
  });

  it('404s an unknown course', async () => {
    expect((await request(app).get('/api/courses/nope').set('Authorization', `Bearer ${token}`)).status).toBe(404);
  });
});
