# EduNext — Claude Code Build Prompt

## Before you paste this

1. Create an empty folder, e.g. `edunext/`, and `cd` into it.
2. Run `claude` in `edunext/`, then paste everything below the line `===== PROMPT STARTS =====`.

That's it. Claude Code fetches your blink-detection repo itself (Section 2), so there is no manual file moving.

**Optional (recommended):** have your **taste skill** and **web design guidelines skill** installed in Claude Code (`~/.claude/skills/` or the project's `.claude/skills/`) before pasting. The prompt tells Claude Code to use them during every UI phase, and to fall back to the written principles in Section 11A if they are not found.

===== PROMPT STARTS =====`.

===== PROMPT STARTS =====

# ROLE AND MISSION

You are building **EduNext**, a standalone, self-hosted course website that personalizes learning using on-device attention and emotion sensing. Build it end to end: backend, frontend, shared logic, seeded placeholder content, tests, and docs. The result must run locally with one command and demo the entire flow.

This is a university project (SSN, AI & Education Technology, Review I). Correctness and an honest, demoable, end-to-end flow matter more than breadth or visual flash.

# WORKING RULES (follow strictly)

1. **Plan first.** Before writing code, complete Phase 0 (get the existing blink-detection code into `frontend/`, Section 2), read it fully, then write `PLAN.md` (phases, file list, risks). Then proceed without waiting for approval.
2. **Do not ask me questions unless truly blocked.** Where something is unspecified, choose the most sensible default, and log it in `ASSUMPTIONS.md` (decision + one-line reason).
3. **Work in phases** (Section 16). After each phase: run tests and the build, fix failures, commit with a clear message. Never leave a phase red.
4. **No fake completeness.** No stubbed functions, TODO-only files, or mock data pretending to be real, except the *course content*, which is intentionally placeholder (Section 12). Anything not truly implemented must be listed under "Known limitations" in the README.
5. **Pure logic goes in `shared/` and is unit-tested.** UI and API call into it. Do not duplicate formulas anywhere.
6. **Privacy invariant (non-negotiable):** camera frames and video never leave the browser. Only derived numbers and labels (bpm, zone, emotion label, score) are sent to the server. Add a test that asserts the tick/upload payload schema contains no image/blob/base64 fields.
7. **Keep it JavaScript (ESM) with JSDoc types**, matching the existing repo. No TypeScript migration.
8. **Do not rewrite** `frontend/src/hooks/useFaceMesh.js` internals (EAR + blink state machine). You may wrap or extend it as described in Section 9.
10. **Use the design skills for all UI work** (Section 11A). Before building or restyling any page or component, load the taste skill and the web design guidelines skill and follow them. Record in `ASSUMPTIONS.md` which skills you found and used.
9. Be honest in UI copy and docs about what the system infers (see Section 17).

# 1. PRODUCT CONTEXT

EduNext hosts its own courses (not a MOOC, no EEG). Its core idea: **blink rate differs per person**, so instead of one universal threshold, EduNext builds a **personal baseline per learner**, then uses that personal model to read engagement during lessons and to adapt what the learner sees.

Three live signals feed an **engagement score**:
- **Blink rate** (built already: MediaPipe FaceMesh EAR, rolling BPM, 5 zones: hyperfocused / attentive / neutral / fatigued / sleepy).
- **Emotion** (to build: in-browser facial expression model, mapped to engaged / neutral / confused / frustrated / bored).
- **User feedback** (to build: short in-lesson prompts: thumbs, difficulty, "still with us?").

The score drives **adaptive curation** (pace, break suggestions, replay, switching content style) and a **learning-style profile** (`visual` vs `practical`) that drives **course recommendation** and which lesson variant is served (visual-style vs hands-on-style).

## End-to-end user flow

1. Register / log in.
2. **Onboarding:** (a) consent + camera permission, (b) pick interest topic(s), (c) **baseline calibration**: watch one clip on the chosen interest topic and one neutral/uninteresting clip while blink + emotion are measured, which yields personalized blink zones and a personal emotion baseline, (d) **style probe**: watch one visual-style and one hands-on-style clip on the *same* neutral topic, which yields an initial learning-style estimate, (e) result screen showing their personal profile.
3. **Home:** recommended courses (with "why recommended"), continue-learning.
4. **Course page → Lesson player:** the lesson is served in the learner's preferred variant (with a small exploration rate). Camera runs in a small corner overlay; live engagement HUD; adaptive actions and feedback prompts appear non-intrusively.
5. **Session summary** after each lesson; learning-style estimate and history refine over time.
6. **Insights page:** engagement history charts. **Profile page:** baseline, style, recalibrate.

# 2. EXISTING CODE (fetch it yourself, then adapt)

**Step 0, do this first, no questions:** the blink-detection app lives at `https://github.com/danwil245/blink-detection`. Clone it into a temp folder (`git clone https://github.com/danwil245/blink-detection .tmp-blink`), copy its contents (excluding `.git`, `node_modules`, `dist`) into `frontend/`, then delete the temp folder. If the clone fails (private repo, no network, auth), do NOT stop: scaffold `frontend/` from scratch as a Vite + React 18 + Tailwind 3 + Recharts app and implement the blink hooks below per this spec, and log it in `ASSUMPTIONS.md`.

The cloned repo is a working Vite + React 18 + Tailwind 3 + Recharts blink-rate analyzer. It is the **original version, with no calibration**. Expect roughly:
- `src/hooks/useFaceMesh.js`: webcam + MediaPipe FaceMesh, EAR with 3-frame smoothing, threshold 0.21, blink state machine, `onBlink({t, duration})`, `liveRef`, `faceDetected`, `status`. **Keep these internals.**
- `src/hooks/useBlinkStats.js`: zones, `categorize(bpm)`, 60s rolling window, 5s ticks, session stats. Boundaries are fixed here; you will make them per-user (Sections 8.1 and 9).
- `src/App.jsx`, charts (`BpmChart`, `TimelineChart`, `DurationChart`, `SessionStats`), `AttentionBadge`, `CameraFeed`.

**Calibration does not exist in the clone.** Build it fresh per Sections 8.1 and 11 (default zone boundaries `[8,15,21,31]`; `personalizeBoundaries({engagedBpm, neutralBpm})` is a two-point linear rescale mapping the engaged and neutral reads onto anchors 11.5 and 18, falling back to defaults if the two reads are within 2 BPM or non-finite). Use the repo's existing hooks and components where they fit; otherwise replace them.

If the repo's file layout differs from the above, adapt and note it in `PLAN.md`.

**Known bug to fix:** `useBlinkStats` computes `bpm = recentRef.current.length` over a 60s window, which **under-reports for the first 60 seconds** (a learner is wrongly shown as "hyperfocused"). Fix per Section 9.3.

# 3. REPO LAYOUT (npm workspaces monorepo)

```
edunext/
  package.json            # workspaces: shared, backend, frontend; scripts below
  README.md  PLAN.md  ASSUMPTIONS.md
  shared/                 # pure JS ESM logic + tests (vitest)
    src/config.js
    src/zones.js          # zones, categorize, personalizeBoundaries (moved from useBlinkStats)
    src/emotion.js        # probs -> label mapping, baseline subtraction
    src/tick.js           # buildTick (pure)
    src/engagement.js     # computeEngagement (pure)
    src/curation.js       # evaluateCuration (pure state machine)
    src/style.js          # learning style detection/update
    src/recommend.js      # course ranking
    src/schemas.js        # zod schemas for API payloads
    src/index.js
    test/*.test.js
  backend/                # Express + better-sqlite3
    src/index.js app.js db.js migrate.js seed.js
    src/routes/{auth,profile,courses,sessions,insights}.js
    src/middleware/{auth,error,validate}.js
    src/content/courses.js          # placeholder course content (Section 12)
    test/*.test.js        # supertest
  frontend/               # existing app, restructured
    src/{main.jsx,App.jsx,routes/...}
    src/tracking/         # TrackingProvider, signal sources, emotion provider
    src/pages/            # Login, Register, Onboarding, Home, Course, Lesson, Summary, Insights, Profile, Dev
    src/components/       # reuse existing charts/HUD + new
    src/api/client.js
    public/models/        # face-api model weights (copied, see 9.4)
```

Root scripts: `dev` (backend + frontend via `concurrently`), `build`, `test` (all workspaces), `seed`, `lint` (optional). Frontend dev server proxies `/api` to the backend (`vite.config.js`). Backend port 4000, frontend 5173.

# 4. TECH STACK (fixed choices)

- Frontend: React 18, Vite 5, Tailwind 3, React Router 6, Recharts (existing). Keep the existing glassmorphism look; reuse `.glass` / `.glass-strong`.
- Backend: Node 20+, Express 4, `better-sqlite3`, `bcryptjs` (pure JS to avoid native build issues), `jsonwebtoken`, `zod`, `cors`, `helmet`.
- Tests: `vitest` (shared + frontend pure logic), `supertest` (backend).
- Emotion: `@vladmandic/face-api` (in-browser, pretrained TinyFaceDetector + FaceExpressionNet). **Fallback:** if bundling it with Vite proves unworkable after a genuine attempt, load its prebuilt browser bundle from `public/vendor/` via a script tag/dynamic import. The code must go through the `EmotionProvider` interface (Section 9.4) so the model is swappable.
- Auth: JWT (7 days) sent as `Authorization: Bearer`; token in `localStorage` (this is a regular web app; storage is fine).
- Dev-only `JWT_SECRET` default allowed with a console warning; production start must require it.

# 5. DATA MODEL (SQLite; write migrations in `backend/src/migrate.js`, idempotent)

```sql
users(id INTEGER PK, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);

profiles(user_id INTEGER PK REFERENCES users(id),
  interests TEXT NOT NULL DEFAULT '[]',              -- JSON array of topic slugs
  onboarding_complete INTEGER NOT NULL DEFAULT 0,
  calibration TEXT,                                  -- JSON, see below
  learning_style TEXT NOT NULL DEFAULT 'unknown',    -- 'visual'|'practical'|'balanced'|'unknown'
  style_confidence REAL NOT NULL DEFAULT 0,          -- 0..1
  style_stats TEXT NOT NULL DEFAULT '{"visual":{"sum":0,"w":0},"practical":{"sum":0,"w":0}}',
  updated_at TEXT NOT NULL);

-- calibration JSON:
-- { engagedBpm, neutralBpm, boundaries:[b0,b1,b2,b3], personalized:boolean,
--   emotionBaseline:{ engagedClip:{neutral,happy,sad,angry,fearful,disgusted,surprised},
--                     neutralClip:{...} } | null,
--   clipSeconds, completedAt, sourceQuality:{blinksEngaged, blinksNeutral, faceSecondsEngaged, faceSecondsNeutral} }

courses(id INTEGER PK, slug TEXT UNIQUE, title TEXT, topic TEXT, description TEXT, level TEXT, practical_ratio REAL); -- 0=all visual, 1=all hands-on
lessons(id INTEGER PK, course_id INTEGER REFERENCES courses(id), position INTEGER, title TEXT, duration_s INTEGER,
        visual TEXT NOT NULL, practical TEXT NOT NULL);  -- JSON variant payloads, see Section 12

enrollments(user_id, course_id, started_at, PRIMARY KEY(user_id, course_id));
lesson_progress(user_id, lesson_id, completed_at, PRIMARY KEY(user_id, lesson_id));

sessions(id INTEGER PK, user_id, lesson_id, variant TEXT CHECK(variant IN ('visual','practical')),
         started_at TEXT, ended_at TEXT, valid_seconds INTEGER DEFAULT 0, avg_score REAL, summary TEXT);
ticks(id INTEGER PK, session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
      t INTEGER NOT NULL,            -- ms since session start
      bpm REAL, zone TEXT, emotion TEXT, score REAL, face_detected INTEGER NOT NULL, observed_s REAL);
feedback_events(id INTEGER PK, session_id, t INTEGER, kind TEXT, value TEXT);
curation_events(id INTEGER PK, session_id, t INTEGER, action TEXT, reason TEXT, outcome TEXT); -- outcome: auto|accepted|dismissed
```

Add indexes on `ticks(session_id)`, `sessions(user_id)`, `lessons(course_id, position)`. Enable `PRAGMA foreign_keys = ON` and WAL.

# 6. API (all JSON; validate every body with zod from `shared/src/schemas.js`; consistent error shape `{error:{code,message}}`)

| Method & path | Auth | Purpose |
|---|---|---|
| POST `/api/auth/register` `{email,name,password(min 8)}` | no | create user + empty profile; returns `{token,user}` |
| POST `/api/auth/login` | no | returns `{token,user}`; generic error on failure (no user enumeration) |
| GET `/api/me` | yes | user + profile |
| DELETE `/api/me` | yes | delete the user and all their rows (delete-my-data) |
| PUT `/api/profile/interests` `{interests:[slug]}` | yes | validate slugs against known topics (1–2 allowed) |
| PUT `/api/profile/calibration` `{calibration, styleProbe:{visual:{meanScore,seconds}, practical:{meanScore,seconds}}|null}` | yes | store calibration; run `shared/style` to set initial style; set `onboarding_complete=1` |
| DELETE `/api/profile/calibration` | yes | reset (recalibrate) |
| GET `/api/courses` | yes | ranked list from `shared/recommend` with `reasons[]` |
| GET `/api/courses/:slug` | yes | course + lessons (without variant bodies) + user's progress |
| GET `/api/lessons/:id` | yes | lesson with **both variant bodies** + `servedVariant` chosen by server using `shared/style` (incl. exploration), so the client doesn't decide |
| POST `/api/sessions` `{lessonId}` | yes | creates session, returns `{sessionId, variant}` |
| POST `/api/sessions/:id/ticks` `{ticks:[...]}` | yes | batched ticks (max 200 per call), owner-checked |
| POST `/api/sessions/:id/feedback` `{t,kind,value}` | yes | store feedback |
| POST `/api/sessions/:id/curation` `{t,action,reason,outcome}` | yes | log curation events |
| POST `/api/sessions/:id/end` `{completed:boolean}` | yes | computes summary server-side from ticks (idempotent), updates `style_stats`/`learning_style`, marks lesson progress if completed; returns summary |
| GET `/api/insights` | yes | per-session score series, zone/emotion distributions, style-by-variant means |
| GET `/api/health` | no | `{ok:true}` |

Enforce ownership on every session/profile route. Rate-limit auth routes lightly (simple in-memory limiter is fine). `cors` allows only the dev origin by default (env-configurable). Never log passwords or tokens.

# 7. CONFIG (`shared/src/config.js`; one frozen object, imported everywhere; no magic numbers elsewhere)

```js
export const CONFIG = Object.freeze({
  TICK_MS: 5000,
  BLINK_WINDOW_MS: 60000,
  MIN_OBSERVED_S_FOR_BPM: 20,        // warm-up: no BPM until this much face time observed
  CALIBRATION_CLIP_S: 45,
  STYLE_PROBE_CLIP_S: 20,
  EMOTION_SAMPLE_MS: 1000,           // emotion inference at ~1 Hz
  EMOTION_SMOOTH_N: 5,
  EMOTION_THRESH: 0.35,
  WEIGHTS: { blink: 0.45, emotion: 0.35, feedback: 0.20 },
  EMA_ALPHA: 0.35,
  FEEDBACK_FRESH_S: 180,
  SCORE_LEVELS: { high: 70, low: 40 },
  BLINK_SCORE: { hyperfocused: 85, attentive: 100, neutral: 65, fatigued: 30, sleepy: 10 },
  EMOTION_SCORE: { engaged: 100, neutral: 60, confused: 45, frustrated: 25, bored: 20 },
  FEEDBACK_SCORE: { thumbs_up: 100, thumbs_down: 15, too_easy: 55, just_right: 100, too_hard: 30, still_here_yes: 80, still_here_no: 20 },
  CURATION: {
    WARMUP_S: 60, COOLDOWN_S: 90,
    BREAK_TICKS: 6, REPLAY_TICKS: 4, SWITCH_TICKS: 8, SLOWDOWN_TICKS: 6, SPEEDUP_TICKS: 12,
    SPEEDUP_SCORE: 80, SLOWDOWN_SCORE: 50, SWITCH_SCORE: 40,
    RATE_MIN: 0.75, RATE_MAX: 1.5, RATE_STEP: 0.25, REPLAY_BACK_S: 30, REPLAY_RATE: 0.85,
  },
  FEEDBACK_PROMPTS: { MAX_PER_LESSON: 3, MIN_GAP_S: 120 },
  STYLE: { PROBE_WEIGHT: 3, LESSON_WEIGHT: 1, MIN_LESSON_VALID_S: 90, BALANCED_MARGIN: 5,
           CONF_DIFF_SCALE: 25, CONF_WEIGHT_SCALE: 6, EXPLORE_RATE: 0.15, LOW_CONF: 0.6 },
  RECOMMEND: { W_INTEREST: 0.45, W_STYLE: 0.30, W_HISTORY: 0.15, IN_PROGRESS_BOOST: 0.15 },
});
```
Everything above is tunable but must be **used from CONFIG**, never hardcoded.

# 8. CORE LOGIC (pure functions in `shared/`, each with thorough unit tests incl. edge cases)

## 8.1 `zones.js`
Move `ATTENTION_ZONES`, `DEFAULT_BOUNDARIES`, `categorize(bpm, boundaries)`, `personalizeBoundaries(...)` here from `useBlinkStats.js` (keep behavior identical; frontend re-exports/imports from shared). Tests: boundary edges, monotonic ordering guarantee, fallback when reads are < 2 BPM apart or non-finite, inverted reads (engaged > neutral) must **not** produce inverted boundaries (fall back to defaults and set `personalized:false`).

## 8.2 `emotion.js`
Input: 7-class probabilities `{neutral,happy,sad,angry,fearful,disgusted,surprised}`.
- `subtractBaseline(probs, neutralBaseline)`: `max(0, p_i - baseline_i)` per class, then renormalize if sum>0 (if sum is ~0 return all-neutral).
- `labelFromProbs(probs)`: after baseline subtraction, with `T = EMOTION_THRESH`, evaluate groups and pick the **largest group mass above T**:
  - engaged = happy
  - frustrated = angry + disgusted
  - confused = fearful + surprised
  - bored = sad
  - otherwise `neutral`.
- `smoothLabels(labels, N)`: mode of the last N labels; ties resolved by most recent.
This is a deliberately simple heuristic (document it honestly, Section 17).

## 8.3 `tick.js`: `buildTick(input) -> Tick`
Inputs: `{ now, blinkTimestamps[], presenceStamps[] (1 Hz face-present timestamps), emotionSamples[] ({t, probs}), boundaries, emotionBaseline|null, prevEmotionLabels[] }`.
- Window = last `BLINK_WINDOW_MS`. `observedS` = number of presence stamps in window (1 stamp ≈ 1 s of face presence).
- If `observedS < MIN_OBSERVED_S_FOR_BPM` → `bpm = null, zone = null` (warming up). Else `bpm = blinksInWindow * 60 / observedS`, `zone = categorize(bpm, boundaries)`.
- Emotion: take samples in the last `TICK_MS`, baseline-subtract (if baseline present), label each, `smoothLabels` over recent labels → `emotion` (null if no samples).
- `faceDetected` = any presence in the last 3 s.
- Returns `{ t:now, bpm, zone, emotion, faceDetected, observedS }`.
Tests: warm-up returns null; face loss reduces observedS and BPM scales correctly; known blink counts give exact BPM; empty emotion samples → null.

## 8.4 `engagement.js`: `computeEngagement(state, tick, feedbackEvents, now) -> {score, level, components, state}`
- Components (0–100): `blink = BLINK_SCORE[zone]` (null if zone null), `emotion = EMOTION_SCORE[emotion]` (null if null), `feedback = FEEDBACK_SCORE[...]` from the **most recent** feedback event within `FEEDBACK_FRESH_S` (null otherwise).
- Weighted mean over **available** components with weights renormalized to sum to 1. If none available or `faceDetected=false` and no fresh feedback → `score = null` (state unchanged).
- Smooth: `ema = alpha*raw + (1-alpha)*prevEma` (first value = raw). `level` = high (≥70) / medium / low (<40).
Tests: renormalization, missing components, EMA behavior, face-lost → null, feedback expiry.

## 8.5 `curation.js`: `evaluateCuration(state, tickInfo, ctx) -> { action|null, state }`
Deterministic state machine. `ctx = { elapsedS, currentRate, variant, preferredStyle, switchedAlready, now }`. `state` keeps consecutive-tick counters (low score, fatigued zone, confused/frustrated emotion, high score) and `lastActionAt`.
Rules, evaluated in **priority order**, at most one action per tick, none before `WARMUP_S`, none within `COOLDOWN_S` of the last action, counters reset when their condition breaks:
1. `suggest_break`: zone ∈ {fatigued, sleepy} for ≥ `BREAK_TICKS` consecutive ticks.
2. `replay_section`: emotion ∈ {confused, frustrated} for ≥ `REPLAY_TICKS` consecutive ticks → payload `{seekBackS: REPLAY_BACK_S, rate: REPLAY_RATE}`.
3. `switch_variant`: score < `SWITCH_SCORE` for ≥ `SWITCH_TICKS` consecutive ticks and `!switchedAlready` → payload `{to: otherVariant}`.
4. `slow_down`: rate > `RATE_MIN` and score < `SLOWDOWN_SCORE` for ≥ `SLOWDOWN_TICKS` ticks → `{rate: max(RATE_MIN, rate - RATE_STEP)}`.
5. `speed_up`: rate < `RATE_MAX` and score ≥ `SPEEDUP_SCORE` for ≥ `SPEEDUP_TICKS` ticks → `{rate: min(RATE_MAX, rate + RATE_STEP)}`.
Each action includes a human-readable `reason` (e.g. "Your blink rate suggests fatigue for the last 30s"). Tests: priority ordering, cooldown, warm-up, counter resets, rate clamping, no action when score is null.

Also export `shouldPromptFeedback(state, ctx)`: prompts at ~50% of lesson duration (thumbs), at the end (thumbs + difficulty), and a `still_here` check when score < `SWITCH_SCORE` for 6 ticks; honor `MAX_PER_LESSON` and `MIN_GAP_S`.

## 8.6 `style.js`
- `stats = {visual:{sum,w}, practical:{sum,w}}` (weighted sums of mean engagement).
- `addProbe(stats, {visual:{meanScore}, practical:{meanScore}})` adds each with weight `PROBE_WEIGHT`.
- `addSession(stats, variant, meanScore, validSeconds)` adds weight `LESSON_WEIGHT` **only if** `validSeconds ≥ MIN_LESSON_VALID_S`.
- `detectStyle(stats)` → `{style, confidence}`: need weight > 0 on **both** variants, else `unknown`. `diff = meanVisual - meanPractical`; `|diff| < BALANCED_MARGIN` → `balanced`; else the larger mean wins. `confidence = min(1, |diff|/CONF_DIFF_SCALE) * min(1, totalW/CONF_WEIGHT_SCALE)` (balanced gets confidence by the same weight term only).
- `chooseVariant(style, confidence, rng)`: `visual`/`practical` → that variant, but with probability `EXPLORE_RATE` serve the other (only if `confidence ≥ LOW_CONF`; if confidence < `LOW_CONF` or style is `balanced`/`unknown`, alternate 50/50). `rng` is injected for deterministic tests.
Tests incl. weighting, thresholds, unknown handling, exploration with seeded rng.

## 8.7 `recommend.js`
`rankCourses({courses, interests, style, styleConfidence, sessionsByTopic, progressByCourse})` → sorted `[{course, score, reasons[]}]`:
- `interest` = 1 if `course.topic ∈ interests`, else adjacency value from a small topic-adjacency table (0.3 for related topics, 0 otherwise).
- `stylePref` = 1 (practical) / 0 (visual) / 0.5 (balanced/unknown), blended toward 0.5 by `(1 - confidence)`; `styleMatch = 1 - |course.practicalRatio - stylePref|`.
- `history` = mean engagement/100 of the user's past sessions in that topic (default 0.5).
- `score = W_INTEREST*interest + W_STYLE*styleMatch + W_HISTORY*history + (inProgress ? IN_PROGRESS_BOOST : 0)`.
- `reasons`: plain-language strings (e.g. "Matches your interest in Web Development", "Hands-on heavy, which suits your practical learning style", "You engaged well with similar lessons").
Tests: ordering, ties stable, reasons present, unknown style handled.

# 9. CLIENT-SIDE TRACKING LAYER (`frontend/src/tracking/`)

## 9.1 One persistent tracker
Create `TrackingProvider` mounted **once at the app root**, above the router, owning the `<video>` + FaceMesh + (optionally) emotion model. It exposes a context: `{ status: 'idle'|'loading'|'ready'|'denied'|'error', faceDetected, start(), stop(), subscribe(cb), liveRef, source: 'camera'|'mock' }`. **The camera stream and FaceMesh must never be unmounted/re-initialized on route changes** (this was a real bug risk: remounting silently kills the stream). Render the camera preview as a small fixed corner overlay with a "video stays on your device" badge; in lessons it is shown small, in onboarding slightly larger.

## 9.2 Sample stream and tick builder
The tracker emits raw samples to subscribers: `blink {t, duration}`, `presence {t}` at 1 Hz when a face is present, `emotion {t, probs}` at ~1 Hz. A `useTickStream({boundaries, emotionBaseline})` hook accumulates them in refs and calls `buildTick` every `TICK_MS`, yielding `Tick` objects to consumers (lesson player, onboarding). Pruning of old samples is required (no unbounded growth).

## 9.3 BPM warm-up fix
Replace `bpm = count in 60s window` with the `buildTick` logic (Section 8.3). Update the existing dashboard/HUD to show "Calibrating… (Ns)" instead of a BPM while `bpm === null`. Update `useBlinkStats` (or retire it in favor of `buildTick`) so no UI can display a falsely low BPM in the first minute.

## 9.4 Emotion provider
Define `EmotionProvider { init(): Promise<void>; infer(videoEl): Promise<probs|null>; dispose() }`.
- `FaceApiEmotionProvider`: `@vladmandic/face-api` with TinyFaceDetector + FaceExpressionNet. The package ships model weights in `node_modules/@vladmandic/face-api/model/`; copy the needed files to `frontend/public/models/` via a postinstall/copy script and load from `/models`. Prefer the WebGL backend, fall back to CPU. Run inference at `EMOTION_SAMPLE_MS` (~1 Hz) on the shared video element, **not** every frame (FaceMesh already runs per frame; do not double the load). If inference is slower than the interval, skip rather than queue.
- `MockEmotionProvider` for mock mode.
- If the model fails to load: the system must **degrade gracefully** to blink + feedback only, with a visible notice; never crash.

## 9.5 Mock signal source (essential for testing and for the live demo)
Implement `MockSignalSource` behind the same context API, enabled by `VITE_MOCK_SIGNALS=1` or a toggle on the `/dev` page. It emits synthetic blinks/emotions following a scripted scenario (engaged → drifting → confused → fatigued → recovering), with an adjustable time-scale (e.g. 1x/5x/10x) so a presenter can show adaptive curation firing within ~2 minutes without a webcam. The mock must go through the **same** `buildTick`/engagement/curation code paths as the real camera (no shortcuts).

## 9.6 Permissions and failures
Camera denied/unavailable: show a clear screen explaining what is lost, and allow continuing in **"no-camera mode"** (feedback-only engagement, `personalized:false` calibration, default zones). Face lost > 3 s: pause scoring, show a gentle "we can't see you" hint, and do not count that time toward valid seconds.

# 10. LESSON SESSION CONTROLLER (`frontend/src/pages/Lesson/`)

A `useLessonSession` hook orchestrates: create session → subscribe to ticks → per tick compute engagement (`computeEngagement`) → run `evaluateCuration` and `shouldPromptFeedback` → apply actions → buffer ticks and flush to the API every ~15 s (and on pause/end; use `navigator.sendBeacon`/`fetch keepalive` on page unload) → end session and navigate to the summary.
- **Auto-applied** (with a toast and Undo): `speed_up`, `slow_down` (set `video.playbackRate`).
- **Suggestions requiring a click** (non-blocking banner, auto-dismiss after ~20 s, logged as accepted/dismissed): `suggest_break` (pauses video, shows a 2-minute break timer with Resume), `replay_section` (seek back and set rate), `switch_variant` (swap to the other variant, preserving approximate position/lesson, only once per lesson).
- Log every action to `/curation` with its outcome.
- Respect autoplay policy: the lesson starts with an explicit **Start lesson** button click (user gesture), so audio can play.
- The video element must handle load errors with a retry/fallback message (placeholder videos are external URLs).
- Engagement HUD (collapsible, default visible during Review I): current zone, emotion, score gauge, and a "Why did this change?" line for the last action.

# 11. FRONTEND PAGES AND UX

Routes: `/login`, `/register`, `/onboarding`, `/home`, `/courses/:slug`, `/learn/:lessonId`, `/summary/:sessionId`, `/insights`, `/profile`, `/dev` (shown in the nav only when mock mode is on or `import.meta.env.DEV`). Protected routes redirect to login; users with `onboarding_complete=0` are redirected to `/onboarding`. Keep the existing dark glass design language, refined per Section 11A; clean, readable, responsive down to tablet width.

**Onboarding (stepper, resumable, with progress):**
1. *Consent + camera:* plain-language explanation (what is measured, that video never leaves the device, only numbers are saved, they can recalibrate/delete anytime). Button to enable camera; if denied, offer no-camera mode.
2. *Interests:* pick 1–2 topics (from the topics that have seeded courses).
3. *Baseline calibration:* clip A = chosen interest topic, clip B = neutral/uninteresting (from `content/calibrationClips.js`). Each plays `CALIBRATION_CLIP_S` seconds, **muted autoplay is fine here**. Show a live blink counter, progress bar, and "no face" warnings that **pause the timer** so valid face time is what is measured. Compute `engagedBpm`/`neutralBpm` as `blinks / observedFaceSeconds * 60` per clip; also average the emotion probabilities per clip (if emotion available) into `emotionBaseline`. Run `personalizeBoundaries`. If quality is poor (too little face time per clip, e.g. < 60% of clip duration), tell the user and offer to retry the clip.
4. *Style probe:* two short clips (`STYLE_PROBE_CLIP_S` each) on the same neutral topic: one visual-style, one hands-on-style. Compute mean engagement score per clip (using the just-computed personal boundaries and baseline) via `computeEngagement` with feedback excluded. Optionally ask one quick "which did you prefer?" tap after each (stored as feedback, not used in the score).
5. *Result:* personal blink zone table, emotion baseline note, detected learning style with confidence, and a plain statement that these are estimates that refine over time. "Looks right, start learning" saves via `PUT /profile/calibration`.

**Home:** "Recommended for you" (cards with the match reasons from the API), "Continue learning", a small "Your profile" summary.
**Course page:** lessons list with completion state, and a note of the style the lessons will be served in.
**Lesson page:** see Section 10. Both variants render real UI (Section 12).
**Summary page:** average engagement, zone and emotion distribution, a timeline chart (reuse Recharts components) with markers where curation actions fired, what adapted and why, and what the system learned about the learner's style.
**Insights:** score over sessions, by-variant comparison, zone/emotion distributions.
**Profile:** baseline, style (and confidence), interests (editable), Recalibrate (DELETE calibration then onboarding), Delete my data (`DELETE /api/me`).
**Dev:** mock mode toggle, time-scale, scenario picker, and a live dump of ticks/score/curation state.

Accessibility basics: labels on all inputs, focus states, keyboard-operable banners/buttons, sufficient contrast, `prefers-reduced-motion` respected.

# 11A. DESIGN SKILLS AND UI QUALITY BAR (applies to every UI phase)

**Skills (use them, do not just mention them):**
1. At the start of Phase 3 and again at the start of Phases 4, 5, 6 and 7, list the available skills (look in `~/.claude/skills/` and `.claude/skills/`, or use the Skill tool's listing). Find the **taste skill** and the **web design guidelines skill** (match by name or description; the names may differ slightly).
2. Load both with the Skill tool and follow them when designing or changing any page, component, layout, color, type or motion. Where the two conflict, web design guidelines win on accessibility and usability, taste wins on look and feel.
3. After each UI phase, do a **review pass**: re-open the web design guidelines skill and audit the pages built in that phase against it, then fix every violation before committing. Note the audit result in the commit message.
4. If a skill cannot be found, say so in `ASSUMPTIONS.md` and apply the fallback rules below instead. Never skip the UI quality pass.

**Fallback rules (also the minimum bar even when the skills are present):**
- Real design tokens (CSS variables / Tailwind theme): one accent color, a neutral scale, one type scale, consistent spacing and radius. No random one-off colors.
- Distinctive but restrained: a coherent dark glass look, not a generic template. Strong hierarchy, generous whitespace, no clutter on the lesson page (the learner's attention is the whole point).
- Accessibility: semantic HTML, visible focus states, keyboard operable controls, labels on every input, AA contrast, `aria-live` for adaptive-action notices, `prefers-reduced-motion` respected, never convey zone or emotion by color alone (add text or icon).
- Every screen has loading, empty and error states. Forms validate inline with clear messages. Touch targets at least 44px. Responsive down to tablet, usable on phone.
- Motion is purposeful and short; nothing flashes or distracts during a lesson.
- Camera overlay and HUD must never cover lesson content; HUD is collapsible and remembers its state.

# 12. SEEDED PLACEHOLDER CONTENT (`backend/src/content/courses.js`, loaded by `npm run seed`; idempotent)

Content is **placeholder by design**, but structurally complete so it can be swapped later without code changes. Clearly label placeholders in the UI footer of lesson pages ("Placeholder content").
- 3 courses, 3 lessons each, topics: `web-development` (practical_ratio 0.8), `data-science` (0.5), `design` (0.2). Titles/descriptions sensible, short.
- Each lesson has:
  - `visual` variant: `{ videoUrl, keyPoints: [3–5 bullets], diagram: { alt, svg: inline SVG string or image URL }, summary }` — emphasis on explanation and visuals.
  - `practical` variant: `{ videoUrl, task: {title, steps:[...], hints:[...], expectedOutcome}, starter: string|null, checklist:[...] }` — emphasis on doing: a step list, collapsible hints, and a self-check checklist ("mark complete" enabled when all are ticked).
- `videoUrl`s may use public sample videos (e.g. `https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4`, `ElephantsDream.mp4`, `Sintel.mp4`, `ForBiggerBlazes.mp4`, `ForBiggerFun.mp4`, `SubaruOutbackOnStreetAndDirt.mp4`). Verify at least that each URL responds (HEAD) when seeding and warn (don't fail) if one doesn't.
- `content/calibrationClips.js`: per-topic "interest clip" mapping, one generic "neutral" clip, and one visual-style + one hands-on-style probe clip, each with `{label, src}`. All swappable.
- `duration_s` for lessons: short (60–180 s) so the whole flow is demoable.

# 13. BACKEND DETAILS

- App factory in `app.js` (exports `createApp(db)`) so tests use an in-memory DB; `index.js` starts it.
- `better-sqlite3` is synchronous: keep handlers simple; wrap multi-step writes (end-session summary + style update + progress) in a **single transaction**.
- `POST /sessions/:id/end` is **idempotent** (second call returns the stored summary, no double-counting of `style_stats`).
- Summary computed server-side from ticks: avg score (ignoring null), `valid_seconds` (ticks with face and non-null score × `TICK_MS`/1000), zone and emotion distributions, curation events, and the style-stat update (variant = session variant, mean score, valid seconds → `addSession` → `detectStyle`).
- Centralized error middleware; 404 for unknown routes; validation errors → 400 with field details; auth errors → 401; ownership → 403/404.
- Helmet defaults; body size limit (e.g. 200 kb); tick batches ≤ 200 items.

# 14. TESTING REQUIREMENTS

- `shared/`: vitest unit tests for every function in Section 8 (≥ the cases listed). Target high coverage of branches in `curation`, `engagement`, `style`, `tick`, `zones`.
- `backend/`: supertest integration tests with in-memory SQLite: register/login (+ duplicate email, wrong password), auth required, profile + calibration save, course ranking returns reasons, lesson serving returns `servedVariant`, full session lifecycle (start → ticks → feedback → curation → end), idempotent end, ownership checks, validation errors, privacy test (rejects tick payloads containing disallowed fields such as `image`, `frame`, `dataUrl`, or strings longer than a sane limit).
- `frontend/`: vitest for pure helpers and the tick-stream hook with fake timers; if feasible, component tests for the onboarding stepper in mock mode.
- **E2E smoke (do it if the environment allows installing Playwright browsers; otherwise provide a Node script that drives the API through the full lifecycle):** register → onboarding in mock mode → recommendations → lesson in mock mode with time-scale up → adaptive action observed → end session → summary shows data.
- `npm test` at the root runs everything; `npm run build` must pass with no errors.

# 15. KNOWN PITFALLS — avoid every one of these

1. Remounting the camera/FaceMesh on route change (Section 9.1).
2. Under-reported BPM during the first 60 s (Section 9.3). Never show or score a BPM before `MIN_OBSERVED_S_FOR_BPM`.
3. Counting blinks while no face is present, or measuring calibration over wall-clock time instead of face-observed time.
4. Stale closures in per-frame/per-tick callbacks (use refs for latest values; the existing `onBlinkRef` pattern is the model).
5. Unbounded arrays (samples, ticks): prune and batch.
6. Emotion inference every frame (perf collapse); throttle to ~1 Hz and skip when busy.
7. Browser autoplay blocking audio: lessons start from a click; calibration clips are muted.
8. Inverted/degenerate personalized boundaries when a learner's "engaged" read is higher than their "neutral" read: must fall back to defaults and say so in the UI.
9. Style detection from a single noisy session: respect `MIN_LESSON_VALID_S` and weights; never flip style on one data point.
10. Double-counting on `end` calls or page-unload retries (idempotency).
11. Trusting client-supplied IDs: always check ownership server-side.
12. Leaking secrets: `.env.example` only; never commit real secrets; `.gitignore` for `node_modules`, `dist`, `*.db`.
13. Face-api bundling/model path issues under Vite (`/models` path, `base` config); verify by actually loading models in a dev run and in a production build/preview.
14. Hardcoded thresholds outside `CONFIG`.
15. Presenting estimates as facts in the UI (Section 17).

# 16. PHASES (commit after each; each ends with green tests + successful build)

- **Phase 0:** monorepo skeleton, workspaces, root scripts, fetch the existing app into `frontend/` per Section 2 (clone, copy, clean up) and confirm `npm run build` works. Write PLAN.md. Also record which design skills are available.
- **Phase 1:** `shared/` complete with tests (Sections 7–8). Fix the BPM warm-up via `buildTick`.
- **Phase 2:** backend (schema, auth, all routes, seed, tests).
- **Phase 3:** frontend tracking layer (TrackingProvider, tick stream, emotion provider, mock source, `/dev` page). Verify with the mock source and (if a camera is available) the real one.
- **Phase 4 (UI, use design skills per Section 11A):** onboarding flow end to end against the real API.
- **Phase 5 (UI, use design skills):** home, course, recommendations, profile.
- **Phase 6 (UI, use design skills):** lesson player, curation, feedback prompts, session end, summary, insights.
- **Phase 7:** polish with the design skills (a full web-design-guidelines audit of every page, loading/empty/error states, responsive layout, a11y pass), README, ASSUMPTIONS.md, `.env.example`, final cleanup.
- **Phase 8 (verification, do not skip):** run the entire test suite, production build, start both servers, run the E2E/smoke flow, manually walk the full flow in mock mode, fix everything found. Then do a final self-review against the checklist in Section 18.

# 17. HONESTY AND LIMITATIONS (must appear in the README and in-app where noted)

- The blink-rate ↔ attention relationship is supported by population-level research (e.g. Nakano et al. 2009/2013; Ranti et al. 2020; Maffei & Angrilli 2018); EduNext applies it per learner with a personal baseline from a short calibration. It is an **estimate**, not a diagnosis. Blink rate is also affected by screen use, lighting, dry eyes, contact lenses, medication, and caffeine.
- A 45-second calibration per clip yields a small number of blinks; the baseline is noisy. The UI must say so and allow recalibration; the README documents this.
- The emotion mapping (7 expression classes → engaged/confused/frustrated/bored) is a **heuristic**, not a validated affect model. Facial expression ≠ internal state.
- Learning-style (visual vs practical) is a lightweight engagement-based preference signal; the "learning styles" literature is contested. Phrase it as "the format you engage with more" in the UI, not as an innate trait.
- Calibration confounds are acknowledged: interest vs. neutral clips (baseline) and visual vs. hands-on clips (style) are measured separately on purpose.
- Course content is placeholder.
- Everything sensed is processed on-device; only derived numbers are stored. Provide delete-my-data.

# 18. DEFINITION OF DONE (verify each, then report)

- [ ] The taste and web design guidelines skills were used (or the fallback applied and logged), and every page passed the Section 11A audit.
- [ ] `npm install && npm run seed && npm run dev` starts frontend (5173) + backend (4000); a new user can register and complete the **entire** flow in mock mode and with a real camera.
- [ ] Onboarding produces personalized zones (or an honest fallback), an emotion baseline when available, and an initial style; all saved and reflected in Profile.
- [ ] Recommendations show reasons and change when style/interests change.
- [ ] A lesson is served in the preferred variant (with exploration), tracked live, and at least `speed_up`/`slow_down` (auto) plus `suggest_break`, `replay_section`, `switch_variant` (suggestions) can be triggered via the mock scenario.
- [ ] Feedback prompts appear per rules and are stored; they influence the score.
- [ ] Ending a session returns a correct summary; style stats update exactly once per session.
- [ ] No camera frames or images are ever sent to the server (test exists and passes).
- [ ] No BPM/score is shown before warm-up; the calibrating state is visible.
- [ ] No-camera mode works end to end.
- [ ] All tests pass; production build passes; README documents setup, architecture, the formulas (Section 8), config knobs, mock mode, and limitations.
- [ ] `ASSUMPTIONS.md` lists every default you chose.

# FINAL REPORT FORMAT

When finished, reply with: (1) what was built (by phase), (2) how to run and demo it in under 3 minutes (mock mode steps), (3) test/build results (actual command outputs summarized), (4) anything not fully working or deviating from this spec, and (5) the top 5 things I should customize next (placeholder content, clips, weights, etc.). Be candid about gaps.
