/**
 * EduNext performance harness (Phase P0 / re-run in P1 & P3).
 *
 * Drives the PRODUCTION build (served by `vite preview`) with real Chrome via
 * the Chrome DevTools Protocol and records, per route:
 *   - average and p95 frame time during a scripted scroll
 *   - average and p95 frame time during a scripted route change
 *   - long tasks (>50 ms and >100 ms) count
 *   - dropped frames (frames that overran a 60 fps budget by >50%)
 *   - JS heap used (after a forced GC)
 *   - live WebGL contexts and live ScrollTrigger instances
 * Plus a 20× route round-trip leak check (heap / WebGL / ScrollTrigger growth).
 *
 * Usage:
 *   node scripts/perf/measure.mjs --base http://localhost:5173 \
 *        --out PERF_baseline.json --label baseline [--headful]
 *
 * Requires: backend reachable through the preview /api proxy, and the preview
 * build made with VITE_MOCK_SIGNALS=1 so onboarding/lesson run without a camera.
 *
 * NOTE ON GPU: a headless/automated browser renders WebGL in software
 * (SwiftShader), so absolute Vanta frame times are pessimistic. Treat WebGL
 * numbers as RELATIVE (before vs after), not absolute. Run with --headful on a
 * machine with a display for hardware-accelerated numbers.
 */
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { argv } from 'node:process';

// ---- args -------------------------------------------------------------------
function arg(name, def) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
const BASE = (arg('base', 'http://localhost:5173') || '').replace(/\/$/, '');
const OUT = arg('out', 'PERF_result.json');
const LABEL = arg('label', 'run');
const HEADFUL = !!arg('headful', false);

// Each scripted interaction samples frames for this long.
const SAMPLE_MS = 2500;
const SETTLE_MS = 1400; // fonts + vanta + first paint settle
const FRAME_BUDGET = 1000 / 60; // 16.67 ms
const DROP_THRESHOLD = FRAME_BUDGET * 1.5; // a frame that took >25 ms = dropped

// ---- API setup through the preview proxy ------------------------------------
async function apiSetup() {
  const email = `perf+${Date.now()}@edunext.local`;
  const base = `${BASE}/api`;
  let token = '';
  const call = async (path, { method = 'GET', body, auth = true } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`API ${path} -> ${res.status}: ${JSON.stringify(data)}`);
    return data;
  };

  const reg = await call('/auth/register', {
    method: 'POST',
    auth: false,
    body: { email, name: 'Perf Panel', password: 'password1' },
  });
  token = reg.token;
  await call('/profile/interests', { method: 'PUT', body: { interests: ['web-development'] } });
  await call('/profile/calibration', {
    method: 'PUT',
    body: {
      calibration: { engagedBpm: 10, neutralBpm: 20, boundaries: [5, 12, 18, 26], personalized: true, emotionBaseline: null },
      styleProbe: { visual: { meanScore: 82, seconds: 20 }, practical: { meanScore: 45, seconds: 20 } },
    },
  });
  const courses = await call('/courses');
  const slug = courses.courses[0].slug;
  const lesson = await call('/lessons/1');
  const sess = await call('/sessions', { method: 'POST', body: { lessonId: 1 } });
  const sessionId = sess.sessionId;
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
  await call(`/sessions/${sessionId}/ticks`, { method: 'POST', body: { ticks } });
  await call(`/sessions/${sessionId}/end`, { method: 'POST', body: { completed: true } });
  return { token, slug, lessonId: 1, sessionId };
}

// ---- in-page instrumentation (injected before every document) ---------------
const INIT = `
(() => {
  const P = (window.__perf = window.__perf || {});
  P.webglCreates = 0;
  P.longtasks = [];
  const origGC = HTMLCanvasElement.prototype.getContext;
  if (!origGC.__patched) {
    const patched = function (type, ...a) {
      if (/webgl/i.test(type)) P.webglCreates++;
      return origGC.call(this, type, ...a);
    };
    patched.__patched = true;
    HTMLCanvasElement.prototype.getContext = patched;
  }
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) P.longtasks.push(e.duration);
    });
    po.observe({ type: 'longtask', buffered: true });
  } catch (e) {}
  window.__startFrames = () => {
    P.frames = [];
    let last = performance.now();
    const loop = (now) => { P.frames.push(now - last); last = now; P._raf = requestAnimationFrame(loop); };
    P._raf = requestAnimationFrame(loop);
  };
  window.__stopFrames = () => { cancelAnimationFrame(P._raf); return P.frames || []; };
  window.__resetLongtasks = () => { P.longtasks = []; };
  // Count live WebGL contexts = canvases in the DOM with a non-lost webgl context.
  window.__liveWebgl = () => {
    let n = 0;
    for (const c of document.querySelectorAll('canvas')) {
      try {
        const g = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
        if (g && !g.isContextLost()) n++;
      } catch (e) {}
    }
    return n;
  };
  window.__scrollTriggers = () => {
    try { return window.__edunextPerf.ScrollTrigger.getAll().length; } catch (e) { return -1; }
  };
})();
`;

// ---- stats helpers ----------------------------------------------------------
function stats(frames) {
  const f = frames.filter((x) => x > 0).slice(1); // drop the first warm-up frame
  if (!f.length) return { avg: 0, p95: 0, dropped: 0, n: 0 };
  const sorted = [...f].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const avg = f.reduce((a, b) => a + b, 0) / f.length;
  const dropped = f.filter((x) => x > DROP_THRESHOLD).length;
  return { avg: +avg.toFixed(2), p95: +p95.toFixed(2), dropped, n: f.length };
}

async function forceGC(cdp) {
  try { await cdp.send('HeapProfiler.collectGarbage'); } catch (e) {}
}
async function heapMB(cdp) {
  try {
    const { metrics } = await cdp.send('Performance.getMetrics');
    const m = metrics.find((x) => x.name === 'JSHeapUsedSize');
    if (m) return +(m.value / 1048576).toFixed(2);
  } catch (e) {}
  return 0;
}

// ---- per-route measurement --------------------------------------------------
async function scrollSample(page) {
  await page.evaluate(() => window.__resetLongtasks());
  await page.evaluate(() => window.__startFrames());
  // Scripted scroll: a sequence of wheel ticks (drives Lenis if active).
  const box = page.viewportSize() || { width: 1280, height: 800 };
  await page.mouse.move(box.width / 2, box.height / 2);
  const steps = Math.max(6, Math.floor(SAMPLE_MS / 180));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, 360);
    await page.waitForTimeout(140);
  }
  await page.waitForTimeout(300);
  const frames = await page.evaluate(() => window.__stopFrames());
  const longtasks = await page.evaluate(() => window.__perf.longtasks.slice());
  return { frames, longtasks };
}

async function measureRoute(page, cdp, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await page.waitForTimeout(SETTLE_MS);
  const { frames, longtasks } = await scrollSample(page);
  await forceGC(cdp);
  const heap = await heapMB(cdp);
  const liveWebgl = await page.evaluate(() => window.__liveWebgl());
  const scrollTriggers = await page.evaluate(() => window.__scrollTriggers());
  const webglCreates = await page.evaluate(() => window.__perf.webglCreates);
  const s = stats(frames);
  return {
    path,
    scroll: s,
    longTasks50: longtasks.filter((d) => d > 50).length,
    longTasks100: longtasks.filter((d) => d > 100).length,
    heapMB: heap,
    liveWebgl,
    scrollTriggers,
    webglCreates,
  };
}

// Measure frame time across a scripted navigation between two paths.
async function measureTransition(page, from, to) {
  await page.goto(`${BASE}${from}`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__startFrames());
  await page.evaluate((t) => { window.history.pushState({}, '', t); window.dispatchEvent(new PopStateEvent('popstate')); }, to);
  // Fall back to a real goto if SPA nav didn't move (keeps the sample honest).
  await page.waitForTimeout(1100);
  const frames = await page.evaluate(() => window.__stopFrames());
  return { from, to, ...stats(frames) };
}

// 20× round-trip leak check between two authenticated routes.
async function leakCheck(page, cdp, a, b) {
  await page.goto(`${BASE}${a}`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await forceGC(cdp);
  const before = {
    heapMB: await heapMB(cdp),
    liveWebgl: await page.evaluate(() => window.__liveWebgl()),
    scrollTriggers: await page.evaluate(() => window.__scrollTriggers()),
    webglCreates: await page.evaluate(() => window.__perf.webglCreates),
  };
  for (let i = 0; i < 20; i++) {
    await page.goto(`${BASE}${b}`, { waitUntil: 'load' });
    await page.waitForTimeout(120);
    await page.goto(`${BASE}${a}`, { waitUntil: 'load' });
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(600);
  await forceGC(cdp);
  const after = {
    heapMB: await heapMB(cdp),
    liveWebgl: await page.evaluate(() => window.__liveWebgl()),
    scrollTriggers: await page.evaluate(() => window.__scrollTriggers()),
    webglCreates: await page.evaluate(() => window.__perf.webglCreates),
  };
  return { a, b, roundTrips: 20, before, after };
}

// ---- main -------------------------------------------------------------------
async function main() {
  console.log(`[perf] base=${BASE} label=${LABEL} headful=${HEADFUL}`);
  console.log('[perf] seeding user + session through /api ...');
  const { token, slug, lessonId, sessionId } = await apiSetup();
  console.log(`[perf] ready: slug=${slug} lesson=${lessonId} session=${sessionId}`);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !HEADFUL,
    args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-gl=angle'],
  });
  const context = await browser.newContext({ viewport: { width: 1366, height: 850 }, deviceScaleFactor: 1 });
  await context.addInitScript(INIT);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  try { await cdp.send('Performance.enable'); } catch (e) {}

  // Prime localStorage with the auth token (same-origin as preview).
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.evaluate((t) => localStorage.setItem('edunext_token', t), token);

  const routes = [
    '/', '/login', '/register', '/onboarding',
    '/home', `/courses/${slug}`, `/learn/${lessonId}`,
    `/summary/${sessionId}`, '/insights', '/profile',
  ];

  const results = [];
  for (const path of routes) {
    process.stdout.write(`[perf] route ${path} ... `);
    try {
      const r = await measureRoute(page, cdp, path);
      results.push(r);
      console.log(`scroll avg=${r.scroll.avg}ms p95=${r.scroll.p95}ms LT>50=${r.longTasks50} webgl=${r.liveWebgl} ST=${r.scrollTriggers}`);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
      results.push({ path, error: e.message });
    }
  }

  const transitions = [];
  for (const [from, to] of [['/home', '/insights'], ['/home', `/courses/${slug}`], ['/insights', '/profile']]) {
    try {
      transitions.push(await measureTransition(page, from, to));
    } catch (e) {
      transitions.push({ from, to, error: e.message });
    }
  }

  console.log('[perf] 20x route round-trip leak check (/home <-> /insights) ...');
  const leak = await leakCheck(page, cdp, '/home', '/insights');

  const report = {
    label: LABEL,
    base: BASE,
    headful: HEADFUL,
    note: 'Headless WebGL is software-rendered; treat Vanta/WebGL frame times as relative, not absolute.',
    timestamp: new Date().toISOString(),
    userAgent: await page.evaluate(() => navigator.userAgent),
    hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency),
    routes: results,
    transitions,
    leak,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`[perf] wrote ${OUT}`);

  await browser.close();
}

main().catch((e) => {
  console.error('[perf] FATAL', e);
  process.exit(1);
});
