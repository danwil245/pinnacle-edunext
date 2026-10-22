/**
 * Real-browser test for the lesson YouTube player (no mocks).
 *
 * Builds a tiny harness that renders the real <YouTubePlayer> with a real,
 * embeddable video, serves the production build via `vite preview`, then drives
 * it in Chromium: clicks the thumbnail, and asserts the player actually starts
 * playing — while capturing console errors, failed network requests, any YT
 * error code, and a DOM timeline of the iframe (to catch the player being
 * destroyed/remounted by React).
 *
 *   node frontend/e2e/youtube-player.spec.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

// Prefer the installed full-chromium build (the auto-picked headless shell may be
// a mismatched version); fall back to Playwright's default resolution.
function chromeExecutable() {
  const root = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  try {
    for (const dir of fs.readdirSync(root)) {
      if (!/^chromium-\d+$/.test(dir)) continue;
      for (const sub of ['chrome-win64', 'chrome-win']) {
        const exe = path.join(root, dir, sub, 'chrome.exe');
        if (fs.existsSync(exe)) return exe;
      }
    }
  } catch { /* fall through */ }
  return undefined;
}

const HARNESS = fileURLToPath(new URL('./yt-harness', import.meta.url));
const CONFIG = fileURLToPath(new URL('./yt-harness/vite.config.mjs', import.meta.url));
const PORT = 4199;
const VIDEO = process.env.YT_VIDEO || 'kUMe1FH4CHE'; // freeCodeCamp — verified embeddable
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const run = (args, opts = {}) =>
  new Promise((resolve, reject) => {
    const p = spawn(npx, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${args.join(' ')} exited ${code}`))));
  });

async function waitForServer(url, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return true; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server not up: ${url}`);
}

async function main() {
  // 1) Production build of the harness.
  await run(['vite', 'build', '-c', CONFIG]);

  // 2) Serve it (vite preview).
  const server = spawn(npx, ['vite', 'preview', '-c', CONFIG, '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore', shell: process.platform === 'win32', cwd: HARNESS,
  });
  const base = `http://localhost:${PORT}/`;
  try {
    await waitForServer(base);

    const browser = await chromium.launch({
      headless: true,
      executablePath: chromeExecutable(),
      args: ['--autoplay-policy=no-user-gesture-required'],
    });
    const page = await browser.newContext({ viewport: { width: 760, height: 520 } }).then((c) => c.newPage());

    const consoleErrors = [];
    const badResponses = [];
    const ytRequests = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('response', (r) => {
      if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
      if (/youtube(-nocookie)?\.com/.test(r.url())) ytRequests.push(`${r.status()} ${r.url().slice(0, 90)}`);
    });

    await page.goto(`${base}?v=${VIDEO}`, { waitUntil: 'load' });
    await page.getByRole('button', { name: /play/i }).click();

    // Record the iframe over time: did it appear, and did it survive?
    const timeline = [];
    let iframeEverAppeared = false;
    let iframeSrc = null;
    for (let i = 0; i < 60; i++) { // ~18s
      const snap = await page.evaluate(() => {
        const host = document.querySelector('#root');
        const iframe = host?.querySelector('iframe');
        return { hasIframe: !!iframe, src: iframe?.src || null, ytLoaded: !!(window.YT && window.YT.loaded), yt: window.__yt };
      });
      if (snap.hasIframe) { iframeEverAppeared = true; iframeSrc = snap.src; }
      timeline.push(snap.hasIframe ? 'I' : '.');
      const states = snap.yt.states;
      if (states.includes('playing')) break;
      await page.waitForTimeout(300);
    }

    const yt = await page.evaluate(() => window.__yt);
    const iframeNow = await page.evaluate(() => !!document.querySelector('#root iframe'));
    console.log('iframe src:', iframeSrc);
    const errorShown = await page.getByText(/can.?t be played/i).count().then((n) => n > 0).catch(() => false);
    await browser.close();

    // ---- report ----
    console.log('\n=== YouTube player real-browser run ===');
    console.log('video:', VIDEO);
    console.log('iframe timeline (I=present .=absent):', timeline.join(''));
    console.log('iframe ever appeared:', iframeEverAppeared, '| iframe present at end:', iframeNow);
    console.log('player states:', JSON.stringify(yt.states));
    console.log('onController calls:', JSON.stringify(yt.controllers), '(null = controller torn down)');
    console.log('YT error codes:', JSON.stringify(yt.errors));
    console.log('error fallback shown:', errorShown);
    console.log('console errors:', consoleErrors.slice(0, 6));
    console.log('bad responses (>=400):', badResponses.slice(0, 6));
    console.log('youtube requests (first 6):', ytRequests.slice(0, 6));

    const playing = yt.states.includes('playing');
    const controllerAlive = yt.controllers.length > 0 && yt.controllers[yt.controllers.length - 1] !== null;
    const pass = playing && iframeNow && controllerAlive && !errorShown && yt.errors.length === 0;
    console.log(`\nRESULT: ${pass ? 'PASS — player reaches "playing" and survives' : 'FAIL — player did not play / was destroyed'}`);
    process.exitCode = pass ? 0 : 1;
  } finally {
    server.kill();
  }
}
main().catch((e) => { console.error('ERROR', e); process.exit(2); });
