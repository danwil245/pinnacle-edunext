import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { makeApp, registerUser } from './helpers.js';
import { DEV_DEMO_TEACHER } from '../src/seedTeacher.js';
import { constantTimeEqual } from '../src/routes/auth.js';

const INVITE = 'super-secret-invite-code';

describe('teacher registration + roles', () => {
  let app;
  beforeAll(() => {
    process.env.TEACHER_INVITE_CODE = INVITE;
  });
  afterAll(() => {
    delete process.env.TEACHER_INVITE_CODE;
  });
  beforeEach(async () => {
    app = await makeApp();
  });

  const registerTeacher = (over = {}) =>
    request(app)
      .post('/api/auth/register')
      .send({ email: `t${Math.random().toString(36).slice(2)}@ex.com`, name: 'T', password: 'password1', role: 'teacher', inviteCode: INVITE, ...over });

  it('creates a teacher with the correct invite code and carries the role in JWT + /me', async () => {
    const res = await registerTeacher();
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('teacher');
    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('teacher');
    // Teachers are pre-onboarded (no calibration needed).
    expect(me.body.profile.onboardingComplete).toBe(true);
  });

  it('rejects a wrong invite code with a generic error (no field hint)', async () => {
    const res = await registerTeacher({ inviteCode: 'wrong-code' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain('invite');
  });

  it('rejects a missing invite code', async () => {
    const res = await registerTeacher({ inviteCode: undefined });
    expect(res.status).toBe(400);
  });

  it('registers a normal student with role student by default', async () => {
    const { user, status } = await registerUser(app);
    expect(status).toBe(201);
    expect(user.role).toBe('student');
  });

  it('seeds a demo teacher that can log in with dev defaults (test env)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: DEV_DEMO_TEACHER.email, password: DEV_DEMO_TEACHER.password });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('teacher');
  });

  it('constantTimeEqual matches equal strings and rejects different ones/lengths', () => {
    expect(constantTimeEqual('abcd', 'abcd')).toBe(true);
    expect(constantTimeEqual('abcd', 'abce')).toBe(false);
    expect(constantTimeEqual('abcd', 'abcde')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(false);
    expect(constantTimeEqual('a', '')).toBe(false);
  });
});
