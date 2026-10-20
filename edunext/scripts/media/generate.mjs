/**
 * Generate the six calibration clips locally (Method B — license-free, no
 * external assets). Each clip is an on-brand canvas animation rendered frame by
 * frame in headless Chrome (deterministic: frame N draws at t = N/30), then the
 * exact frame sequence is encoded with ffmpeg to spec:
 * MP4 / H.264 / yuv420p / 1280x720 / 30fps / no audio / +faststart / exact length.
 *
 * Deterministic frames (no realtime video capture) => exact duration/fps and no
 * dependency on Playwright's bundled ffmpeg. Rerunnable: npm run media:generate
 */
import { chromium } from 'playwright-core';
import ffmpegPath from 'ffmpeg-static';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CONFIG } from '@edunext/shared';
import { CLIPS } from './clips.js';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const outDir = join(root, 'frontend', 'public', 'media', 'calibration');
const tmpDir = join(root, 'scripts', 'media', '.tmp');
mkdirSync(outDir, { recursive: true });

const W = 1280, H = 720, FPS = 30;

function pageHtml(animBody) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;background:#070b16;overflow:hidden}canvas{display:block}</style></head>
    <body><canvas id="c" width="${W}" height="${H}"></canvas><script>
    const cv=document.getElementById('c'),ctx=cv.getContext('2d');const W=${W},H=${H};
    function rr(ctx,x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);
      ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
    function hexA(hex,a){const n=parseInt(hex.slice(1),16);return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';}
    function ease3(x){return 1-Math.pow(1-Math.min(1,Math.max(0,x)),3);}
    window.renderFrame=function(t){ctx.clearRect(0,0,W,H);
      ${animBody}
      return cv.toDataURL('image/jpeg',0.92);};
    </script></body></html>`;
}

async function renderFrames(page, clip, durationS) {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setContent(pageHtml(clip.anim), { waitUntil: 'load' });
  const ready = await page.evaluate(() => typeof window.renderFrame === 'function');
  if (!ready || errs.length) throw new Error(`anim for ${clip.file} failed to define renderFrame: ${errs.join('; ') || 'undefined'}`);
  const total = Math.round(durationS * FPS);
  const dir = join(tmpDir, clip.file.replace('.mp4', ''));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < total; i++) {
    const dataUrl = await page.evaluate((t) => window.renderFrame(t), i / FPS);
    const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    writeFileSync(join(dir, `f-${String(i).padStart(5, '0')}.jpg`), Buffer.from(b64, 'base64'));
  }
  return { dir, total };
}

async function encode(dir, outPath) {
  const args = [
    '-y', '-framerate', String(FPS), '-i', join(dir, 'f-%05d.jpg'),
    '-vf', 'format=yuv420p',
    '-c:v', 'libx264', '-profile:v', 'high', '-crf', '24', '-preset', 'medium',
    '-an', '-movflags', '+faststart',
    outPath,
  ];
  await run(ffmpegPath, args);
}

async function main() {
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  console.log('[media] generating 6 calibration clips →', outDir);
  // Optional: pass one or more filenames to re-render only those clips.
  const only = process.argv.slice(2).filter((a) => a.endsWith('.mp4'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--hide-scrollbars'] });
  for (const clip of CLIPS) {
    if (only.length && !only.includes(clip.file)) continue;
    const durationS = CONFIG[clip.durationKey];
    process.stdout.write(`  ${clip.file} (${durationS}s, ${Math.round(durationS * FPS)} frames) … `);
    // Fresh page per clip so each animation gets a clean window (a prior clip's
    // renderFrame can never leak in).
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const { dir } = await renderFrames(page, clip, durationS);
    await page.close();
    const out = join(outDir, clip.file);
    await encode(dir, out);
    // Poster (served next to the mp4): a representative frame ~40% through.
    const poster = join(outDir, clip.file.replace('.mp4', '.jpg'));
    await run(ffmpegPath, ['-y', '-ss', String(durationS * 0.4), '-i', out, '-frames:v', '1', '-q:v', '4', poster]);
    console.log(`${(statSync(out).size / 1048576).toFixed(2)} MB`);
  }
  await browser.close();
  rmSync(tmpDir, { recursive: true, force: true });
  console.log('[media] done. Run `npm run media:verify`.');
}

main().catch((e) => { console.error('[media] FAILED', e); process.exit(1); });
