import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { makeApp, registerUser } from './helpers.js';

describe('GET /api/youtube/check', () => {
  let app;
  let token;
  beforeEach(async () => {
    app = await makeApp();
    ({ token } = await registerUser(app));
  });
  afterEach(() => vi.restoreAllMocks());

  const bearer = (id) => request(app).get(`/api/youtube/check?videoId=${id}`).set('Authorization', `Bearer ${token}`);

  it('requires auth', async () => {
    const res = await request(app).get('/api/youtube/check?videoId=dQw4w9WgXcQ');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid videoId', async () => {
    const res = await bearer('short');
    expect(res.status).toBe(400);
  });

  it('returns ok + title/author for an embeddable video (mocked oEmbed)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ title: 'A Lesson', author_name: 'NPTEL' }) });
    const res = await bearer('dQw4w9WgXcQ');
    expect(res.body).toEqual({ ok: true, title: 'A Lesson', author: 'NPTEL' });
  });

  it('maps embedding-disabled (401) to ok:false with a reason', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401 });
    const res = await bearer('abcdefghijk');
    expect(res.body.ok).toBe(false);
    expect(res.body.reason).toMatch(/embedding disabled/i);
  });

  it('maps not-found (404) to ok:false', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 404 });
    const res = await bearer('bcdefghijkl');
    expect(res.body).toEqual({ ok: false, reason: 'not found' });
  });
});
