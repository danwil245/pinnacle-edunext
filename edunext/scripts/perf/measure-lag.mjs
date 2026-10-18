/**
 * Bug-1 (post-calibration lag) harness. Drives the production build with a FAKE
 * camera and measures, per route: frame time (avg/p95) during a scripted scroll,
 * long tasks, live getUserMedia tracks, requestAnimationFrame calls/sec, and live
 * WebGL contexts. Compares /login (control, no tracking) and /home, and critically
 * measures /home AFTER the camera tracker has been started (via /dev) to detect a
 * tracker that keeps running on routes that don't need it.
 *
 * Usage: node scripts/perf/measure-lag.mjs --base http://localhost:5190 --out X.json --label Y
 */
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { argv } from 'node:process';

function arg(n, d) { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; }
const BASE = (arg('base', 'http://localhost:5190')).replace(/\/$/, '');
const OUT = arg('out', 'scripts/perf/results/lag.json');
const LABEL = arg('label', 'run');
const DROP = (1000 / 60) * 1.5;

const INIT = `(() => {
  const P = window.__perf = { raf: 0, streams: [], longtasks: [] };
  const rAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { P.raf++; return rAF(cb); };
  const gum = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
  if (gum) navigator.mediaDevices.getUserMedia = async function (...a) {
    const s = await gum.apply(navigator.mediaDevices, a); P.streams.push(s); return s;
  };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.longtasks.push(e.duration); }).observe({ type: 'longtask', buffered: true }); } catch(e){}
  window.__liveTracks = () => P.streams.reduce((n, s) => n + s.getTracks().filter(t => t.readyState === 'live').length, 0);
  window.__rafPerSec = async () => { P.raf = 0; await new Promise(r => setTimeout(r, 1000)); return P.raf; };
  window.__liveWebgl = () => { let n = 0; for (const c of document.querySelectorAll('canvas')) { try { const g = c.getContext('webgl2')||c.getContext('webgl'); if (g && !g.isContextLost()) n++; } catch(e){} } return n; };
  window.__startFrames = () => { P.frames = []; let last = performance.now(); const loop = (t) => { P.frames.push(t-last); last=t; P._r = rAF(loop); }; P._r = rAF(loop); };
  window.__stopFrames = () => { cancelAnimationFrame(P._r); return P.frames || []; };
})();`;

function stats(frames) {
  const f = frames.filter((x) => x > 0).slice(1);
  if (!f.length) return { avg: 0, p95: 0, dropped: 0 };
  const s = [...f].sort((a, b) => a - b);
  return { avg: +(f.reduce((a, b) => a + b, 0) / f.length).toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), dropped: f.filter((x) => x > DROP).length };
}

async function apiSetup() {
  const email = `lag+${Date.now()}@edunext.local`;
  const base = `${BASE}/api`; let token = '';
  const call = async (p, { method = 'GET', body, auth = true } = {}) => {
    const r = await fetch(base + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => null); if (!r.ok) throw new Error(`${p} ${r.status}`); return d;
  };
  const reg = await call('/auth/register', { method: 'POST', auth: false, body: { email, name: 'Lag', password: 'password1' } });
  token = reg.token;
  await call('/profile/interests', { method: 'PUT', body: { interests: ['web-development'] } });
  await call('/profile/calibration', { method: 'PUT', body: { calibration: { engagedBpm: 10, neutralBpm: 20, boundaries: [5, 12, 18, 26], personalized: true, emotionBaseline: null }, styleProbe: { visual: { meanScore: 82, seconds: 20 }, practical: { meanScore: 45, seconds: 20 } } } });
  return token;
}

async function scroll(page) {
  await page.evaluate(() => window.__startFrames());
  const b = page.viewportSize();
  await page.mouse.move(b.width / 2, b.height / 2);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 360); await page.waitForTimeout(150); }
  await page.waitForTimeout(200);
  return stats(await page.evaluate(() => window.__stopFrames()));
}

async function snapshot(page, label) {
  const s = await scroll(page);
  const raf = await page.evaluate(() => window.__rafPerSec());
  const tracks = await page.evaluate(() => window.__liveTracks());
  const webgl = await page.evaluate(() => window.__liveWebgl());
  const lt = await page.evaluate(() => window.__perf.longtasks.slice());
  return { label, scroll: s, rafPerSec: raf, liveTracks: tracks, liveWebgl: webgl, longTasks100: lt.filter((d) => d > 100).length };
}

async function main() {
  const token = await apiSetup();
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 }, permissions: ['camera'] });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.evaluate((t) => localStorage.setItem('edunext_token', t), token);

  const out = { label: LABEL, base: BASE, ts: new Date().toISOString(), measurements: [] };

  // Control: /login (no tracking)
  await page.goto(`${BASE}/login`, { waitUntil: 'load' }); await page.waitForTimeout(1200);
  out.measurements.push(await snapshot(page, '/login (control)'));

  // /home fresh (tracker never started this session)
  await page.goto(`${BASE}/home`, { waitUntil: 'load' }); await page.waitForTimeout(1500);
  out.measurements.push(await snapshot(page, '/home (fresh)'));

  // Start the CAMERA tracker via /dev, then navigate CLIENT-SIDE (clicks, so the
  // persistent TrackingProvider survives) and measure whether the camera keeps
  // running on a route that doesn't need it.
  await page.goto(`${BASE}/dev`, { waitUntil: 'load' }); await page.waitForTimeout(800);
  await page.getByRole('button', { name: /^camera$/i }).click().catch(() => {});
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^start$/i }).click().catch(() => {});
  await page.waitForTimeout(4000); // camera + models warm up
  const devTracks = await page.evaluate(() => window.__liveTracks());
  out.cameraStartedOnDev = { liveTracks: devTracks };
  // Client-side nav off /dev via the in-app link (NOT page.goto — that reloads
  // and would destroy the persistent tracker, hiding the bug).
  await page.getByRole('link', { name: /home/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  out.measurements.push(await snapshot(page, `after camera->client-nav (${(new URL(page.url())).pathname})`));

  writeFileSync(OUT, JSON.stringify(out, null, 2));
  for (const m of out.measurements) console.log(`${m.label.padEnd(30)} p95=${m.scroll.p95}ms drop=${m.scroll.dropped} rAF/s=${m.rafPerSec} liveTracks=${m.liveTracks} webgl=${m.liveWebgl} LT100=${m.longTasks100}`);
  console.log('camera started on /dev -> liveTracks:', out.cameraStartedOnDev.liveTracks);
  console.log('wrote', OUT);
  await browser.close();
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
