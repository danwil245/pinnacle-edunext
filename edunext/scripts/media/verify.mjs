/**
 * Verify the six calibration clips meet the spec that matters for blink
 * measurement. Asserts, per clip: container+codec (mp4/h264), pixel format
 * (yuv420p), resolution (1280x720), fps (24–30), duration (±0.25s of target),
 * NO audio stream, size under the cap, faststart (moov before mdat), mean luma
 * within a shared band, and a flicker check (max frame-to-frame luma delta below
 * threshold). Also writes a JPEG thumbnail per clip + a contact sheet to
 * docs/calibration-clips/. Prints a table and exits non-zero on any failure.
 *
 *   npm run media:verify
 */
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync, mkdirSync, statSync, readFileSync as read } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CONFIG } from '@edunext/shared';
import { CLIPS } from './clips.js';

const run = promisify(execFile);
const ffprobePath = ffprobeStatic.path;
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const dir = join(root, 'frontend', 'public', 'media', 'calibration');
const thumbs = join(root, 'docs', 'calibration-clips');
mkdirSync(thumbs, { recursive: true });

const SIZE_CAP_MB = 6;
const LUMA_BAND = 22;     // max spread of mean luma across clips (0–255)
const FLICKER_MAX = 10;   // max allowed frame-to-frame mean-luma jump
const FPS_MIN = 24, FPS_MAX = 30;

async function probe(file) {
  const { stdout } = await run(ffprobePath, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file]);
  return JSON.parse(stdout);
}

function faststart(file) {
  // moov must appear before mdat for progressive playback.
  const buf = read(file);
  const moov = buf.indexOf(Buffer.from('moov'));
  const mdat = buf.indexOf(Buffer.from('mdat'));
  return moov !== -1 && mdat !== -1 && moov < mdat;
}

async function lumaSeries(file) {
  // Per-frame mean luma via signalstats; metadata=print logs to stderr (parsing
  // stderr avoids the Windows-path-in-filter-arg escaping problem of file=).
  const { stderr } = await run(
    ffmpegPath,
    ['-hide_banner', '-nostats', '-i', file, '-vf', 'signalstats,metadata=print', '-f', 'null', '-'],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  const ys = [...stderr.matchAll(/YAVG=([\d.]+)/g)].map((m) => parseFloat(m[1]));
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  let maxJump = 0;
  for (let i = 1; i < ys.length; i++) maxJump = Math.max(maxJump, Math.abs(ys[i] - ys[i - 1]));
  return { mean: +mean.toFixed(2), maxJump: +maxJump.toFixed(2) };
}

async function main() {
  const rows = [];
  const fails = [];
  const means = [];

  for (const clip of CLIPS) {
    const file = join(dir, clip.file);
    const r = { file: clip.file, checks: [], ok: true };
    const fail = (m) => { r.checks.push('✗ ' + m); r.ok = false; fails.push(`${clip.file}: ${m}`); };
    const pass = (m) => r.checks.push('✓ ' + m);

    if (!existsSync(file)) { fail('missing file'); rows.push(r); continue; }
    const info = await probe(file);
    const v = info.streams.find((s) => s.codec_type === 'video');
    const hasAudio = info.streams.some((s) => s.codec_type === 'audio');
    const target = CONFIG[clip.durationKey];
    const dur = parseFloat(info.format.duration);
    const sizeMB = statSync(file).size / 1048576;
    const [num, den] = (v.avg_frame_rate || '0/1').split('/').map(Number);
    const fps = den ? num / den : 0;

    info.format.format_name.includes('mp4') ? pass('mp4') : fail(`container ${info.format.format_name}`);
    v.codec_name === 'h264' ? pass('h264') : fail(`codec ${v.codec_name}`);
    v.pix_fmt === 'yuv420p' ? pass('yuv420p') : fail(`pix_fmt ${v.pix_fmt}`);
    (v.width === 1280 && v.height === 720) ? pass('1280x720') : fail(`res ${v.width}x${v.height}`);
    (fps >= FPS_MIN && fps <= FPS_MAX) ? pass(`${fps.toFixed(0)}fps`) : fail(`fps ${fps.toFixed(2)}`);
    Math.abs(dur - target) <= 0.25 ? pass(`${dur.toFixed(2)}s`) : fail(`duration ${dur.toFixed(2)}s (target ${target})`);
    !hasAudio ? pass('no audio') : fail('has audio');
    sizeMB <= SIZE_CAP_MB ? pass(`${sizeMB.toFixed(2)}MB`) : fail(`size ${sizeMB.toFixed(2)}MB`);
    faststart(file) ? pass('faststart') : fail('no faststart');

    const { mean, maxJump } = await lumaSeries(file);
    r.mean = mean; r.maxJump = maxJump; means.push({ file: clip.file, mean });
    maxJump <= FLICKER_MAX ? pass(`flicker ${maxJump}`) : fail(`flicker ${maxJump} > ${FLICKER_MAX}`);

    // thumbnail at the midpoint
    await run(ffmpegPath, ['-y', '-ss', String(dur / 2), '-i', file, '-frames:v', '1', '-vf', 'scale=480:-1', join(thumbs, clip.file.replace('.mp4', '.jpg'))]);

    rows.push(r);
  }

  // Cross-clip luma band
  const lo = Math.min(...means.map((m) => m.mean));
  const hi = Math.max(...means.map((m) => m.mean));
  const bandOk = hi - lo <= LUMA_BAND;
  if (!bandOk) fails.push(`luma spread ${(hi - lo).toFixed(1)} > ${LUMA_BAND} (${means.map((m) => m.file + '=' + m.mean).join(', ')})`);

  // Contact sheet (2x3) from thumbnails
  try {
    const t = CLIPS.map((c) => join(thumbs, c.file.replace('.mp4', '.jpg')));
    await run(ffmpegPath, ['-y', ...t.flatMap((p) => ['-i', p]),
      '-filter_complex', '[0][1][2]hstack=3[top];[3][4][5]hstack=3[bot];[top][bot]vstack=2[o]', '-map', '[o]', join(thumbs, 'contact-sheet.jpg')]);
  } catch { /* contact sheet is best-effort */ }

  console.log('\nClip                      mean-luma  max-flicker  result');
  console.log('------------------------- ---------  -----------  ------');
  for (const r of rows) console.log(`${r.file.padEnd(25)} ${String(r.mean ?? '-').padStart(8)}  ${String(r.maxJump ?? '-').padStart(10)}  ${r.ok ? 'PASS' : 'FAIL — ' + r.checks.filter((c) => c[0] === '✗').join('; ')}`);
  console.log(`\nluma band: ${lo}–${hi} (spread ${(hi - lo).toFixed(1)}, max ${LUMA_BAND}) → ${bandOk ? 'OK' : 'FAIL'}`);
  console.log(`thumbnails + contact sheet → ${thumbs}`);

  if (fails.length) { console.log(`\nmedia:verify FAILED (${fails.length}):\n - ` + fails.join('\n - ')); process.exit(1); }
  console.log('\nmedia:verify PASSED ✅');
}

main().catch((e) => { console.error('media:verify ERROR', e); process.exit(1); });
