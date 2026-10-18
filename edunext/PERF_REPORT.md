# EduNext — Performance Report (Motion V2)

How to reproduce every number here:

```bash
# 1. backend (temp DB) on :4000
DB_PATH=./data/perf.db JWT_SECRET=dev node backend/src/seed.js
DB_PATH=./data/perf.db JWT_SECRET=dev PORT=4000 node backend/src/index.js &
# 2. production build in mock mode + preview on :5173
VITE_MOCK_SIGNALS=1 npm run build -w @edunext/frontend
VITE_API_TARGET=http://localhost:4000 npm run preview -w @edunext/frontend &
# 3. harness (production)
node scripts/perf/measure.mjs --base http://localhost:5173 --out scripts/perf/results/P0.prod.json --label baseline
```

The harness (`scripts/perf/measure.mjs`) drives **real Chrome** (via playwright-core +
the Chrome DevTools Protocol) through every route and records, per route: average
and p95 frame time during a scripted scroll and a scripted route change, long tasks
(>50 ms / >100 ms), dropped frames, JS heap (after a forced GC), live WebGL contexts
and live ScrollTrigger instances, plus a 20× route round-trip leak check.

## Test machine & honest limitation

- Windows 11, 16 logical cores, Chrome 155 (headless), production build via `vite preview`.
- **Headless Chrome renders WebGL in software (SwiftShader).** Absolute Vanta frame
  times are therefore *pessimistic* and, conversely, this environment **cannot
  reproduce real-GPU fill-rate cost or `backdrop-filter` compositing cost**. Those are
  the two most likely causes of the lag the owner saw on a real laptop GPU, and they
  are structurally invisible to an automated headless harness. Where I cannot measure
  a cause I say so and justify the fix by code review + established jank physics,
  rather than inventing a number. A `--headful` flag exists to get hardware-accelerated
  numbers on a machine with a display.

## P0 baseline — measured (production build)

Raw JSON: `scripts/perf/results/P0.prod.json` (dev-server run: `P0.dev.json`).

| Route | scroll avg (ms) | scroll p95 (ms) | dropped | LT>50ms | LT>100ms | heap (MB) | live WebGL | ScrollTriggers |
|---|---|---|---|---|---|---|---|---|
| `/` | 17.05 | 17.1 | 2 | 0 | 0 | 5.69 | 1 | 5 |
| `/login` | 16.65 | 17.1 | 0 | 0 | 0 | 5.26 | 1 | 1 |
| `/register` | 16.65 | 17.1 | 0 | 0 | 0 | 5.21 | 1 | 1 |
| `/onboarding` | 16.65 | 17.1 | 0 | 0 | 0 | 5.19 | 1 | 0 |
| `/home` | 16.65 | 17.0 | 0 | 0 | 0 | 3.55 | 0 | 3 |
| `/courses/:slug` | 16.65 | 17.0 | 0 | 0 | 0 | 3.50 | 0 | 2 |
| `/learn/:id` | 16.65 | 17.0 | 0 | 0 | 0 | 3.18 | 0 | 0 |
| `/summary/:id` | 16.65 | 17.0 | 0 | 0 | 0 | 4.34 | 0 | 2 |
| `/insights` | 16.65 | 17.0 | 0 | 0 | 0 | 4.33 | 0 | 2 |
| `/profile` | 16.65 | 17.0 | 0 | 0 | 0 | 3.69 | 0 | 4 |

Route transitions (scripted SPA nav): avg **16.65 ms**, p95 ≤ **17.1 ms**, 0 dropped.

**20× round-trip leak check** (`/home` ⇄ `/insights`): ScrollTriggers **3 → 3**, live
WebGL **0 → 0**, created WebGL contexts **0 → 0**, heap **4.21 → 3.94 MB**. No growth.

> `webglCreates` reads 3 on Vanta routes but `liveWebgl` is **1** — the extra two are a
> *measurement artifact* (a cheap WebGL-availability probe + the harness's own
> `getContext` re-call to test liveness). The real, live context count is exactly **1**
> on Vanta routes and **0** everywhere else, and it does not grow. The async `cancelled`
> guard in `VantaBackground` already defeats React StrictMode double-init (dev and prod
> both show one live context).

### Production vs dev server

| | prod (preview) | dev server |
|---|---|---|
| landing heap | 5.69 MB | 8.69 MB |
| leak-check baseline heap | 4.21 MB | 7.44 MB |
| scroll p95 | ~17 ms | ~17 ms |
| long tasks >50 ms | 0 | 0 |

The dev server carries **~50–85 % more heap** (unminified modules + HMR client +
React dev build), which is exactly why the dev experience feels heavier. On this fast
16-core machine the *frame profile* is the same in both, but a lower-end machine will
feel the dev overhead far more. **Demo from the production build** (`npm run build &&
npm run preview`), never `npm run dev` — this alone removes a large part of the
perceived lag and is not a real product problem.

## Ranked causes to fix in P1

The harness already meets the Section-2 frame-time / long-task / context / leak targets
*in this environment*. The ranked list below therefore separates **(M)** measured facts
from **(R)** real-GPU / main-thread costs identified by code review that this headless
harness cannot surface but that are well-established laptop-GPU jank sources and match
the prompt's suspect list. Each will get a before/after on the axis it *can* be measured
on (bundle size, context re-renders, live-context count, heap, headful frame time).

1. **(R, highest probability) Vanta renders at full `devicePixelRatio` and full-screen
   resolution.** `VantaBackground` passes `scale: 1` and the renderer uses native DPR;
   on a HiDPI laptop (DPR 2) that is ~4× the fragments for a fill-rate-bound WAVES
   shader. The background is soft and blurry, so halving its internal resolution and
   CSS-upscaling is invisible but a large GPU saving. *(code: `VantaBackground.jsx`,
   `motionConfig.js` vanta block)*
2. **(R) Vanta keeps painting when scrolled out of the hero.** It only pauses on
   `document.hidden`; scrolling past the hero leaves a full-screen WebGL surface
   repainting behind the rest of the page. Add an `IntersectionObserver` pause.
   *(code: `VantaBackground.jsx` — visibilitychange only)*
3. **(R) `backdrop-filter: blur()` on `.glass` / `.glass-strong`.** Applied to cards,
   nav and panels layered over the animated background; `backdrop-blur` recomposites
   every frame during scroll and is one of the top real-GPU scroll-jank causes. Replace
   it on large / scrolling surfaces with a semi-opaque gradient fill + subtle border
   (keep the glass *look*); keep blur only on small static surfaces. *(code:
   `index.css` lines 76, 79)*
4. **(M/R) `MotionBudgetProvider` runs a second rAF loop whose `fps` state is broadcast
   through context ~1×/second**, re-rendering the entire subtree below the provider
   every second — the prompt explicitly flags "a second rAF loop" and "context
   providers whose value changes constantly." Keep `fps` out of the broadcast value
   (expose it via a ref/subscription), so only `degraded` (which changes rarely) is in
   context. *(code: `useMotionBudget.jsx`)*
5. **(R) `body { background-attachment: fixed }`** forces a full-viewport repaint on
   scroll in several engines. Move the gradient to a fixed `-z` layer instead. *(code:
   `index.css` line 47)*
6. **(M) Main `index.js` chunk = 912 KB (gzip 282 KB)** — every route + GSAP + Recharts
   eagerly in one chunk (three.js 613 KB and Vanta 12 KB are *already* split out;
   face-api 1.3 MB is camera-only and lazy). Route-level `React.lazy` + a `manualChunks`
   split for Recharts reduces initial parse/execute. *(build output)*
7. **(R, minor) Permanent `will-change: transform` on every `.split-word`** keeps a GPU
   layer alive for every word forever. Set it before the reveal and clear it after.
   *(code: `index.css` line 69)*

### What is already good (do not "fix")

- One Lenis instance driven by `gsap.ticker` with `lagSmoothing(0)`; `ScrollTrigger.update`
  wired to Lenis `scroll` — single animation loop, no duplicate rAF for scrolling.
- Exactly one live WebGL context; Vanta + three dynamically imported and out of the main
  bundle; destroyed on unmount with an async `cancelled` guard.
- No ScrollTrigger / WebGL / heap leak across 20 route round-trips.
- No layout-property animation found in the motion primitives (all `transform`/`opacity`).

## Status

P0 complete: branch `motion-v2`, re-runnable harness `scripts/perf/measure.mjs`,
baseline artifacts in `scripts/perf/results/`, ranked causes above. No lag fixes applied
yet (only harness infrastructure: a `preview` `/api` proxy in `vite.config.js` and a
read-only `window.__edunextPerf` ScrollTrigger handle in `motion/gsap.js`).

## P1 — fixes applied & re-measured

Raw JSON: `scripts/perf/results/P1.prod.json`. Re-run with `--label P1`.

### Bundle size (the clearest measured win)

| chunk | P0 baseline | P1 | note |
|---|---|---|---|
| main `index.js` | **912 KB** (gzip 282 KB) | **325 KB** (gzip 113 KB) | −64 % gzip — route-split + Recharts extracted |
| `recharts` | *(in main)* | 518 KB (gzip 149 KB) | now loaded **only** on `/insights` + `/summary` |
| per-route page chunks | *(in main)* | 2–16 KB each | lazy per route |
| `three.module` | 613 KB | 613 KB | already lazy (Vanta only) — unchanged |
| `vanta.waves.min` | 12 KB | 12 KB | already lazy — unchanged |
| `face-api.esm` | 1328 KB | 1328 KB | already lazy (camera only) — unchanged |

The initial download/parse for a first-time visitor to the landing page is now the
325 KB shell instead of 912 KB; chart code (518 KB) is deferred until a chart route.

### Frame time / contexts / leaks (harness, production build)

| metric | P0 | P1 | target |
|---|---|---|---|
| scroll p95 (all routes) | ~17 ms | ~17 ms | ≤ 20 ms ✓ |
| route-transition avg | 16.65 ms | 16.65 ms | 60 fps ✓ |
| long tasks > 100 ms (scroll) | 0 | 0 | 0 ✓ |
| live WebGL contexts (Vanta routes) | 1 | 1 | exactly 1 ✓ |
| ScrollTriggers after 20 round-trips | 3 → 3 | 3 → 3 | no growth ✓ |
| live WebGL after 20 round-trips | 0 → 0 | 0 → 0 | no growth ✓ |
| heap after 20 round-trips | 4.21 → 3.94 MB | 4.18 → 3.92 MB | no growth ✓ |

The headless harness was already green on frame time at P0, so these hold steady — as
expected. The fixes below target **real-laptop-GPU** and **main-thread React** cost that
this software-rendered headless environment cannot surface; they are correct engineering
regardless and verified not to regress anything the harness *can* see.

### What each fix did

1. **Vanta DPR cap** — `VantaBackground` now renders at `devicePixelRatio / scale` with
   `scale` chosen so the effective pixel ratio is ≤ 1.5. On a DPR-2 laptop that is a
   ~1.8× fragment-count reduction for the fill-rate-bound WAVES shader; invisible on a
   blurry background. *(not observable in software-rendered headless; verified the single
   live context is preserved)*
2. **Vanta render-loop pause** — an `IntersectionObserver` on the hero plus
   `visibilitychange` now fully stop Vanta's rAF loop (`cancelAnimationFrame(req)`, resume
   via the bound `animationLoop()`) when the hero is scrolled off or the tab is hidden —
   zero GPU work instead of a frozen-but-still-painting canvas.
3. **`backdrop-filter` removed from large/scrolling glass** — `.glass`, `.glass-strong`
   and the sticky nav now use a static semi-opaque gradient fill + highlight border
   instead of `backdrop-blur`. The frosted look is preserved; the per-scroll-frame
   backdrop recomposite (a top real-GPU scroll-jank cause) is gone. A `.glass-blur`
   escape hatch remains for small static surfaces.
4. **MotionBudget no longer re-renders the app every second** — the once-a-second `fps`
   sample moved from React context to a tiny external store (subscribed only by `/dev`);
   context now changes only when `degraded` toggles. Eliminates the per-second whole-tree
   re-render flagged at P0. The guard's rAF is a passive monitor (reads `performance.now`,
   no paint, no React render) — kept as the tracking safety net.
5. **`background-attachment: fixed` removed** — the ambient gradient moved to a single
   fixed `body::before` layer, so scrolling no longer forces a full-viewport repaint.
6. **Route-level code splitting + Recharts chunk** — see the bundle table above.
7. **`will-change` on split words** — now set by the `SplitHeading` primitive only for
   the duration of the reveal and cleared on complete, instead of a permanent CSS rule.

### Honest limitation restated

The owner's perceived lag could not be reproduced in this headless/software-rendered
harness (it was green at P0). The most likely real cause set — full-DPR Vanta fill-rate +
`backdrop-filter` compositing over the animated background + the dev-server overhead — is
exactly what fixes 1–3 and the "demo from the production build" guidance address, but the
GPU portion is not numerically measurable in this environment. Run `measure.mjs --headful`
on the demo laptop for hardware-accelerated confirmation before the panel.

## P2 — animation additions held the targets

Each animation batch re-ran the harness. Raw JSON: `scripts/perf/results/P2a.prod.json`,
`P2b.prod.json`.

| after batch | max scroll p95 | long tasks >100 ms | live WebGL (Vanta routes) | 20× leak (ST / WebGL / heap) |
|---|---|---|---|---|
| P2a (scroll story, ambient, intro) | 16.9 ms | 0 | 1 | 3→3 / 0→0 / no growth |
| P2b (cursor, tilt, scramble, marquee) | 17.1 ms | 0 | 1 | 4→4 / 0→0 / no growth |

Landing ScrollTrigger count rose from 5 → 11 with the new hero scrub + horizontal gallery +
per-card parallax; all are `useGSAP`-scoped and killed on unmount (the leak check confirms no
accumulation on the round-tripped routes). `/demo` was verified functionally in Chrome (score
ring eases, captions advance, no console/network errors); it is motion-heavy but drives the
gauge with GSAP `quickTo` rather than per-tick React state.

The lesson route (`/learn/:id`) stays motion-free: 0 ScrollTriggers, 0 WebGL, no cursor
follower (disabled on `/learn`).

_Remaining P3 (full guidelines audit) and P4 (end-to-end walk, tracker-FPS before/after) are
noted as not-yet-done in `ASSUMPTIONS.md` → Motion V2 → Deferred._
