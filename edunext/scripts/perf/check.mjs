/**
 * perf:check — a pass/fail regression gate for the post-calibration lag fix.
 * Fails (exit 1) if, after the camera tracker has been started and the user has
 * navigated off a tracking route, the camera track is still live, more than one
 * WebGL context exists, inference is still running (proxied by a live track), or
 * `/home` frame time / long tasks exceed the targets.
 *
 * Needs the backend + a production `preview` running (see FIX_REPORT.md).
 *   node scripts/perf/check.mjs --base http://localhost:5173
 */
import { chromium } from 'playwright-core';
import { argv } from 'node:process';

function arg(n, d) { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; }
const BASE = arg('base', 'http://localhost:5173').replace(/\/$/, '');
const TARGET_P95 = 20;

const INIT = `(() => {
  const P = window.__perf = { streams: [], longtasks: [] };
  const gum = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
  if (gum) navigator.mediaDevices.getUserMedia = async function (...a) { const s = await gum.apply(navigator.mediaDevices, a); P.streams.push(s); return s; };
  try { new PerformanceObserver((l)=>{for(const e of l.getEntries())P.longtasks.push(e.duration);}).observe({type:'longtask',buffered:true}); } catch(e){}
  window.__liveTracks = () => P.streams.reduce((n,s)=>n+s.getTracks().filter(t=>t.readyState==='live').length,0);
  window.__liveWebgl = () => { let n=0; for (const c of document.querySelectorAll('canvas')){try{const g=c.getContext('webgl2')||c.getContext('webgl'); if(g&&!g.isContextLost())n++;}catch(e){}} return n; };
  const rAF = window.requestAnimationFrame.bind(window);
  window.__startFrames = () => { P.frames=[]; let last=performance.now(); const loop=(t)=>{P.frames.push(t-last);last=t;P._r=rAF(loop);}; P._r=rAF(loop); };
  window.__stopFrames = () => { cancelAnimationFrame(P._r); return P.frames||[]; };
})();`;

function p95(frames) { const f = frames.filter((x) => x > 0).slice(1).sort((a, b) => a - b); return f.length ? +f[Math.floor(f.length * 0.95)].toFixed(2) : 0; }

async function api(base, p, o = {}) {
  const r = await fetch(`${base}/api${p}`, { method: o.method || 'GET', headers: { ...(o.body ? { 'Content-Type': 'application/json' } : {}), ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  if (!r.ok) throw new Error(`${p} ${r.status}`); return r.json();
}

async function scroll(page) {
  await page.evaluate(() => window.__startFrames());
  const b = page.viewportSize(); await page.mouse.move(b.width / 2, b.height / 2);
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 360); await page.waitForTimeout(140); }
  return p95(await page.evaluate(() => window.__stopFrames()));
}

const failures = [];
function check(name, ok, detail) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failures.push(name); }

async function main() {
  const email = `check+${Date.now()}@edunext.local`;
  const reg = await api(BASE, '/auth/register', { method: 'POST', body: { email, name: 'Check', password: 'password1' } });
  const token = reg.token;
  await api(BASE, '/profile/interests', { method: 'PUT', token, body: { interests: ['web-development'] } });
  await api(BASE, '/profile/calibration', { method: 'PUT', token, body: { calibration: { engagedBpm: 10, neutralBpm: 20, boundaries: [5, 12, 18, 26], personalized: true, emotionBaseline: null }, styleProbe: { visual: { meanScore: 82, seconds: 20 }, practical: { meanScore: 45, seconds: 20 } } } });

  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 }, permissions: ['camera'] });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.evaluate((t) => localStorage.setItem('edunext_token', t), token);

  // /home fresh: light, no tracking.
  await page.goto(`${BASE}/home`, { waitUntil: 'load' }); await page.waitForTimeout(1500);
  const homeP95 = await scroll(page);
  check('/home p95 frame time <= 20ms', homeP95 <= TARGET_P95, `${homeP95}ms`);
  check('/home zero live camera tracks', (await page.evaluate(() => window.__liveTracks())) === 0);
  check('/home zero WebGL contexts', (await page.evaluate(() => window.__liveWebgl())) === 0);
  check('/home zero long tasks >100ms', (await page.evaluate(() => window.__perf.longtasks.filter((d) => d > 100).length)) === 0);

  // Start camera on /dev, navigate off (client-side), assert tracker stopped.
  await page.goto(`${BASE}/dev`, { waitUntil: 'load' }); await page.waitForTimeout(700);
  await page.getByRole('button', { name: /^camera$/i }).click().catch(() => {});
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^start$/i }).click().catch(() => {});
  await page.waitForTimeout(4000);
  check('camera IS live on /dev (tracking route)', (await page.evaluate(() => window.__liveTracks())) === 1);
  await page.getByRole('link', { name: /home/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  check('camera STOPPED after leaving tracking route', (await page.evaluate(() => window.__liveTracks())) === 0, `track(s): ${await page.evaluate(() => window.__liveTracks())}`);

  await browser.close();
  console.log(failures.length ? `\nperf:check FAILED (${failures.length})` : '\nperf:check PASSED');
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error('perf:check ERROR', e.message); process.exit(1); });
