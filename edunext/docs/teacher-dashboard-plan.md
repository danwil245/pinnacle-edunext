# Teacher Dashboard — Plan (Prompt B)

This document is the design record for the teacher role + dashboard. It covers the
data-model changes, the new routes, the new frontend pages, and the risks. Decisions
that aren't re-asked are logged in `ASSUMPTIONS.md` under "Teacher dashboard".

## Goals

1. **Student analytics for teachers** — Insights-style aggregates, per course / per
   lesson / per student. Derived numbers and labels only; never frames or video.
2. **Content management** — teachers create / edit / publish / unpublish / archive /
   permanently delete courses and lessons (YouTube + text), visible to students
   immediately.

## Data-model changes (all idempotent migrations in `backend/src/migrate.js`)

### `users`
- `role TEXT NOT NULL DEFAULT 'student'` — `'student' | 'teacher'`. Existing users
  become students (default fills in on ALTER).

### `courses`
- `owner_id INTEGER REFERENCES users(id)` — teacher who owns the course. Nullable for
  seeded demo courses until the demo teacher is assigned at seed time.
- `status TEXT NOT NULL DEFAULT 'published'` — `'draft' | 'published' | 'archived'`.
  New teacher-created courses start `draft`; seeded demo courses are `published`.
- `created_at TEXT`, `updated_at TEXT` — timestamps (nullable for pre-existing rows,
  backfilled at seed).

### `lessons`
Already has (from Prompt A): `position`, `title`, `visual_video_id`,
`practical_video_id`, `visual_start_s`, `practical_start_s`, `visual_notes`,
`practical_exercise`, `visual`/`practical` JSON bodies, `duration_s`.
Add:
- `description TEXT` — optional lesson description (teacher-authored).
- Lessons inherit status from their course (no per-lesson draft flag) — simplest model
  that satisfies the spec ("or inherit from the course").

### `users` (demo analytics)
- `is_demo INTEGER NOT NULL DEFAULT 0` — synthetic demo student/teacher flag.

### `sessions`
- `is_demo INTEGER NOT NULL DEFAULT 0` — synthetic session flag (set by the demo
  analytics seed only).

### Indexes (analytics)
- `idx_sessions_lesson ON sessions(lesson_id)`
- `idx_sessions_user_lesson ON sessions(user_id, lesson_id)`
- `idx_courses_owner ON courses(owner_id, status)`
- (existing) `idx_ticks_session`, `idx_sessions_user`, `idx_lessons_course`.

### Soft delete vs permanent delete
- **Archive** (soft): `courses.status='archived'`. Disappears for students; sessions,
  ticks and analytics are kept. Reversible (teacher can unpublish→draft, or re-publish
  only from draft; archived is a terminal-ish state reachable from any, un-archive is
  out of scope — a teacher recreates or we can relax later; logged as assumption).
- **Permanent delete**: `DELETE /api/teacher/courses/:id?confirm=<slug>` cascades to
  lessons → sessions → ticks → feedback/curation events via existing
  `ON DELETE CASCADE` foreign keys. Requires a typed confirmation equal to the slug.

## Routes (all under `/api/teacher`, `authRequired` + `requireRole('teacher')`)

### Content
- `POST   /api/teacher/courses` — create (draft).
- `GET    /api/teacher/courses` — list own courses (+ lesson/student counts).
- `GET    /api/teacher/courses/:id` — own course detail + lessons.
- `PUT    /api/teacher/courses/:id` — edit fields.
- `POST   /api/teacher/courses/:id/publish`
- `POST   /api/teacher/courses/:id/unpublish`
- `POST   /api/teacher/courses/:id/archive`
- `DELETE /api/teacher/courses/:id?confirm=<slug>` — permanent cascade.
- `POST   /api/teacher/courses/:id/lessons` — add lesson (oEmbed-verified).
- `PUT    /api/teacher/courses/:id/lessons/:lessonId` — edit lesson.
- `POST   /api/teacher/courses/:id/lessons/reorder` — `{ order: [lessonId,...] }`.
- `DELETE /api/teacher/courses/:id/lessons/:lessonId` — delete lesson.

### Analytics
- `GET /api/teacher/analytics/overview`
- `GET /api/teacher/analytics/courses/:id`
- `GET /api/teacher/analytics/courses/:id/students`
- `GET /api/teacher/analytics/courses/:id/students/:studentId`
- `GET /api/teacher/analytics/courses/:id/export.csv`

All analytics endpoints join on `courses.owner_id = req.userId` so a teacher only ever
sees their own courses and only students who have sessions in them.

## Authorization matrix (tested in D5)

| Caller | Teacher route | Result |
|---|---|---|
| Unauthenticated | any `/api/teacher/*` | 401 |
| Student | any `/api/teacher/*` | 403 |
| Teacher A | Teacher B's course (any op/analytics) | 404 (not leaked as 403) |
| Teacher | own course | ok |
| Student | published catalogue + own sessions | ok |
| Student | draft/archived course | not listed / 404 |

Ownership is always checked server-side by joining on `owner_id`; IDs from the client
are never trusted.

## Frontend pages

- `/teacher` — overview dashboard (KPIs + recent activity).
- `/teacher/courses` — course list w/ status badges + counts + actions.
- `/teacher/courses/new` — create form.
- `/teacher/courses/:id` — editor: fields + lessons (reorder, add/edit w/ live YouTube
  preview), publish/unpublish/archive, typed-confirmation permanent delete.
- `/teacher/courses/:id/analytics` — course analytics (per-lesson, class timeline).
- `/teacher/courses/:id/students` — per-student table.
- `/teacher/courses/:id/students/:studentId` — student detail.

Routing: teachers land on `/teacher`; `ProtectedRoute` gains a `role` gate. Teachers
skip camera onboarding. A student hitting `/teacher/*` sees a "not available" page; a
teacher hitting a student route is redirected to `/teacher`. Navbar differs by role.

## Risks / mitigations

- **Mid-lesson unpublish/archive/delete breaking a student session.** Mitigation: the
  lesson/session endpoints resolve the lesson by id regardless of course status, so an
  in-flight session finishes and its summary still builds. Only the *catalogue* and
  recommendation queries filter on `status='published'`. A permanent delete cascades,
  so a student mid-lesson on a deleted course will have their session removed — we warn
  the teacher with the session count before permanent delete.
- **Misleading averages on tiny samples.** Minimum-data rule from `CONFIG` returns
  "not enough data yet" below the threshold.
- **Invalid time inflating/deflating engagement.** Averages exclude ticks without a
  face or without a score (the multi-person validity fields).
- **Demo data polluting real numbers.** Every demo row carries `is_demo=1`, the UI
  badges it, a toggle hides it, and the seed refuses to run in production unless
  `ALLOW_DEMO_ANALYTICS=1`.
- **Privacy regression.** New endpoints return only derived numbers/labels; the privacy
  test is extended to assert no image/blob/base64/raw-tick fields in teacher responses.
