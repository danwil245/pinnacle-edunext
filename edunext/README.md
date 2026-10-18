# EduNext

A standalone, self-hosted course website that personalizes learning using **on-device**
attention (blink rate) and emotion sensing. It builds a **personal blink baseline** per
learner (people blink at different rates), reads live engagement during lessons, and
**adapts** pace/content — serving each lesson in the format the learner engages with more.

> University project (SSN · AI & Education Technology, Review I). The learning-signal
> relationships are **estimates**, not diagnoses — see **Honesty & limitations**.

**Privacy invariant (non-negotiable):** camera frames never leave the browser. Only
derived numbers/labels (a blink rate, a zone, an emotion label, a score) are sent to the
server. A test asserts the tick upload schema contains no image/blob/base64 fields.

## Quick start

```bash
npm install          # also copies face-api model weights into frontend/public/models
npm run seed         # seed 3 placeholder courses × 3 lessons (idempotent)
npm run dev          # backend :4000 + frontend :5173 (Vite proxies /api -> :4000)
```

Open http://localhost:5173 → register → onboarding → home.

### Demo in under 3 minutes (no webcam needed)

1. `npm run seed && npm run dev`, open http://localhost:5173, **Register**.
2. Onboarding → **Use mock signals** → Continue. Pick an interest. The baseline + style
   clips auto-measure in seconds (10× time-scale). Save on the result screen.
3. On **Home**, open a course → a lesson → **Start lesson**.
4. Open **Dev** (top nav) to watch the live tick → engagement → curation pipeline, or just
   watch the HUD and the adaptive banners/toasts fire during the lesson.
5. Finish → **Summary** (timeline with adaptive-action markers) → **Insights**.

There is also a standalone **/dev** console to drive the whole pipeline (camera or mock,
1×/5×/10×) and watch ticks, engagement, and curation actions live.

### Panel demo — `/demo` (scripted simulation)

For presenting to a panel without depending on a webcam read:

```bash
npm run seed
npm run build && npm run preview      # ALWAYS demo from the production build, not `npm run dev`
# open http://localhost:5173/demo
```

`/demo` switches the tracker to **mock** signals and plays the built-in
engaged → drifting → confused → fatigued → recovering scenario through the **real**
engagement + curation logic, so the adaptive behaviour is genuine — only the input is
simulated (it is clearly labelled as such on screen). Presenter keys: **R** restart ·
**F** fast-forward (6×) · **Space** pause/resume. Real-camera mode is unchanged.

> Test in **Chrome**, laptop **plugged in** (battery saver throttles the GPU), other heavy
> tabs closed. The production `preview` build is dramatically smoother than the dev server —
> see `PERF_REPORT.md`.

## Scripts

| command | what |
|---|---|
| `npm run dev` | backend + frontend together |
| `npm run build` | production build of the frontend |
| `npm test` | all workspaces (shared vitest, backend supertest, frontend vitest) |
| `npm run seed` | seed placeholder courses (warns, doesn't fail, on unreachable video URLs) |
| `npm run migrate` | create the SQLite schema (idempotent) |
| `npm run e2e` | in-process end-to-end API smoke (register → … → summary → insights) |

## Architecture

npm-workspaces monorepo; the formulas live in exactly one place (`shared/`) and both the
server and the browser import them — no duplicated math.

- **`shared/`** — pure, framework-free ESM + vitest. The single source of truth:
  - `config.js` — one frozen `CONFIG`; every tunable number lives here.
  - `zones.js` — `categorize(bpm, boundaries)`, `personalizeBoundaries(...)`.
  - `emotion.js` — baseline subtraction, 7-class → learning-label heuristic, smoothing.
  - `tick.js` — `buildTick(...)` (the BPM warm-up fix + emotion/presence).
  - `engagement.js` — `computeEngagement(...)` (weighted, renormalized, EMA-smoothed).
  - `curation.js` — `evaluateCuration(...)` state machine + `shouldPromptFeedback(...)`.
  - `style.js` — weighted style stats, `detectStyle`, `chooseVariant`.
  - `recommend.js` — `rankCourses(...)` with plain-language reasons.
  - `schemas.js` — zod payload schemas (incl. the strict, image-free tick schema).
- **`backend/`** — Express + better-sqlite3. App factory (`createApp(db)`), idempotent
  migrations (WAL + foreign keys), JWT auth (bcryptjs, 7-day tokens) with a light rate
  limiter, and routes for auth/profile/courses/lessons/sessions/insights. The
  end-session summary + style update + progress mark run in a single transaction and are
  idempotent. Ownership is enforced on every session/profile route.
- **`frontend/`** — React 18 + Vite + Tailwind. A single persistent `TrackingProvider`
  sits above the router (so the camera/FaceMesh never remount on navigation), owns the
  sample stream and the clock (real for camera, virtual for the time-scaled mock), and a
  swappable `EmotionProvider` (face-api; degrades gracefully to blink + feedback). The
  lesson controller (`useLessonSession`) runs the shared pipeline per tick.

## The formulas (what the numbers mean)

- **Blink zones.** `buildTick` reports **no BPM** until `MIN_OBSERVED_S_FOR_BPM` (20s) of
  *observed face time* has accrued (fixing the original bug where the first minute read a
  falsely low BPM → "hyperfocused"). Then `bpm = blinksInWindow × 60 / observedSeconds`
  over a 60s window. `personalizeBoundaries` rescales the default zone edges `[8,15,21,31]`
  so the learner's engaged/neutral reads land on anchors 11.5 and 18; it falls back to the
  defaults if the two reads are within 2 BPM, non-finite, or inverted.
- **Emotion.** The 7 expression classes are baseline-subtracted (vs. the neutral-clip
  baseline), grouped (`engaged=happy`, `frustrated=angry+disgusted`,
  `confused=fearful+surprised`, `bored=sad`), and the largest group mass above
  `EMOTION_THRESH` wins (else `neutral`); labels are mode-smoothed.
- **Engagement score (0–100).** Weighted mean of the *available* components (blink 0.45,
  emotion 0.35, feedback 0.20), weights renormalized when a component is missing, then
  EMA-smoothed (`α = 0.35`). Face lost with no fresh feedback → no score.
- **Curation.** A deterministic, priority-ordered state machine (break > replay > switch >
  slow-down > speed-up) with warm-up and cooldown gates and consecutive-tick counters.
- **Learning style.** Weighted engagement per variant (style probe weighted 3×, long-enough
  lessons 1×); `detectStyle` needs both variants and resists flipping on one noisy session.
  `chooseVariant` serves the preferred variant with a 15% exploration rate.
- **Recommendations.** `interest·0.45 + styleMatch·0.30 + history·0.15 (+0.15 in-progress)`.

All of the above are tunable in `shared/src/config.js`.

## Config knobs

Everything lives in `shared/src/config.js` (`CONFIG`, frozen). Highlights: `TICK_MS`,
`MIN_OBSERVED_S_FOR_BPM`, `WEIGHTS`, `EMA_ALPHA`, `BLINK_SCORE`/`EMOTION_SCORE`/
`FEEDBACK_SCORE`, the whole `CURATION` block (counters/cooldown/rate clamps), `STYLE`
(probe/lesson weights, explore rate, confidence scales), and `RECOMMEND` weights.

Backend env (`.env`, see `.env.example`): `PORT`, `CORS_ORIGIN`, `JWT_SECRET` (required in
production; a dev default is used with a warning otherwise), `DB_PATH`.
Frontend: `VITE_MOCK_SIGNALS=1` makes the mock source the default.

## Motion (Lenis + GSAP + Vanta)

The frontend has a motion layer that **adds polish without touching behaviour** —
`shared/`, `backend/` and the tracking internals are unchanged, and the privacy
invariant still holds (fonts + libraries are bundled via npm; nothing loads from a
CDN at runtime).

- **Smooth scroll** — one Lenis instance (`motion/SmoothScrollProvider.jsx`) driven by
  `gsap.ticker` and synced to ScrollTrigger. Disabled under reduced motion (native scroll).
- **Animation** — GSAP + ScrollTrigger + SplitText, registered once in `motion/gsap.js`.
  Reusable primitives in `motion/primitives.jsx` (`Reveal`, `Stagger`, `SplitHeading`,
  `Magnetic`, `CountUp`, `PageTransition`, `InlineError`) — all safe without JS and under
  reduced motion. Every value lives in `motion/motionConfig.js`.
- **Animated background** — Vanta **WAVES** (`motion/VantaBackground.jsx`), lazy-loaded with
  three.js so neither is in the main bundle. On the **landing**, **onboarding** and **auth**
  pages only; **never** on the lesson page. Destroyed on unmount; falls back to a static CSS
  gradient under reduced motion, no WebGL, low-power devices, hidden tabs, or when the
  performance guard degrades.
- **Performance guard** — `motion/useMotionBudget.jsx` samples frame times; if the main
  thread stays slow it degrades motion (pauses Vanta, stops non-essential timelines) so the
  animations never starve the on-device tracker. Live readout on `/dev`.
- **Reduced motion** — OS `prefers-reduced-motion` **or** the in-app toggle (Profile →
  *Display & motion*, persisted in `localStorage`).
- **Focus mode** — a lesson-header toggle that switches off non-essential motion for the
  session (motion defaults on).

Tunables: `frontend/src/motion/motionConfig.js`. The three.js version is **pinned to
0.134.0** for Vanta compatibility (see `ASSUMPTIONS.md`).

### Bundle size (before → after the motion rebuild)

| asset | before (gzip) | after (gzip) | notes |
|---|---|---|---|
| main `index.js` | 743 kB (220 kB) | 912 kB (282 kB) | + GSAP/ScrollTrigger/SplitText + Lenis |
| `index.css` | 27 kB (5.5 kB) | 49 kB (8.5 kB) | tokens, scrollbar, self-hosted font faces |
| `three.module.js` | — | **614 kB (157 kB)** | **lazy** — loads only when Vanta mounts |
| `vanta.waves.min.js` | — | **12 kB (4 kB)** | **lazy** |
| `face-api.esm.js` | 1328 kB (340 kB) | 1328 kB (340 kB) | unchanged (already lazy) |
| fonts (woff/woff2) | — | ~0.4 MB total | self-hosted, `font-display: swap`, per-subset |

three + Vanta add **zero** to the main bundle (they are separate on-demand chunks); the
main-chunk growth is GSAP + Lenis, used across the app.

## Honesty & limitations

- The blink-rate ↔ attention link is supported at the **population level** (e.g. Nakano et
  al. 2009/2013; Ranti et al. 2020; Maffei & Angrilli 2018). EduNext applies it **per
  learner** with a short personal calibration. It is an **estimate, not a diagnosis**.
  Blink rate is also affected by screens, lighting, dry eyes, contact lenses, medication,
  and caffeine.
- A ~45s calibration per clip yields few blinks, so the baseline is **noisy**. The UI says
  so and lets you recalibrate anytime.
- The emotion mapping (7 expression classes → engaged/confused/frustrated/bored) is a
  **heuristic**, not a validated affect model. Facial expression ≠ internal state.
- "Learning style" (visual vs practical) is a lightweight **engagement-preference** signal
  — "the format you engage with more" — not an innate trait; the learning-styles
  literature is contested.
- Interest-vs-neutral (baseline) and visual-vs-hands-on (style) are measured separately on
  purpose, to reduce confounds.
- **Course content is placeholder** (clearly labeled in the UI) but structurally complete,
  so it can be swapped without code changes.
- Everything sensed is processed **on-device**; only derived numbers are stored, and
  **Delete my data** removes the account and every related row.

## Known limitations

- The design-skill audit (Section 11A) is pending — see `ASSUMPTIONS.md` (Phase 4). The UI
  is built to the written 11A quality bar (tokens, a11y, loading/empty/error states).
- The browser-driven Playwright E2E is replaced by an in-process API E2E (`npm run e2e`);
  the camera/emotion paths are exercised manually and via the mock-pipeline unit test.
- Sample video URLs are public Google test clips; `npm run seed` only warns if a URL is
  unreachable (their bucket rejects HEAD requests but serves GET fine in the browser).

See `PLAN.md` for phase-by-phase status and `ASSUMPTIONS.md` for every default chosen.

## Deployment

EduNext deploys as two free services — **frontend on Vercel**, **backend on
Render** — talking over HTTPS via `VITE_API_URL` with strict CORS. See
**[DEPLOY.md](./DEPLOY.md)** for exact, step-by-step instructions, the values to
enter, and troubleshooting.

Quick checks before deploying: `npm run build` → `npm run predeploy` (static
pre-flight) and the two-origin `npm run test:deploy` (see DEPLOY.md).

**Free-tier honesty:** Render free instances sleep after ~15 min (first request
takes ~30–60 s — the app shows a "waking up" banner and recovers), and the free
database is **ephemeral** (accounts reset on restart; placeholder courses
auto-reseed). Attach a persistent disk to keep data. Use `/demo` (scripted
simulation) as a webcam-free fallback when presenting.
