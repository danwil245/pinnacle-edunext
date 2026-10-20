# Calibration clips — sources

All six clips are **generated locally** (Method B) by `scripts/media/generate.mjs`
— on-brand canvas motion graphics rendered frame-by-frame in headless Chrome and
encoded with ffmpeg to the blink-measurement spec. **No external assets, no API
calls, fully license-free.** No Pexels/Pixabay keys were set at generation time.

Regenerate: `npm run media:generate` · verify: `npm run media:verify`.

| File | Method | Source / credit | License | Duration | Resolution | Size | Mean luma |
|---|---|---|---|---|---|---|---|
| `web-dev-interest.mp4` | generated | `scripts/media/clips.js` (`web-dev-interest`) | none (original, public-domain-equivalent) | 45 s | 1280×720 | 0.48 MB | 32.8 |
| `data-science-interest.mp4` | generated | `scripts/media/clips.js` (`data-science-interest`) | none | 45 s | 1280×720 | 0.54 MB | 36.1 |
| `design-interest.mp4` | generated | `scripts/media/clips.js` (`design-interest`) | none | 45 s | 1280×720 | 1.17 MB | 36.3 |
| `neutral.mp4` | generated | `scripts/media/clips.js` (`neutral`) | none | 45 s | 1280×720 | 0.59 MB | 28.9 |
| `probe-visual.mp4` | generated | `scripts/media/clips.js` (`probe-visual`) | none | 20 s | 1280×720 | 0.19 MB | 31.9 |
| `probe-practical.mp4` | generated | `scripts/media/clips.js` (`probe-practical`) | none | 20 s | 1280×720 | 0.08 MB | 27.8 |

Every clip: MP4 / H.264 / yuv420p / 30 fps / **no audio** / +faststart, no text or
logos, flicker (max frame-to-frame luma jump) ≤ 0.2 (threshold 10), mean luma within
a tight band (27.8–36.3). `.jpg` next to each `.mp4` is the poster frame.

## Honest note
These are **placeholders**. The "interest" clips are only a *rough proxy* for genuine
topic interest — a generated motion graphic can't actually make someone engaged, so
the engaged-vs-neutral baseline separation is weaker than it would be with real,
personally-interesting footage. The two probe clips share one topic (plant growth) and
differ only in presentation (animated diagram vs. a hands-on "doing" demo). Replace any
clip by dropping a file with the same name here (keep the spec; re-run `media:verify`).
