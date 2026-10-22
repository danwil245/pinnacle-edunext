import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { makeApp, registerUser } from './helpers.js';

describe('profile routes', () => {
  let app;
  let token;
  beforeEach(async () => {
    app = await makeApp();
    ({ token } = await registerUser(app));
  });

  it('requires auth for /api/me', async () => {
    expect((await request(app).get('/api/me')).status).toBe(401);
  });

  it('returns user + a fresh profile', async () => {
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.profile.onboardingComplete).toBe(false);
    expect(res.body.profile.learningStyle).toBe('unknown');
  });

  it('saves valid interests and rejects unknown topics', async () => {
    const ok = await request(app)
      .put('/api/profile/interests')
      .set('Authorization', `Bearer ${token}`)
      .send({ interests: ['web-development'] });
    expect(ok.status).toBe(200);
    expect(ok.body.profile.interests).toEqual(['web-development']);

    const bad = await request(app)
      .put('/api/profile/interests')
      .set('Authorization', `Bearer ${token}`)
      .send({ interests: ['astrology'] });
    expect(bad.status).toBe(400);
  });

  it('stores calibration, seeds a style, and completes onboarding', async () => {
    const payload = {
      calibration: {
        engagedBpm: 10,
        neutralBpm: 20,
        boundaries: [5, 12, 18, 26],
        personalized: true,
        emotionBaseline: null,
      },
      styleProbe: {
        visual: { meanScore: 85, seconds: 20 },
        practical: { meanScore: 40, seconds: 20 },
      },
    };
    const res = await request(app).put('/api/profile/calibration').set('Authorization', `Bearer ${token}`).send(payload);
    expect(res.status).toBe(200);
    expect(res.body.profile.onboardingComplete).toBe(true);
    expect(res.body.profile.learningStyle).toBe('visual'); // 85 > 40
    expect(res.body.profile.styleConfidence).toBeGreaterThan(0);

    // Recalibrate resets.
    const reset = await request(app).delete('/api/profile/calibration').set('Authorization', `Bearer ${token}`);
    expect(reset.body.profile.onboardingComplete).toBe(false);
    expect(reset.body.profile.learningStyle).toBe('unknown');
  });

  it('deletes the user and all their data', async () => {
    const del = await request(app).delete('/api/me').set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect((await request(app).get('/api/me').set('Authorization', `Bearer ${token}`)).status).toBe(404);
  });
});
