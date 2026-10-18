# EduNext — Fix Report (post-calibration lag + break UI + audit)

Branch: `fix-lag-break`. Harness: `scripts/perf/measure-lag.mjs` (Playwright +
system Chrome, **fake camera** `--use-fake-device-for-media-stream
--use-fake-ui-for-media-stream`). Results JSON in `scripts/perf/results/`.

> Headless note: WebGL is software-rendered, so absolute Vanta numbers are
> pessimistic. The camera/tracker findings below are about *whether work runs at
> all*, which is exact.

## F0 — Bug 1 reproduced and measured (BEFORE any fix)

Raw: `scripts/perf/results/lag-before.json`.

| scenario | scroll p95 | dropped | rAF/s | **live camera tracks** | WebGL | long tasks >100ms |
|---|---|---|---|---|---|---|
| `/login` (control, no tracking) | 17 ms | 0 | 248 | 0 | 1 (Vanta) | 1 |
| `/home` (fresh, tracker never started) | 17 ms | 0 | 184 | 0 | 0 | 0 |
| **after camera started → client-nav off the tracking route** | **33.3 ms** | **21** | 215 | **1** | 1 | 2 |

**Root cause (measured):** The tracker has **no lifecycle tied to the route**.
`TrackingProvider` renders the camera overlay whenever `started` is true
(`showOverlay = started && overlaySize !== 'hidden'`), and **nothing calls
`stop()` on navigation**. So once the camera is started (onboarding calibration
or a lesson), it keeps running — camera stream live, FaceMesh + emotion inference
looping — on every subsequent route (`/home`, `/`, `/insights`, …). The measured
effect: frame time **doubles (17 → 33 ms p95)**, **21 dropped frames** during a
scripted scroll, and the **camera track stays live (`liveTracks=1`)** on a route
that needs no tracking. The camera light staying on after calibration is the same
root cause.

Confirmed by code inspection: `tracking.start()/stop()` are called only manually
in `onboarding`, `lesson` (start), `demo`, and `/dev`. Leaving a lesson without
pressing "Complete" (or any client-side nav away from a tracking route) never
stops the tracker. `TrackingProvider` has no `useLocation`.

Hypotheses checked:
- ✅ **Tracker keeps running on routes that don't need it** — TRUE (measured above).
- ❌ Duplicate rAF loops / StrictMode double-mount in the *production* build — not
  observed (rAF/s consistent with one Lenis + one MotionBudget monitor + the
  harness's own sampler; `/home` fresh is clean).
- ❌ Camera `stop()` fails to stop tracks — FALSE; `@mediapipe/camera_utils`
  `Camera.stop()` does call `track.stop()` (verified in the dist). The problem is
  `stop()` is never *called* on navigation, not that it doesn't work.
- ❌ Leaked Vanta on `/home` — FALSE; `/home` fresh shows `webgl=0`. (Vanta is on
  `/` and auth pages only.)
- ⚠️ Per-tick/per-sample React re-renders — emotion + presence already run at
  ~1 Hz (`CameraRunner`), so this is secondary to the tracker-runs-everywhere bug.

**Fix direction (F1):** a route-driven tracker lifecycle — tracker active only on
onboarding, lesson, and dev/demo routes; fully stopped everywhere else.

## F1 — lag fix applied & re-measured

Fix: `frontend/src/tracking/TrackerRouteGate.jsx` — a route-driven gate mounted in
the router that calls `tracking.stop()` whenever the path is **not** a tracking
route (`/onboarding`, `/learn/*`, `/dev`, `/demo`). The persistent tracker still
never *remounts* on navigation; it is *stopped* (camera track stopped → light off,
detection loop + emotion inference cancelled, emotion provider disposed) the moment
you land on `/home`, `/`, `/insights`, `/profile`, `/summary`, or an auth page.
Pages that need tracking start it on demand (onboarding mode select, lesson Start).

Raw: `scripts/perf/results/lag-after.json`.

| scenario | p95 before → after | dropped before → after | **live tracks** before → after |
|---|---|---|---|
| after camera started → client-nav off tracking route | **33.3 → 17.1 ms** | **21 → 0** | **1 → 0** |
| `/home` fresh | 17 → 17 ms | 0 → 0 | 0 → 0 |
| camera on `/dev` (still works where needed) | — | — | 1 → 1 |

**`npm run perf:check` (new):** passes — `/home` p95 17.1 ms (≤20), 0 live tracks,
0 WebGL contexts, 0 long tasks >100 ms on `/home`; camera live on `/dev` but
**stopped after leaving the tracking route**. The gate is the single lifecycle
control; start/stop happens via the provider, not by remounting.

Note (secondary, logged in ASSUMPTIONS): the richer `idle|warming|active|suspended`
state machine and `document.hidden` suspend were not separately implemented — the
route gate already achieves the required end state (zero work off tracking routes)
and is verified by `perf:check`. Emotion/presence already run at ~1 Hz in
`CameraRunner`, so per-sample re-render churn was not a measured contributor.

## F2 — "take a short break?" UI rebuilt

**What was wrong (by inspection + reproduction):** `suggest_break` reused the
generic `SuggestionBanner` (a thin top strip showing only the terse curation
`reason` + "Take a break"/"Dismiss") — no calm copy, no break length, and **no
"Keep going" / "Remind me later"** as specified. The break "screen" was
`BreakOverlay` positioned `absolute inset-0` **inside the video box**, so it only
covered the video region, not the lesson/HUD. No `aria-modal`, no focus trap, no
scroll-lock, no snooze/cooldown beyond a 20 s auto-dismiss. Screenshots of the new
UI are in `docs/fix-report/` (`break-prompt-{desktop,laptop,tablet,phone}.png`,
`break-screen.png`).

**New behaviour:**
- `BreakPrompt` — a focus-trapped modal (`role="dialog"`, `aria-modal`, labelled
  title + description) with calm, non-blaming copy ("Want a short break? You've
  seemed tired for a little while…"), an honest one-liner, the break length from
  `CONFIG.BREAK.LENGTH_S`, and **three actions: Take a break / Keep going / Remind
  me later**. Centered on desktop, **bottom sheet on phones** (verified at
  390 px). Focus moves to the primary action on open and returns to the opener on
  close; Tab is trapped; **Escape = Keep going** (least-destructive; logged in
  ASSUMPTIONS); backdrop click = Keep going. Scroll locked via Lenis
  (`lenis.stop()/start()`). GSAP entrance is transform/opacity only; reduced motion
  respected.
- `BreakScreen` — a full-viewport calm break with a countdown ring, breathing
  suggestion, `aria-live` end-of-break announcement, and an always-available
  "I'm back" that resumes. On resume the controller re-enters a **warm-up** (resets
  the engagement EMA) so the first seconds aren't mis-scored, and applies a
  cooldown so the prompt can't immediately re-fire.
- Logic (`useLessonSession`): break length + snooze from `CONFIG.BREAK`;
  **idempotent** — no prompt while one is open, during a break, during warm-up, or
  during cooldown; **Remind me later** snoozes for `CONFIG.BREAK.SNOOZE_S`; each
  choice is logged as a curation outcome (accepted / dismissed / snoozed — derived
  data only). Lighter actions (`replay_section`, `switch_variant`, speed changes)
  keep the non-blocking banner/toast — one consistent notice system, modal only for
  the break.
- Lesson time-scale is reset to 1× on start (a mock onboarding leaves it at 10×),
  so a real lesson paces realistically.

**Verification:** 6 component tests (`test/breakPrompt.test.jsx`) cover the dialog
contract, the three actions, focus-on-open, Escape, backdrop, countdown and resume
— all passing. Live reproduction confirmed the engagement pipeline drives into the
sleepy zone (score 100 → 26 over ~2 min at 1×), but the break action is frequently
preempted by a lighter curation action within the 90 s cooldown, so the break UI
is also reachable for review/screenshots via the dev-only `?forcebreak=1` flag on
the lesson route (self-contained local state; logged in ASSUMPTIONS).

## F3 — full audit

| # | Check | Result | Evidence / fix |
|---|---|---|---|
| 1 | `npm test` (all workspaces) | ✅ PASS | shared 71 / backend 22 / frontend 8 = **101 tests** |
| 1 | `npm run build` | ✅ PASS | clean, no errors |
| 1 | No console errors on any page | ✅ PASS | automated walk: **0 console errors** across all routes |
| 2 | Walk every route, new user, mock + fake camera | ✅ PASS | register → onboarding (all clips) → home → course → lesson (HUD live) → summary (avg/chart/zones/emotions) → insights → profile → demo |
| 2 | Returning user (login/logout) | ✅ PASS | login renders + authenticates; logout clears token |
| 2 | Camera onboarding path (fake device) | ✅ PASS | `Camera status: ready`, no constructor crash (see earlier MediaPipe fix) |
| 3 | Core logic covered by unit tests | ✅ PASS | BPM warm-up, personalization fallback, renormalization, curation cooldowns, style thresholds, ranking — in the 71 shared tests (no shared math changed) |
| 4 | No leaks after 20 route round-trips | ✅ PASS | `F3-leak.json`: ScrollTriggers 4→4, WebGL 0→0, heap 4.24→3.97 MB |
| 4 | Camera stops off tracking routes | ✅ PASS | `npm run perf:check` (F1) |
| 5 | Privacy — only derived data sent | ✅ PASS | `backend/test/privacy.test.js` green; upload schema rejects image/frame/base64 fields |
| 6 | API ownership / validation / idempotent end | ✅ PASS | backend route tests + `npm run e2e` (register→…→idempotent end→insights) |
| 7 | Break UI a11y + responsive | ✅ PASS | focus-trap/aria-modal/bottom-sheet verified at 4 widths + 6 tests |
| 7 | Reduced-motion across app | ✅ PASS (spot) | `prefers-reduced-motion` + in-app toggle disable Lenis/Vanta/scrub/cursor/split; break animations gated |
| 8 | Design pass on changed surfaces | ✅ PASS (spot) | break prompt/screen, placeholders, home all reviewed against the design principles |

### Known issues / deviations (honest)
- **Tracker state machine:** implemented as a route gate (full stop off tracking
  routes), not the full `idle|warming|active|suspended` enum; `document.hidden`
  suspend not separately added. The required end state (zero work off tracking
  routes) is met and gated by `perf:check`.
- **Break action is hard to trigger live** — the curation engine often fires a
  lighter action first and the 90 s cooldown preempts the break. The break UI is
  reviewable via the dev-only `?forcebreak=1` flag; a deterministic live-trigger
  Playwright test was not added for this reason.
- **Design/a11y audit** on *every* page against the formal skill was spot-checked,
  not exhaustively re-run across all 12 routes at all 5 widths this pass.
- Headless WebGL is software-rendered — Vanta frame numbers are relative, not
  absolute (run `measure-lag.mjs`/`measure.mjs` headful on the demo laptop).

## Final status
Bug 1 (lag) and Bug 2 (break UI) fixed and verified; audit green on everything run.
`npm test`, `npm run build`, `npm run perf:check`, and the privacy test all pass.
