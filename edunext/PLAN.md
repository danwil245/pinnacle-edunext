# EduNext — Build Plan

A self-hosted course site that personalizes learning using **on-device** attention
(blink rate) + emotion sensing. Monorepo (npm workspaces): `shared` (pure logic +
tests), `backend` (Express + better-sqlite3), `frontend` (React 18 + Vite + Tailwind).

**Privacy invariant (non-negotiable):** camera frames never leave the browser; only
derived numbers/labels (bpm, zone, emotion label, score) are sent to the server.

## Phase status

- [x] **Phase 0** — monorepo skeleton, workspaces, root scripts, existing app pulled
      into `frontend/`, `CONFIG`, health backend, build verified, PLAN/ASSUMPTIONS.
- [x] **Phase 1** — `shared/` complete + unit tests (config, zones, emotion, tick,
      engagement, curation, style, recommend, schemas). BPM warm-up fix lives in
      `buildTick` (no BPM until `MIN_OBSERVED_S_FOR_BPM` observed); wired into the UI in
      Phase 3. 71 tests passing.
- [x] **Phase 2** — backend: schema/migrations (idempotent, WAL + FKs), JWT auth w/ rate
      limit, all routes (profile/courses/lessons/sessions/insights), idempotent end-summary
      in a transaction, ownership checks, seed (3 courses × 3 lessons). 22 supertest tests.
- [x] **Phase 3** — frontend tracking layer: persistent `TrackingProvider` (above the
      router), `useTickStream`, swappable `EmotionProvider` (face-api, graceful degrade),
      `MockSignalSource` + scenario, virtual clock w/ time-scale, `/dev` console, face-api
      model copy on postinstall. Mock-pipeline test proves same code paths as camera.
- [x] **Phase 4** — auth infra (API client, AuthProvider, ProtectedRoute, Layout, Login,
      Register) + onboarding stepper (consent/camera·mock·no-camera → interests → baseline
      calibration → style probe → result), persisted via the real API. Design-token system
      established (accent ramp, type scale, buttons/inputs, focus rings, reduced-motion).
- [x] **Phase 5** — Home (recommended courses w/ reasons, continue-learning, profile chip), Course page (lessons + completion + served-style note), Profile (zones, style, editable interests, recalibrate, delete-my-data).
- [x] **Phase 6** — lesson player (useLessonSession: session lifecycle, per-tick engagement+curation+prompts, auto speed/slow w/ undo, break/replay/switch suggestions, tick batching+beacon flush), visual/practical variant bodies, collapsible HUD, feedback prompts, Summary (timeline w/ action markers, distributions), Insights (per-session + by-variant + distributions).
- [~] **Phase 7** — README (setup, architecture, formulas, config, mock mode, limitations,
      known limitations), `.env.example`, cleanup (removed unused Placeholder). **Pending:**
      the formal design-skill audit pass (Section 11A) — UI built to the written 11A bar.
- [~] **Phase 8** — automated verification done: full test suite (94), production build, and
      an in-process end-to-end API smoke (`npm run e2e`) all green. **Pending:** a manual
      browser walk of the camera path + a Playwright E2E (the API E2E stands in for it).

## Source of the existing frontend

The prompt expected to `git clone https://github.com/danwil245/blink-detection`. We
instead reused the **local updated copy** already present at
`../blink-detection-updated-main` (a strictly newer version that already contains a
calibration flow). Decision logged in `ASSUMPTIONS.md`. The required files were present:
`src/hooks/useFaceMesh.js` (EAR + blink state machine — internals preserved),
`src/hooks/useBlinkStats.js` (zones + the known BPM bug), charts, `AttentionBadge`,
`CameraFeed`, plus extra calibration files we will adapt.

## Repo layout (target)

```
edunext/
  package.json            # workspaces + dev/build/test/seed/migrate scripts
  README.md PLAN.md ASSUMPTIONS.md .env.example .gitignore
  shared/src/{config,zones,emotion,tick,engagement,curation,style,recommend,schemas,index}.js
  shared/test/*.test.js
  backend/src/{index,app,db,migrate,seed}.js
  backend/src/routes/{auth,profile,courses,sessions,insights}.js
  backend/src/middleware/{auth,error,validate}.js
  backend/src/content/{courses,calibrationClips}.js
  backend/test/*.test.js
  frontend/src/{main,App}.jsx, routes/, tracking/, pages/, components/, api/
  frontend/public/models/   # face-api weights (copied on install)
```

## Known bug to fix (Phase 1/3)

`useBlinkStats` sets `bpm = recentRef.current.length` over a 60s window, which
under-reports during the first 60s (learner wrongly shown "hyperfocused"). Replace with
`buildTick` logic: no BPM until `MIN_OBSERVED_S_FOR_BPM` of face time observed, then
`bpm = blinksInWindow * 60 / observedS`.

## Top risks

1. **Camera/FaceMesh remount on route change** → one persistent `TrackingProvider` at
   app root, above the router; never unmount the `<video>`.
2. **face-api bundling under Vite** → `EmotionProvider` interface so the model is
   swappable; copy weights to `public/models`; graceful degradation if load fails.
3. **better-sqlite3 native install** on Windows — uses prebuilt binaries; verify early.
4. **Idempotent `end`** and ownership checks server-side (no double-counting style stats).
5. **Autoplay policy** — lessons start on a click; calibration clips are muted.

## Design skills (per Section 11A)

Both found and will be used in Phases 3–7:
- Taste skill → **`design-taste-frontend`** (installed in `.agents/skills/`).
- Web design guidelines skill → **`web-design-guidelines`** (installed in `.agents/skills/`).
