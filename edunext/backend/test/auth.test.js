import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

describe('auth routes', () => {
  let app;
  beforeEach(async () => {
    app = await makeApp();
  });

  it('registers a new user and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'A@b.com', name: 'Al', password: 'password1' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('a@b.com'); // normalized to lowercase
  });

  it('rejects a duplicate email', async () => {
    const body = { email: 'a@b.com', name: 'Al', password: 'password1' };
    await request(app).post('/api/auth/register').send(body);
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('conflict');
  });

  it('rejects a short password with a 400 and field details', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.com', name: 'Al', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('bad_request');
    expect(res.body.error.details[0].path).toBe('password');
  });

  it('logs in with the correct password', async () => {
    await request(app).post('/api/auth/register').send({ email: 'a@b.com', name: 'Al', password: 'password1' });
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'password1' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('rejects a wrong password generically (no user enumeration)', async () => {
    await request(app).post('/api/auth/register').send({ email: 'a@b.com', name: 'Al', password: 'password1' });
    const wrong = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'wrongpass1' });
    const missing = await request(app).post('/api/auth/login').send({ email: 'none@b.com', password: 'whatever1' });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body.error.message).toBe(missing.body.error.message);
  });
});
