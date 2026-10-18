/**
 * End-to-end smoke: drives the whole API lifecycle in-process against an
 * in-memory DB (the Section-14 fallback for the browser E2E). Exits non-zero on
 * the first failed assertion.
 *
 *   register -> interests -> calibration (style) -> courses (ranked + reasons)
 *   -> lesson (both variants + servedVariant) -> session -> ticks -> feedback
 *   -> curation event -> end (summary) -> idempotent end -> insights
 */
import assert from 'node:assert';
import { openDb } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { seed } from '../src/seed.js';
import { createApp } from '../src/app.js';

const db = openDb(':memory:');
migrate(db);
seed(db);
const server = createApp(db, { corsOrigin: '*' }).listen(0);
const port = server.address().port;
const B = `http://localhost:${port}/api`;

let token = '';
const call = async (path, { method = 'GET', body, auth = true } = {}) => {
  const res = await fetch(B + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
};
const step = (msg) => console.log(`  ✓ ${msg}`);

try {
  let r = await call('/auth/register', { method: 'POST', auth: false, body: { email: 'e2e@test.com', name: 'E2E', password: 'password1' } });
  assert.equal(r.status, 201, 'register');
  token = r.data.token;
  step('registered + got token');

  r = await call('/profile/interests', { method: 'PUT', body: { interests: ['web-development'] } });
  assert.equal(r.status, 200, 'interests');
  step('saved interests');

  r = await call('/profile/calibration', {
    method: 'PUT',
    body: {
      calibration: { engagedBpm: 10, neutralBpm: 20, boundaries: [5, 12, 18, 26], personalized: true, emotionBaseline: null },
      styleProbe: { visual: { meanScore: 82, seconds: 20 }, practical: { meanScore: 45, seconds: 20 } },
    },
  });
  assert.equal(r.status, 200, 'calibration');
  assert.equal(r.data.profile.onboardingComplete, true, 'onboarding complete');
  assert.equal(r.data.profile.learningStyle, 'visual', 'style detected');
  step(`onboarding complete, style=${r.data.profile.learningStyle}`);

  r = await call('/courses');
  assert.equal(r.status, 200, 'courses');
  assert.equal(r.data.courses.length, 3, '3 courses');
  assert.ok(r.data.courses.every((c) => c.reasons.length > 0), 'reasons present');
  assert.equal(r.data.courses[0].topic, 'web-development', 'interest ranked first');
  step(`ranked ${r.data.courses.length} courses with reasons`);

  r = await call('/lessons/1');
  assert.equal(r.status, 200, 'lesson');
  assert.ok(r.data.lesson.visual && r.data.lesson.practical, 'both variants');
  assert.ok(['visual', 'practical'].includes(r.data.lesson.servedVariant), 'servedVariant');
  step(`lesson served variant=${r.data.lesson.servedVariant}`);

  r = await call('/sessions', { method: 'POST', body: { lessonId: 1 } });
  assert.equal(r.status, 201, 'session create');
  const sessionId = r.data.sessionId;
  step(`session ${sessionId} (${r.data.variant})`);

  const ticks = [];
  for (let i = 0; i < 12; i++) {
    const fatigued = i >= 6;
    ticks.push({
      t: i * 5000,
      bpm: fatigued ? 28 : 13,
      zone: fatigued ? 'fatigued' : 'attentive',
      emotion: fatigued ? 'bored' : 'engaged',
      score: fatigued ? 28 : 92,
      faceDetected: true,
      observedS: 60,
    });
  }
  r = await call(`/sessions/${sessionId}/ticks`, { method: 'POST', body: { ticks } });
  assert.equal(r.status, 200, 'ticks');
  step(`stored ${ticks.length} ticks`);

  r = await call(`/sessions/${sessionId}/feedback`, { method: 'POST', body: { t: 30000, kind: 'thumbs', value: 'thumbs_down' } });
  assert.equal(r.status, 200, 'feedback');
  r = await call(`/sessions/${sessionId}/curation`, { method: 'POST', body: { t: 35000, action: 'suggest_break', reason: 'fatigue', outcome: 'accepted' } });
  assert.equal(r.status, 200, 'curation');
  step('logged feedback + a curation action');

  r = await call(`/sessions/${sessionId}/end`, { method: 'POST', body: { completed: true } });
  assert.equal(r.status, 200, 'end');
  const summary = r.data.summary;
  assert.ok(summary.avgScore > 0, 'avg score computed');
  assert.equal(summary.validSeconds, 60, 'valid seconds (12 ticks * 5s)');
  assert.equal(summary.curationEvents.length, 1, 'curation event in summary');
  assert.ok(summary.zoneDistribution.fatigued === 6 && summary.zoneDistribution.attentive === 6, 'zone distribution');
  step(`summary: avg=${Math.round(summary.avgScore)}, valid=${summary.validSeconds}s, zones=${JSON.stringify(summary.zoneDistribution)}`);

  const r2 = await call(`/sessions/${sessionId}/end`, { method: 'POST', body: { completed: true } });
  assert.equal(r2.data.alreadyEnded, true, 'idempotent end');
  step('end is idempotent');

  r = await call('/insights');
  assert.equal(r.status, 200, 'insights');
  assert.equal(r.data.sessions.length, 1, 'one session in insights');
  assert.ok(r.data.sessions[0].series.length > 0, 'score series present');
  step(`insights: ${r.data.sessions.length} session, ${r.data.sessions[0].series.length} score points`);

  console.log('\nE2E smoke PASSED ✅');
  server.close();
  process.exit(0);
} catch (err) {
  console.error('\nE2E smoke FAILED ❌:', err.message);
  server.close();
  process.exit(1);
}
