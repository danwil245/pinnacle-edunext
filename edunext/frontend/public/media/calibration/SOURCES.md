# Calibration clips — sources

All six clips are **generated locally** (Method B) by `scripts/media/generate.mjs`
— on-brand canvas motion graphics rendered frame-by-frame in headless Chrome and
encoded with ffmpeg to the blink-measurement spec. **No external assets, no API
calls, fully license-free.** No Pexels/Pixabay keys were set at generation time.

Regenerate: `npm run media:generate` · verify: `npm run media:verify`.

| File | Method | Source / credit | License | Duration | Resolution | Size | Mean luma |
|---|---|---|---|---|---|---|---|
| `web-dev-interest.mp4` | generated | `scripts/media/clips.js` (`web-dev-interest`) | none (original, public-domain-equivalent) | 45 s | 1280×720 | 1.21 MB | 47.7 |
| `data-science-interest.mp4` | generated | `scripts/media/clips.js` (`data-science-interest`) | none | 45 s | 1280×720 | 1.42 MB | 42.0 |
| `design-interest.mp4` | generated | `scripts/media/clips.js` (`design-interest`) | none | 45 s | 1280×720 | 3.23 MB | 48.2 |
| `neutral.mp4` | generated | `scripts/media/clips.js` (`neutral`) | none | 45 s | 1280×720 | 0.59 MB | 28.9 |
| `probe-visual.mp4` | generated | `scripts/media/clips.js` (`probe-visual`) | none | 20 s | 1280×720 | 0.19 MB | 31.9 |
| `probe-practical.mp4` | generated | `scripts/media/clips.js` (`probe-practical`) | none | 20 s | 1280×720 | 0.08 MB | 27.8 |

Every clip: MP4 / H.264 / yuv420p / 30 fps / **no audio** / +faststart, no text or
logos, flicker (max frame-to-frame luma jump) ≤ 0.51 (threshold 10), mean luma within
the allowed band (27.8–48.2, spread 20.4 ≤ 22). The three interest clips were given
richer, continuously-evolving motion and lifted brightness (better webcam face
lighting) while staying in band. `.jpg` next to each `.mp4` is the poster frame;
`docs/calibration-clips/<clip>-05s|20s|35s.jpg` show the motion changes over time.

## Honest note
These are **placeholders**. The "interest" clips are only a *rough proxy* for genuine
topic interest — a generated motion graphic can't actually make someone engaged, so
the engaged-vs-neutral baseline separation is weaker than it would be with real,
personally-interesting footage. The two probe clips share one topic (plant growth) and
differ only in presentation (animated diagram vs. a hands-on "doing" demo). Replace any
clip by dropping a file with the same name here (keep the spec; re-run `media:verify`).
