# Assumptions & Decisions

Every non-obvious default chosen during the build, with a one-line reason.

## Phase 0

- **Reused local blink app instead of cloning GitHub.** The working directory already
  contained a newer local copy (`blink-detection-updated-main`) with a calibration flow,
  so we copied `src/`, `index.html`, and the Vite/Tailwind/PostCSS configs into
  `frontend/` rather than `git clone`ing the older `github.com/danwil245/blink-detection`.
  Reason: the local copy is strictly newer and avoids a network dependency.
- **Built in a dedicated `edunext/` folder with its own git repo.** The parent directory
  is inside an unrelated git repository (a different project at `~/Downloads`). Reason:
  keep EduNext's history clean and isolated.
- **Package names are scoped `@edunext/{shared,backend,frontend}`.** Reason: unambiguous
  workspace cross-imports (`import { CONFIG } from '@edunext/shared'`).
- **Shared is consumed as a workspace dependency, not a relative path.** Reason: one
  canonical copy of the formulas resolved identically by backend and frontend.
- **`better-sqlite3` + `bcryptjs` (pure-JS bcrypt).** Reason: synchronous SQLite keeps
  handlers simple; `bcryptjs` avoids native build issues the prompt called out.
- **Dev `JWT_SECRET` default allowed with a console warning; production start refuses to
  run without it.** Reason: matches Section 4; keeps local dev frictionless.
- **DB path `backend/data/edunext.db` (gitignored), WAL mode.** Reason: keep runtime data
  out of the repo.
- **Design skills found:** taste skill = `design-taste-frontend`; web design guidelines
  skill = `web-design-guidelines`. Both installed under `.agents/skills/`. Will be loaded
  and applied in Phases 3–7 per Section 11A (fallback rules not needed).
- **`vitest` configured with `passWithNoTests` during scaffolding** so Phase 0 is green
  before Phase 1 adds the real suites.

## Phase 2

- **Sample video URLs warn on a HEAD 403 during seed.** Google's `gtv-videos-bucket`
  rejects HEAD requests (returns 403) but serves the same URLs fine via GET in a browser.
  Per spec the seed treats this as a warning, not a failure.
- **`categorize` returns a zone *key* string** (not an object) in `shared`; display
  metadata lives in `ATTENTION_ZONES`/`ZONE_BY_KEY`. Needed for serialization + scoring.
- **`chooseVariant` uses `Math.random` on the server** (session create + lesson serving).
  Deterministic rng is injected only in unit tests.
- **Recalibration (`DELETE /profile/calibration`) resets style to `unknown`/0 and clears
  `style_stats`**, since recalibrating restarts the personal estimate.
- **A course is "in progress"** when it is started (enrolled or has a session) and not all
  its lessons are completed — this drives the recommendation in-progress boost.
- **Session variant is authoritative at `POST /sessions`.** `GET /lessons/:id` also returns
  a `servedVariant` for preview; due to the exploration rate the two may differ, and the
  lesson player uses the session's variant.

## Phase 3

- **The tracker owns a clock.** Camera mode uses the real clock (`Date.now`); mock mode
  uses a virtual clock advanced by `100 × timeScale` ms every 100ms. `buildTick`, the
  lesson controller, and `elapsedS` all read `getNow()`, so the whole scenario (incl.
  warm-up and curation cooldowns) compresses consistently under time-scale — the mock
  demos the full adaptive flow in ~15s at 10×.
- **`CameraRunner` mounts only while the camera source is started**, but the
  `TrackingProvider` is above the router, so navigation never remounts the stream/FaceMesh.
  `useFaceMesh` internals are untouched; the runner only adds 1 Hz presence + emotion.
- **Emotion backend prefers WebGL, falls back to CPU** (face-api/tfjs); if model load fails
  the system degrades to blink + feedback with `emotionAvailable=false`, never crashing.
- **face-api weights are copied to `frontend/public/models` via `postinstall`**, resolving
  the package through `require.resolve` so npm-workspace hoisting to root `node_modules`
  works. `public/models` is gitignored (regenerated on install).
- **Default source is `camera`**, or `mock` when `VITE_MOCK_SIGNALS=1`. Also toggleable on
  `/dev`.
- **The old standalone blink `App.jsx` was replaced** by the router shell; its chart
  components (`BpmChart`, etc.) and `useBlinkStats` remain for reuse in later UI phases.

## Phase 4

- **Design skills (Section 11A):** the installed `design-taste-frontend` + `web-design-guidelines`
  skills were found. To fit the whole 9-phase build in one session budget, the UI is built
  to the **written 11A quality bar** (which the prompt states is the minimum even when the
  skills are present): a real token system (one accent ramp, slate neutral scale, one type
  scale, consistent radius/spacing), semantic HTML, visible focus rings, 44px targets,
  `aria-live`/roles on notices, and `prefers-reduced-motion`. The formal skill-driven audit
  is Phase 7 — a good point to load the skills and run the review pass.
- **Onboarding supports three modes:** camera (real measurement), mock (same pipeline,
  10× time-scale so the full flow demos in seconds without a webcam), and no-camera
  (default zones, `personalized:false`, null emotion baseline / style probe).
- **Calibration measures observed face-time, not wall-clock** (progress advances only on
  presence stamps), so "no face" pauses the timer — matching the spec.
- **Client clips mirror the backend** (`frontend/src/content/clips.js`) so onboarding is
  self-contained; content is placeholder + swappable, so the duplication is acceptable.
- **Token stored in `localStorage`** under `edunext_token` (regular web app; per Section 4).

---

## Motion rebuild (Lenis + GSAP + Vanta)

- **Design skills:** `design-taste-frontend` and `web-design-guidelines` are present
  (`.claude/skills/`, `.agents/skills/`). Their principles drive this rebuild; the formal
  `web-design-guidelines` audit is run in phase M7. Where guidance conflicts,
  web-design-guidelines wins on accessibility/usability, taste wins on look & feel.
- **Vanta effect = WAVES** (one choice used everywhere for consistency). Dark base + a
  single sky accent read from tokens; chosen over Fog because the slow wave motion suits a
  calm "focus" product and stays readable under overlaid text.
- **three pinned to 0.134.0.** Vanta 0.5.24 is built against three r134; newer three
  removes APIs Vanta uses (e.g. `Geometry`, `Face3`) and the effect throws. three + vanta
  are lazy-loaded via dynamic `import()` so they never enter the main bundle.
- **Lenis↔GSAP wiring:** one Lenis instance in `SmoothScrollProvider`, driven by
  `gsap.ticker` with `lenis.on('scroll', ScrollTrigger.update)` and
  `gsap.ticker.lagSmoothing(0)`. Under reduced motion Lenis is not created (native scroll).
- **Reduced motion** = OS `prefers-reduced-motion` OR the in-app Profile toggle
  (`edunext_reduce_motion` in localStorage). When on: no Lenis smoothing, no Vanta, splits
  and scroll-driven tweens collapse to simple fades / no motion.
- **Focus mode** (lesson header) defaults to motion **on**; one click disables all
  non-essential lesson motion for the session (`edunext_focus_mode` in localStorage).
- **Performance guard** (`useMotionBudget`): a rAF frame-time monitor; if the main thread
  stays slow (>~32ms frames) for a few seconds it degrades motion (pause Vanta, stop
  non-essential timelines) and shows a dismissable "Re-enable motion" notice. No WebGL is
  ever mounted on the lesson route (asserted in `useMotionBudget`/lesson).
- **Fonts self-hosted** (no runtime CDN, per the privacy invariant): display face
  **Space Grotesk**, body **Inter**, bundled via `@fontsource` npm packages with
  `font-display: swap`.
- **New public landing route `/`**; logged-in users keep `/home` as their main page and
  reach the landing page via a footer link only (the old `/` → `/home` redirect is removed).

### Motion rebuild — audit & verification (M7/M8)

- **Web Interface Guidelines audit** (Vercel WIG) run across every page. Fixes applied:
  `color-scheme: dark` on `<html>`; `<meta name="theme-color">`; `text-wrap: balance` on
  headings; `touch-action: manipulation` on buttons; replaced `transition-all` with explicit
  property lists (onboarding stepper, HUD gauge); `aria-label` on the reduce-motion switch;
  `aria-live` preserved on all toasts/notices; icon-only close button keeps its `aria-label`;
  `min-w-0` + `truncate` where headings/labels can overflow. Remaining known gaps:
  - Placeholder calibration/lesson clips are external sample videos **without captions**
    (content is placeholder by design); real content would ship captions/transcripts.
  - The calibration clips autoplay + loop (muted); they are functional (watched during
    calibration), not decorative, so they are not force-stopped under reduced motion.
- **Bundle:** three (614 kB / 157 kB gz) + vanta (12 kB / 4 kB gz) build as **lazy chunks**,
  not in the main bundle. Main chunk grew ~169 kB (gz +62 kB) from GSAP + Lenis; full
  before/after table is in `README.md` → Motion.
- **Verification:** `npm test` (shared 71 / backend 22 / frontend 2, incl. the
  providers-don't-remount test), `npm run build`, and `npm run e2e` all green; the production
  `preview` server returns 200 for `/` with the expected title/`theme-color` and serves the
  hashed JS chunk. Vanta/three are confirmed to be **separate on-demand chunks** (dynamic
  `import()`), with `destroy()` on unmount. The visual WebGL render and a zero-console-errors
  browser walk of the full mock flow were **not** automatable in this CLI environment (no
  headless browser available); they are left for a manual `npm run dev` pass per the prompt's
  M8 checklist.

---

## Motion V2

Decisions and assumptions for the Motion V2 pass (branch `motion-v2`). Owner directive:
**looks first** — fix lag by engineering how things render, never by removing Vanta,
shrinking ambition, or stripping animation.

### P0 — profile first
- **Headless browser is now available.** Contrary to the Motion-Rebuild note, a browser
  harness *is* possible here via `playwright-core` (installed as a frontend devDependency)
  driving the **system Chrome** (`channel: 'chrome'`) over CDP. Harness: `scripts/perf/measure.mjs`,
  re-runnable, results in `scripts/perf/results/`.
- **Headless GPU caveat (important):** headless Chrome renders WebGL in software
  (SwiftShader). Vanta/WebGL frame times are therefore pessimistic *and* the harness cannot
  reproduce real-laptop-GPU fill-rate or `backdrop-filter` compositing cost — the two most
  likely causes of the lag the owner saw. P1 fixes for those are justified by code review +
  established jank physics and measured on the axes that *are* observable (bundle size,
  context re-renders, live-context count, heap). Full honesty in `PERF_REPORT.md`.
- **Measured result:** the **production build already meets** the Section-2 frame-time,
  long-task, single-WebGL-context, and no-leak targets in this harness. The dev server
  carries ~50–85 % more heap → **demo from `npm run build && npm run preview`**, not `dev`.
- **Harness infrastructure added in P0** (not lag fixes): a `preview.proxy` for `/api` in
  `frontend/vite.config.js` (preview had none) and a read-only `window.__edunextPerf`
  ScrollTrigger handle in `frontend/src/motion/gsap.js` for counting live triggers.
- The harness measures against a build made with `VITE_MOCK_SIGNALS=1` so onboarding/lesson
  run without a camera; this does not change the real (camera) build.

### P1 — lag fixes
- Vanta: capped effective pixel ratio ≤1.5 via `scale`; true render-loop pause
  (`cancelAnimationFrame(req)` / bound `animationLoop()`) on IntersectionObserver +
  visibilitychange. Verified against vanta@0.5.24's dist build; still exactly one live
  WebGL context.
- Replaced `backdrop-filter` blur on `.glass`/`.glass-strong`/sticky nav with a static
  gradient fill (glass look kept). `.glass-blur` escape hatch retained for small statics.
- `MotionBudget` fps moved to an external store (dev-only subscriber) so the app no longer
  re-renders every second; context changes only on `degraded`.
- Route-level `React.lazy` + Recharts `manualChunk`: main chunk 912→325 KB gzip 282→113.
- Ambient gradient off `background-attachment: fixed` → fixed `body::before`.

### P2 — more animation
- **P2a:** ScrollProgress (navbar + landing), Ambient glow blobs + grain (non-lesson),
  hero scroll-away parallax, Signals pinned horizontal gallery w/ parallax, once-per-session
  page-load Intro.
- **P2b:** CursorFollower (desktop only, off on touch/reduced/lesson), TiltCard (tilt +
  spotlight), Scramble, Marquee of research references.
- **P2c:** `/demo` scripted simulation (mock scenario through the real pipeline; eased score
  ring; narrated captions; presenter keys R/F/Space; chunk preload). Clearly labelled a
  simulation. Real-camera mode unchanged.
- Every batch re-ran the harness (`scripts/perf/results/P2*.prod.json`): all P1 targets held
  (p95 ≤17 ms, 0 long tasks >100 ms, one WebGL context, no leaks).

### Deferred (honest, not yet done)
- Route transition **clip-path wipe + GSAP Flip** shared-element transitions (the richer half
  of P2c). The existing `PageTransition` fade/slide remains; a clip-path wipe was deferred to
  avoid risking a tracker remount without a full P4 verification pass.
- Count-up numbers wired into Home/Insights/Summary stats (the `CountUp` primitive exists but
  is not yet placed there); attention-zones animated BPM-marker sweep; Recharts draw-in on
  first view. 
- The formal P3 web-design-guidelines audit of every page and the full P4 end-to-end walk
  (20-round-trip duplicate check in-browser, reduced-motion + WebGL-blocked fallback walk,
  tracker-FPS before/after on onboarding+lesson) were not completed in this session.

---

## Fix pass (fix-lag-break branch)

- **F1 lag:** root cause was no route-driven tracker lifecycle — the camera +
  FaceMesh + emotion inference kept running on every route once started (measured:
  camera track live + scroll p95 33ms off a tracking route). Fix: `TrackerRouteGate`
  stops the tracker on non-tracking routes (tracking routes = /onboarding, /learn,
  /dev, /demo). The richer idle|warming|active|suspended state machine and a
  `document.hidden` suspend were NOT separately added — the gate already achieves the
  required end state (0 work off tracking routes), verified by `npm run perf:check`.
- **F2 break UI:** added `CONFIG.BREAK.{LENGTH_S:300, SNOOZE_S:300}` — new UI-timing
  constants, **not** a change to any shared math (zones/engagement/curation untouched).
  Decision: **Escape = Keep going** (least-destructive). Break length default 5 min.
  A dev-only `?forcebreak=1` flag on the lesson route renders the break UI with local
  state for review/screenshots (hard to trigger live — curation cooldown preempts it).
  Lesson resets mock time-scale to 1× on start (onboarding leaves it at 10×).

---

## Deployment

- **Topology:** frontend (Vercel static) + backend (Render web service), split
  origin. Auth stays **JWT in the Authorization header** (no cookies) — simplest
  cross-origin, no SameSite/credentials complexity. Logged per the prompt.
- **Env vars:** backend reads all config from validated env (`backend/src/config.js`,
  zod) and refuses to start in production without a strong `JWT_SECRET` and
  `CORS_ORIGINS`. `DATABASE_PATH` is the documented name (`DB_PATH` still accepted).
- **Health:** `/health` (cheap, for the cold-start ping) + `/health/ready` (checks DB).
- **CORS:** exact allow-list from `CORS_ORIGINS` (normalized, no trailing slash);
  optional `CORS_ORIGIN_PATTERNS` regex for Vercel preview URLs (off by default).
- **CSP:** intentionally NOT set — a CSP risks breaking WebGL (Vanta/three), WASM
  (MediaPipe) and workers. Documented in DEPLOY.md; add later and test if needed.
- **Vercel rewrites** use a negative-lookahead so real files (`assets/`, `models/`,
  `mediapipe/`, anything with an extension) are served directly and only app routes
  fall back to `index.html`.
- **Repository layout (blocker for deploy):** `edunext/` is currently an *embedded*
  git repo inside `pinnacle-edunext` (gitlink, no `.gitmodules`), so the app's files
  are not actually on GitHub. It must become a normal subfolder of the connected
  repo (or be its own repo) before Vercel/Render can build it. See DEPLOY.md →
  "Repository layout". This is the one manual step that blocks automated deploy.

---

## Calibration clips

- **No API keys were set** (PEXELS/PIXABAY "not set") and `ffmpeg` was not on PATH,
  so all six clips were **generated locally** (Method B, license-free) via
  `ffmpeg-static` + a headless-Chrome canvas renderer. Tooling lives in
  `scripts/media/` as **devDependencies** only (not shipped in the app).
- **Probe length follows CONFIG = 20 s** (`STYLE_PROBE_CLIP_S`), not the 30 s in the
  prompt's table (the prompt says follow CONFIG). Interest/neutral = 45 s
  (`CALIBRATION_CLIP_S`).
- Generation uses **deterministic frame rendering** (frame N drawn at t = N/30, read
  via `canvas.toDataURL`, encoded by ffmpeg) rather than Playwright video capture —
  Playwright's recorder needs its own ffmpeg binary (absent) and gives imprecise
  fps/length. Frames → exact duration/fps, no extra dependency.
- **Schema:** added one optional, additive field `usedFallbackClip` to
  `shared/src/schemas.js` calibration object so a degraded read (a clip failed to load
  and an in-browser placeholder was used) is recorded in the stored calibration. No
  calibration **math** changed; the field is optional and defaults absent.
- **Measurement logic unchanged:** MeasureClip still measures over the tracker's
  observed-face-time (presence), exactly as before. Only the clip *presentation* gained
  a poster, a "preparing" state, retry-once-then-fallback, and a tap-to-start for the
  rare blocked-autoplay case. The "gate measurement strictly on video playback" refinement
  was intentionally **not** applied, to honour "keep the existing valid-face-time logic
  unchanged".
- **No Vanta/WebGL** renders during onboarding now (plain dark background) so the clip +
  tracker aren't competing with a WebGL loop.
- Manifest = `frontend/src/content/calibrationClips.js` (the old `content/clips.js` was
  deleted; only onboarding imported it). The backend's own
  `backend/src/content/calibrationClips.js` is a separate, untouched placeholder set
  (lesson content, out of scope for this task).
