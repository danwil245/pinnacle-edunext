# Teacher dashboard — verification notes

This folder is where responsive screenshots of the new teacher pages live.

## Screenshots (manual step)

The teacher UI renders without a camera, so screenshots can be captured from a running
dev server (`npm run dev`) without the webcam pipeline. Capture each page at the four
widths and save here as `<page>-<width>.png`:

| Page | Route |
|---|---|
| Overview | `/teacher` |
| Course list | `/teacher/courses` |
| Course editor | `/teacher/courses/:id` |
| Course analytics | `/teacher/courses/:id/analytics` |
| Students table | `/teacher/courses/:id/students` |
| Student detail | `/teacher/courses/:id/students/:studentId` |

Widths: **1440, 1024, 820, 390 px**.

> These PNGs are not committed by the automated build (they require a running browser,
> which the headless CI environment here can't drive end-to-end). Capture them once
> locally before the panel. `npm run seed:demo-analytics` fills the dashboard first.

## Accessibility checklist (applied in the build)

- All form controls have associated `<label for>`; the invite-code and YouTube fields
  announce status via `aria-describedby` + `aria-live="polite"`.
- The confirm/delete dialog uses `role="dialog" aria-modal`, focuses its first control,
  and closes on `Escape`.
- Lesson reorder has keyboard-accessible up/down buttons (not drag-only), each with an
  `aria-label`.
- Status is conveyed with text + colour (never colour alone): status badges, trend chips
  and the "check-in" flag all carry words.
- The teacher nav includes a "Skip to content" link and a visible focus ring.
- Charts have text equivalents: the zone bar has a per-zone legend with percentages; the
  "not enough data yet" state replaces a misleading empty chart.

## Responsive notes

- Layouts use `max-w-6xl` with `grid`/`flex` that collapse to one column under ~640px.
- The students table scrolls horizontally on narrow screens (`overflow-x-auto`,
  `min-w-[640px]`) so columns stay readable rather than wrapping into mush.
