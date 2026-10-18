/**
 * Two-origin deploy smoke test. Proves the production split-origin setup works
 * BEFORE deploying: a frontend built with VITE_API_URL talking cross-origin to the
 * backend, with strict CORS, SPA deep-link fallback, the cold-start health gate,
 * and a full register → onboarding → lesson → summary walk (fake camera, mock).
 *
 * Expects two servers already running (see DEPLOY.md / the npm orchestration):
 *   FRONTEND_URL (default http://localhost:4173) — built with VITE_API_URL + mock
 *   API_URL      (default http://localhost:4000) — NODE_ENV=production, CORS_ORIGINS=FRONTEND_URL
 *
 *   node e2e/deploy-smoke.spec.js
 */
import { chromium } from 'playwright-core';

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:4173').replace(/\/$/, '');
const API_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

async function main() {
  // --- CORS: disallowed origin gets no Access-Control-Allow-Origin ----------
  const evil = await fetch(`${API_URL}/health`, { headers: { Origin: 'http://evil.example' } });
  check('CORS rejects a disallowed origin', !evil.headers.get('access-control-allow-origin'));
  const good = await fetch(`${API_URL}/health`, { headers: { Origin: FRONTEND_URL } });
  check('CORS allows the frontend origin', good.headers.get('access-control-allow-origin') === FRONTEND_URL);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['camera'] });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const badResponses = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`); });

  // Load app; the cold-start banner must clear (backend is up) and health be ok.
  await page.goto(`${FRONTEND_URL}/`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const stuckWaking = await page.evaluate(() => /Waking up the server/i.test(document.body.innerText));
  check('cold-start banner clears when backend is healthy', !stuckWaking);

  // Register (cross-origin POST through VITE_API_URL).
  const email = `deploy+${Date.now()}@edunext.local`;
  await page.goto(`${FRONTEND_URL}/register`, { waitUntil: 'load' });
  await page.getByLabel(/name/i).fill('Deploy Smoke');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill('password1');
  await page.getByRole('button', { name: /create account/i }).click();
  const onOnboarding = await page.waitForFunction(() => /set up EduNext/i.test(document.body.innerText), { timeout: 8000 }).then(() => true).catch(() => false);
  check('register works cross-origin → onboarding', onOnboarding);

  // Onboarding in mock mode.
  await page.getByRole('button', { name: /use mock signals/i }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.locator('section button').first().click();
  await page.getByRole('button', { name: /^continue$/i }).click();
  const toResult = await page.waitForFunction(() => /Your personal profile/i.test(document.body.innerText), { timeout: 40000 }).then(() => true).catch(() => false);
  check('onboarding completes (clips auto-measure)', toResult);
  await page.getByRole('button', { name: /start learning/i }).click();
  const onHome = await page.waitForURL(/\/home/, { timeout: 8000 }).then(() => true).catch(() => false);
  check('lands on /home', onHome);

  // Lesson → summary.
  await page.goto(`${FRONTEND_URL}/learn/1`, { waitUntil: 'load' });
  await page.getByRole('button', { name: /start lesson/i }).click().catch(() => {});
  await page.waitForTimeout(16000);
  await page.getByRole('button', { name: /complete lesson/i }).click().catch(() => {});
  const onSummary = await page.waitForURL(/\/summary\//, { timeout: 8000 }).then(() => true).catch(() => false);
  const summaryPopulated = await page.evaluate(() => /\/100/.test(document.body.innerText));
  check('lesson → summary populated', onSummary && summaryPopulated);

  // Deep-link hard refresh (SPA fallback must not 404).
  await page.goto(`${FRONTEND_URL}/home`, { waitUntil: 'load' });
  const homeLoaded = await page.evaluate(() => !/404|not found/i.test(document.title + document.body.innerText.slice(0, 200)));
  check('deep-link /home hard refresh loads (SPA fallback)', homeLoaded);

  check('no console errors during the walk', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  const assetBad = badResponses.filter((r) => /models|mediapipe|assets|\.wasm/.test(r));
  check('no 404s on model/wasm/asset files', assetBad.length === 0, assetBad.slice(0, 3).join(' | '));

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? `\ndeploy-smoke: ${failed.length} FAILED` : `\ndeploy-smoke: all ${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error('deploy-smoke ERROR', e); process.exit(1); });
