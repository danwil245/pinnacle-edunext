# EduNext — Motion V2: More Animation + Smoothness Pass

## How to use (for you, not for Claude Code)

1. Run this **after** the Motion Rebuild prompt (the site you already have, with Lenis, GSAP and Vanta in it).
2. In `edunext/`: commit everything, then `git checkout -b motion-v2`.
3. Run `claude` and paste everything below `===== PROMPT STARTS =====`.
4. Keep taste skill and web design guidelines skill installed.
5. For the smoothness check, test in **Chrome**, with other heavy tabs closed and the laptop **plugged in** (battery saver throttles the GPU and makes everything look laggy).
6. Before showing the profs, run `npm run build && npm run preview` and demo from that. The dev server (`npm run dev`) is much slower than a production build, and part of the lag you saw is likely just that.

===== PROMPT STARTS =====

# MISSION

The EduNext frontend already uses Lenis, GSAP and Vanta. Two goals now, in this order:

1. **Make it smooth.** Find and fix the causes of lag. Measure, don't guess.
2. **Add more animation** so the site feels premium and impresses a faculty panel, without losing the smoothness from goal 1.

**Priority decision (from the owner): looks first.** Do NOT solve lag by removing the Vanta background, shrinking the visual ambition, or stripping animations. Solve it by engineering: optimize how things render. A degraded-quality fallback may exist only for genuinely struggling devices and must never trigger on a normal laptop. The audience is a panel watching a demo on one machine.

# WORKING RULES

1. Do not ask me questions unless truly blocked. Log decisions in `ASSUMPTIONS.md` under "Motion V2".
2. Same boundaries as before: do not modify `shared/`, `backend/`, or the tracking internals (`frontend/src/tracking/`, `useFaceMesh.js`, tick builder, engagement and curation logic). Existing tests and the privacy test must keep passing. No remote runtime assets, no analytics.
3. Load and follow the **taste skill** and the **web design guidelines skill** before designing anything new (look in `~/.claude/skills/` and `.claude/skills/`, or use the Skill tool listing). Audit new work against the guidelines before each commit. If a skill is missing, log it and apply sensible fallback rules.
4. Verify library behavior against the installed versions' docs/READMEs and types (Lenis, GSAP + ScrollTrigger, Vanta, three). Do not code from memory.
5. Work in the phases in Section 7. Each phase ends with `npm test` and `npm run build` green, then a commit. Never leave a phase red.
6. Every performance claim must be backed by a measurement from this machine, recorded in `PERF_REPORT.md` (before and after).

# 1. PHASE P0: PROFILE FIRST (do not change code before this is done)

The owner remembers lag but not where. Find it.

- Build and serve the **production** build (`npm run build && npm run preview`). Judge performance only on that, not on the dev server. Note the dev-server numbers separately; if dev is far worse, say so in the report (that part is not a real problem).
- Using Playwright with Chromium (already available) and the Chrome DevTools Protocol, record for each route (`/`, `/login`, `/register`, `/onboarding` in mock mode, `/home`, `/courses/:slug`, `/learn/:lessonId` in mock mode, `/summary/:id`, `/insights`, `/profile`): average and p95 frame time during a scripted scroll and a scripted route change, long tasks (>50 ms) count, dropped frames, JS heap growth, and number of live WebGL contexts and ScrollTrigger instances. A headless browser may lack a GPU; note that WebGL numbers in software rendering are pessimistic and treat them as relative, not absolute. Save the harness as `scripts/perf/measure.mjs` so it can be re-run.
- Produce a ranked list of the real causes in `PERF_REPORT.md` before fixing anything. Typical suspects to check explicitly, but report only what you actually measure:
  - Vanta running at full devicePixelRatio, at full-screen resolution, with too many segments/vertices, or still rendering while offscreen, behind other content, or on tab hidden.
  - More than one WebGL context alive (a Vanta instance not destroyed on route change; React 18 StrictMode double-mount creating two).
  - Lenis not driven by a single rAF loop (a second rAF loop, or Lenis and GSAP ticker both calling `raf`), `ScrollTrigger.update` called redundantly, or ScrollTriggers recreated on every render and never killed.
  - Animating layout properties (`width`, `height`, `top`, `left`, `margin`) instead of `transform`/`opacity`; animating `filter: blur`, `backdrop-filter`, large `box-shadow` or `mix-blend-mode` on big areas (the dark glass look probably leans on `backdrop-filter`: this is a very common cause of scroll jank).
  - Large unoptimized images/videos, no `loading="lazy"`, no explicit dimensions (layout shift), fonts blocking render.
  - React re-rendering large trees on every animation frame or every tracker tick (the tick stream and HUD updating state 5 to 60 times a second and re-rendering whole pages); context providers whose value changes constantly.
  - Recharts re-animating or re-rendering on every tick.
  - The MediaPipe + emotion model competing with animations on the main thread on onboarding/lesson routes.
  - Bundle size and main-thread parse cost of three + GSAP plugins + Vanta in the initial chunk.
- Confirm the cause of every item you intend to fix with a before/after number.

# 2. PHASE P1: FIX LAG WITHOUT REMOVING VISUALS

Apply fixes for what was actually measured. Techniques you are expected to use where relevant:

**Vanta / WebGL**
- Cap the renderer pixel ratio (e.g. `Math.min(devicePixelRatio, 1.5)`; verify how to pass `scale`/`scaleMobile` or a custom renderer setting in the installed Vanta version) and render the canvas at a sensible resolution; the background is soft and blurry by nature, so halving its internal resolution and CSS-upscaling it is invisible but a large GPU saving.
- Tune effect density (Waves: `waveHeight`, `shininess`, and geometry detail; Fog: blur/speed/zoom settings) for the lowest cost that still looks great.
- Run it only while visible: pause on `document.hidden`, pause when scrolled out of the hero (IntersectionObserver), and **always destroy on unmount**. Guarantee exactly one instance (guard against StrictMode double-mount and rapid route changes).
- Never run more than one WebGL context at a time. Keep `three` and Vanta out of the main bundle (dynamic import, prefetch during idle on the landing route so the hero appears instantly).
- Keep the visual result as good or better than now. If you lower quality internally, compare screenshots before and after and confirm it still looks premium.

**Scrolling and GSAP**
- One animation loop only: Lenis driven by `gsap.ticker`, `lagSmoothing(0)`, no second rAF loop anywhere.
- Animate only `transform` and `opacity`. Replace any layout-property animation. Use `gsap.quickTo` / `quickSetter` for pointer-follow effects. Promote only actively animating elements to their own layer (`will-change: transform` set before, removed after).
- `ScrollTrigger`: batch with `ScrollTrigger.batch` for lists of cards, `once: true` for simple reveals, scrub only a few large elements, `anticipatePin` for pinned sections, refresh once after fonts/images settle, kill everything on unmount.
- Replace heavy `backdrop-filter`/blur on large or scrolling surfaces with a cheaper equivalent (a semi-opaque gradient fill with a subtle border and static noise) unless the surface is small and static. Keep the glass look visually.
- Use `content-visibility: auto` with `contain-intrinsic-size` for long below-the-fold sections, `contain: layout paint` on independent widgets.

**React**
- Stop per-tick re-renders from reaching the page tree: keep the tick stream in a store with selectors (e.g. `useSyncExternalStore`) so only the HUD/gauge components that show a value re-render, and throttle UI updates to a sensible rate (e.g. ≤4 to 10 Hz for numbers; the gauge animates between values with GSAP, not with state changes).
- Memoize heavy lists and chart components; give Recharts stable props and disable its re-animation on data ticks (`isAnimationActive={false}` for live charts, animate only on first mount).
- Route-level code splitting with `React.lazy` and `Suspense` (animated skeleton fallback), prefetch the next likely route on idle or hover.

**Assets**
- Convert images to AVIF/WebP with explicit width/height; lazy-load below the fold; self-host and subset fonts with `font-display: swap`; preload only the one display font used in the hero.

**Tracking-safety (keep, but do not let it hurt visuals)**
- Keep `useMotionBudget` only as a safety net for genuinely struggling hardware (sustained tracker FPS collapse). It must **not** trigger on a normal laptop in normal use; set thresholds conservatively and test that it does not fire during the standard demo run on this machine. On the lesson route, never run Vanta; heavy continuous effects stay off there as agreed (motion plays on events, then rests).

After P1, re-run the perf harness and record the new numbers next to the old ones. Targets on this machine, production build, Chrome: p95 frame time ≤ 20 ms during scroll and route transitions on all routes (aim for a steady 60 fps), zero long tasks >100 ms during scroll, exactly one WebGL context ever alive, no growth in heap or ScrollTrigger count after 20 route round-trips. If a target is missed, say so honestly and explain why.

# 3. PHASE P2: ADD MORE ANIMATION (the fun part)

Add the following on top of what exists. Everything must be on `transform`/`opacity`/`clip-path`, follow the motion principles (one easing family, durations/staggers from `motionConfig.js`), respect reduced motion, and pass the P1 performance targets. After adding each batch re-run the harness; if a feature breaks a target, optimize it or simplify it until the target holds. Looks first: find a way to keep the effect, not to delete it.

**A. Scroll-driven sections (landing page especially)**
- A pinned, scrubbed "How EduNext works" sequence: as you scroll, the four stages (calibrate, sense, adapt, learn your way) swap in with the supporting visual changing in sync (progress line draws with `DrawSVG`-style stroke animation or `stroke-dashoffset`, steps scale/opacity in turn).
- Horizontal scroll gallery section (pinned, translateX scrubbed) for the three signals (blink rate, emotion, feedback) with a parallax layer on the images/illustrations.
- Parallax depth on hero elements (different speeds per layer), subtle scale-up of the hero as it scrolls away, section-to-section color/background shift through the scroll (animate CSS variables on a wrapper, not many elements).
- An animated attention-zones strip: the five zones fill in sequence and a marker sweeps across the BPM scale as the section scrolls into view.
- A scroll progress indicator in the navbar.

**B. Micro-interactions**
- Magnetic buttons and CTAs (`quickTo`), button press feedback, animated arrow icons, ripple or sheen on primary buttons (a single moving gradient pseudo-element, not box-shadow animation).
- Cards: 3D tilt on hover (small, pointer-based, `quickTo`), a soft spotlight that follows the cursor inside the card (CSS variables updated by pointer events), lift and shadow change via transform only.
- A custom cursor follower on desktop (small dot + ring that eases toward the pointer, grows over interactive elements, hidden on touch devices and when reduced motion is on). Must never block clicks and must be disabled on the lesson page.
- Nav links with animated underline, inputs with floating labels and animated focus ring, toggle and checkbox animations, animated tooltips.
- Loading states: skeleton shimmer using a single transformed gradient.

**C. Text and number animations**
- Split-text headline reveals (lines/words/chars staggered, masked rise) on landing and page titles. Keep accessible text (aria-label on the full heading, hide split spans from assistive tech).
- Count-up numbers for stats (BPM, scores, percentages, session counts) triggered on first view.
- Animated gauges and rings: engagement gauge needle/arc eases between values with GSAP; the calibration progress ring and blink counter animate smoothly; zone color changes cross-fade.
- A scrambled/typewriter text effect for small labels such as the zone name changing ("Attentive" → "Fatigued") and the "why did this change?" line, short and subtle.
- Marquee of the research references (Nakano, Ranti, Maffei & Angrilli, etc.) on the landing page, running on transform only, pausing on hover.

**D. Page and element transitions**
- A real route transition: outgoing page fades/slides while a masked panel wipe or clip-path reveal covers and uncovers the next page (use a short, premium-feeling timeline, ≤ 0.9 s total, never blocking input for longer). The persistent camera tracker is not part of the transitioning tree and must not remount.
- Shared-element transitions with GSAP Flip between course card → course page header and between onboarding steps (Flip state captured before navigation, applied after).
- Staggered list/grid entrance and exit, animated tab and accordion changes, modal/drawer open-close with focus management intact.
- Charts: animated draw-in on first view, tooltips with smooth follow.

**E. Ambient polish (cheap, high impact)**
- Gradient mesh / grain overlay as a static noise PNG with very low opacity (no animated filters), soft glow blobs that drift via transform on a very slow loop on non-lesson pages only (CSS animation on a few elements; paused offscreen).
- Smooth hover/focus states everywhere; consistent 150 to 250 ms micro transitions.
- A tasteful page-load intro (logo + progress sequence ≤ 1.2 s, skipped on subsequent visits in the session and under reduced motion).

# 4. LESSON PAGE RULES (unchanged and still binding)

Event-driven motion only (entrance, curation notice, feedback prompt, variant crossfade, break overlay), then still. No looping animation near the lesson content, no WebGL, no custom cursor, no marquee, Focus mode toggle stays. Tracker never remounts. Verify the tracker's own FPS is unaffected by the new animations (compare mock-mode tick timing before and after).

# 5. ACCESSIBILITY AND ROBUSTNESS (must still hold after all additions)

`prefers-reduced-motion` and the in-app Reduce motion toggle disable Lenis smoothing, Vanta, pinned/scrubbed sequences, cursor follower, tilt, split-text and transitions (replace with simple fades). Keyboard operability, visible focus, logical heading order, `aria-live` for adaptive notices, anchor links working with Lenis, no layout shift, back/forward button scroll restoration, works from tablet width up. Touch devices: no hover-only effects, no custom cursor, tilt off.

# 6. DEMO MODE FOR THE PROFESSORS

Add a small, discreet `/demo` route (or a `?demo=1` flag) that:
- starts the app in mock-signal mode with a scripted scenario (engaged → drifting → fatigued → recovery) so the whole adaptive behavior is visible in about 3 minutes without needing a good webcam read, with on-screen captions explaining what is happening and why (e.g. "Blink rate rising → fatigued zone → break suggested");
- preloads route chunks and the Vanta chunk so nothing stalls during the demo;
- includes a keyboard shortcut cheat sheet for presenting (e.g. next step, restart scenario);
- is clearly labeled as a scripted simulation in the UI and README (honesty: it is a simulation, not a live reading).
Real-camera mode remains available and unchanged.

# 7. PHASES (commit after each; tests + build green)

- **P0:** branch, perf harness, baseline measurements, `PERF_REPORT.md` with the ranked, measured causes. No fixes yet.
- **P1:** fixes for measured lag; re-measure; update the report.
- **P2a:** scroll-driven sections + ambient polish.
- **P2b:** micro-interactions + text/number animations.
- **P2c:** route/shared-element transitions + demo mode.
- **P3:** re-run the full harness and compare to P1 targets; optimize anything that regressed; accessibility and reduced-motion pass; web design guidelines audit of every page; update README "Motion & performance" section and `ASSUMPTIONS.md`.
- **P4 (verification, do not skip):** full `npm test`, production build, start servers, walk the entire flow in mock mode and the `/demo` scenario, check the console for errors, check no duplicate Vanta/Lenis/ScrollTrigger after 20 route round-trips, verify reduced-motion and WebGL-blocked fallbacks, and verify that the tracker FPS on onboarding and lesson is unaffected. Fix everything found.

# 8. DEFINITION OF DONE

- [ ] `PERF_REPORT.md` shows measured before/after numbers and the targets in Section 2 are met (or honestly explained).
- [ ] Vanta is still present and still looks great, with exactly one WebGL context ever alive and no leaks.
- [ ] All four categories of new animation (A to D) are implemented, plus the ambient polish in E.
- [ ] `/demo` scripted scenario works end to end and is clearly labeled as a simulation.
- [ ] All existing tests and the privacy test pass; no changes to `shared/`, `backend/` or tracking internals.
- [ ] Reduced motion works; lesson page rules respected; tracker never remounts.
- [ ] Design skills used (or fallback logged); every page passed the guidelines audit.
- [ ] `npm run build` passes with a bundle size before/after.

# FINAL REPORT FORMAT

Reply with: (1) the measured causes of lag and what fixed each (with before/after numbers), (2) list of new animations per page, (3) test/build results and bundle sizes, (4) frame-time results per route against the targets, (5) design skills used and audit result, (6) deviations, assumptions and honest limitations, (7) how to run the demo for the panel (exact commands and keys).
