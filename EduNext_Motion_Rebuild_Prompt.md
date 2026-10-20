# EduNext — Motion Rebuild Prompt (Lenis + GSAP + Vanta)

## How to use (for you, not for Claude Code)

1. Open a terminal in your `edunext/` project (the repo `pinnacle-edunext`). Best time to run this: **after the main build prompt has finished and `npm test` + `npm run build` are green**. If the app is not built yet, run the main prompt first.
2. Run `git status`, commit anything pending, then `git checkout -b motion-rebuild` so you can always revert.
3. Run `claude`, paste everything below `===== PROMPT STARTS =====`.
4. You do not need to clone the three repos. They are libraries: Claude Code installs them from npm (`lenis`, `gsap`, `vanta`, plus `three`). If you want Claude Code to read their docs, the prompt already tells it to look at the GitHub READMEs.
5. Have your taste skill and web design guidelines skill installed (`~/.claude/skills/` or `.claude/skills/`).
6. When it finishes, run `npm run dev`, click through every page, then merge the branch.

===== PROMPT STARTS =====

# ROLE AND MISSION

You are rebuilding the **entire EduNext frontend** (`frontend/`) as a polished, motion-rich experience using three libraries:

- **Lenis** (https://github.com/darkroomengineering/lenis) for smooth scrolling.
- **GSAP** (https://github.com/greensock/gsap) for animation and scroll-driven storytelling.
- **Vanta** (https://github.com/tengbao/vanta) for animated WebGL backgrounds. Use the **Waves** or **Fog** effect (pick one, based on what fits best; use the same one everywhere for consistency).

The product, routes, API, tracking layer and shared logic already exist and must keep working. This is a **front-end redesign and motion layer**, not a rewrite of behavior.

# WORKING RULES

1. **Do not ask me questions unless truly blocked.** Choose sensible defaults and log each in `ASSUMPTIONS.md` under a "Motion rebuild" heading.
2. **Plan first.** Read `frontend/` fully, then write `MOTION_PLAN.md` (page-by-page motion plan, component list, risks). Then proceed without waiting.
3. **Work in phases** (Section 9). After each phase: run `npm test` and `npm run build`, fix failures, then commit. Never leave a phase red.
4. **Do not touch behavior.** Do not modify `shared/`, `backend/`, or the internals of the tracking layer (`frontend/src/tracking/`, `useFaceMesh.js`, tick builder, engagement and curation logic). You may change how things *look and animate*. Existing tests must still pass.
5. **Privacy invariant still holds:** no frames or video leave the browser. Do not add any analytics, CDN scripts, or remote assets that load at runtime (fonts and libraries are bundled via npm; self-host fonts).
6. **Use the design skills.** Before designing or changing any page, load the **taste skill** and the **web design guidelines skill** (look in `~/.claude/skills/` and `.claude/skills/`, or use the Skill tool's listing; match by name or description). Follow both. Where they conflict, web design guidelines win on accessibility and usability, taste wins on look and feel. After each UI phase, audit that phase's pages against the web design guidelines and fix violations before committing. If a skill is missing, say so in `ASSUMPTIONS.md` and apply the fallback rules in Section 8.
7. **Verify library APIs against the real docs/READMEs** (fetch each GitHub README, or read the installed package's types in `node_modules`). Do not code Lenis/GSAP/Vanta usage from memory. Versions drift.
8. Keep JavaScript (ESM) + JSDoc, matching the repo. No TypeScript migration.

# 1. INSTALL AND WIRING

Install: `lenis`, `gsap`, `@gsap/react`, `vanta`, `three`. Notes you must verify and handle:

- **GSAP** is free to use including its plugins (ScrollTrigger, SplitText, Flip, etc.) from the public `gsap` npm package. Register plugins once in `frontend/src/motion/gsap.js` (`gsap.registerPlugin(ScrollTrigger, ...)`) and import GSAP only from that module.
- **Vanta needs three.js.** Vanta effects are built against an older three.js API. Install the three.js version Vanta documents as compatible (check the Vanta README), import `vanta/dist/vanta.waves.min` (or `vanta.fog.min`), pass `THREE` explicitly, and **actually run it** to confirm it renders in both `npm run dev` and a production `npm run build && npm run preview`. If the newest `three` breaks, pin the working version and note it in `ASSUMPTIONS.md`. Lazy-load Vanta and three with dynamic `import()` so they are not in the main bundle.
- **Lenis + GSAP integration** (the standard pattern, verify against current docs): one Lenis instance, driven by `gsap.ticker`, with `lenis.on('scroll', ScrollTrigger.update)`, `gsap.ticker.add((t) => lenis.raf(t * 1000))`, and `gsap.ticker.lagSmoothing(0)`. Create it once in a `SmoothScrollProvider` mounted at the app root so route changes do not recreate it. On route change: scroll to top via Lenis, then `ScrollTrigger.refresh()`.
- Use `useGSAP` from `@gsap/react` (with a `scope` ref) in components so animations are cleaned up on unmount and React 18 StrictMode double-mount does not duplicate tweens.

Create `frontend/src/motion/` containing: `gsap.js` (registration), `SmoothScrollProvider.jsx`, `VantaBackground.jsx`, `useReducedMotion.js`, `motionConfig.js` (all durations/eases/stagger values in one frozen object; no magic numbers elsewhere), and reusable primitives (`Reveal`, `SplitHeading`, `Stagger`, `PageTransition`, `Magnetic`, `CountUp`).

# 2. VANTA BACKGROUND RULES

`VantaBackground` is a component that mounts the effect into a `ref`, **destroys it on unmount** (`effect.destroy()`), handles resize, and falls back to a static CSS gradient when:
- the user prefers reduced motion,
- WebGL is unavailable or context creation fails,
- the device is low-power (`navigator.hardwareConcurrency <= 4`) or the tab is hidden (pause when `document.hidden`),
- the performance guard in Section 6 says to degrade.

Place it behind: the **landing hero**, the **onboarding** flow, and (optionally, lightly) **login/register**. Do **not** put a WebGL background behind the lesson player. Colors come from the design tokens (dark base, one accent). Keep effect settings in `motionConfig.js`. Overlay content must stay readable (check contrast with the background at its brightest).

# 3. PAGES: WHAT TO BUILD

Redesign every page with a consistent system (tokens from the design skills: color, type scale, spacing, radius). All routes and behavior stay as they are.

- **New public landing page `/`** (add the route; logged-in users still get `/home` as their main page, with a link to the landing page in the footer only): Vanta hero with a split-text headline and a CTA; a short scroll story using GSAP ScrollTrigger (pinned or scrubbed section) explaining the real flow: *calibrate → sense → adapt → learn your way*; a section showing the five attention zones; privacy section ("video never leaves your device"); how the three signals combine; honest limitations strip; footer. Copy must follow the honesty rules (estimates, not diagnoses).
- **Login / Register:** calm entrance animation, inline validation animation (subtle shake or color transition, not harsh).
- **Onboarding:** Vanta background; animated stepper (progress eases between steps, step content transitions); the live blink counter and progress ring animate smoothly; "no face" warning appears/disappears with a clear but gentle transition; the result screen reveals the personal zone table with a staggered build and the style result with a count-up for the confidence value.
- **Home:** staggered card reveal, hover lift, "why recommended" chips; skeletons for loading.
- **Course page, Profile, Insights, Summary:** section reveals, Recharts charts animate in on first view (use Recharts' own animation or a GSAP-driven container reveal, not both fighting), markers on the summary timeline appear in sequence.
- **Lesson player:** see Section 5.
- **Global:** animated route transitions (`PageTransition`), a refined navbar with scroll-aware state, custom scrollbar, focus-visible styling, and animated toasts for adaptive actions (break, replay, switch variant, slow down), with `aria-live`.

# 4. MOTION DESIGN PRINCIPLES

- Motion explains or guides; it is never decoration for its own sake. One easing family and a small set of durations, defined in `motionConfig.js`.
- Entrances: 0.4 to 0.8 s, `power3.out`-style easing, stagger 0.05 to 0.12 s. Hover/press feedback under 0.2 s.
- Animate `transform` and `opacity` only (plus `clip-path` where useful). Never animate layout properties (`width`, `top`, etc.) on scroll. Use `will-change` sparingly and remove it after the animation.
- ScrollTrigger: set `once: true` for simple reveals, avoid scrubbing huge DOM trees, call `ScrollTrigger.refresh()` after images/fonts load, and kill triggers on unmount (`useGSAP` handles this).
- Never hide essential content behind an animation that can fail: initial hidden states are applied only by JS after GSAP is ready (or use `gsap.from` with `immediateRender` handled carefully), so content is visible without JS and under reduced motion.

# 5. LESSON PLAYER (full motion, but safe)

The lesson page gets the same motion treatment as the other pages: animated entrance of the player chrome, HUD, feedback prompts and curation notices; smooth variant switches (crossfade between visual and practical variants); animated engagement gauge, and break overlays with a calm transition. Constraints, because this page is where attention is being measured:

- **No continuous or looping animation near or over the lesson content/video** (no shimmering borders, floating particles, pulsing glows). Motion plays once on events (entrance, curation action, feedback prompt) and then is still.
- **No WebGL background on this page.**
- The **camera overlay and tracking must not be re-mounted or interrupted** by any animation or route transition (single persistent tracker; do not wrap it in anything that unmounts on navigation).
- Provide a visible **"Focus mode"** toggle in the lesson header that turns off all non-essential motion for the session (stored in preferences). Default to **on for motion** as requested, off-able in one click.
- Lenis smooth scroll stays active on the lesson page but must not hijack scrolling inside embedded players, code editors or scrollable panels: use Lenis's `data-lenis-prevent` (verify attribute name in the docs) on those containers.

# 6. PERFORMANCE GUARD (required)

MediaPipe + the emotion model + animations compete for the same main thread, and a drop in tracking frame rate would corrupt the blink measurements. Implement `useMotionBudget`:
- Measure tracking/tick health (e.g. face-processing FPS from the existing tracker, or `requestAnimationFrame` frame time) and, if it falls below a threshold in `motionConfig.js` for several seconds, **automatically degrade**: pause Vanta, stop non-essential GSAP timelines, set a flag the UI reads, and show a small unobtrusive notice with a "Re-enable motion" option.
- Never run Vanta while the tracker is active on the lesson route (it is not mounted there anyway, but assert it).
- Add a `/dev` readout: current FPS, whether motion is degraded, number of active ScrollTriggers.

# 7. ACCESSIBILITY AND ROBUSTNESS

- Respect `prefers-reduced-motion`: disable Lenis smoothing (use native scroll), disable Vanta, replace scroll-driven and split-text animations with simple fades or no animation. Provide the same in-app toggle (Profile page: "Reduce motion"), persisted in `localStorage` with try/catch.
- Keyboard and screen-reader support unchanged or better: visible focus, no focus traps, headings in logical order after SplitText (keep an `aria-label` on the full heading; hide split spans from assistive tech or use the plugin's accessibility options), skip link, `aria-live` for adaptive notices.
- Anchor links and in-page scroll must work with Lenis (`lenis.scrollTo`). Browser back/forward and refresh must restore sensible scroll positions.
- No layout shift: reserve space for animated elements; load fonts with `font-display: swap`.
- Works from tablet width up, usable on phone. Test touch: Lenis smooth touch is off by default, keep it that way unless the docs recommend otherwise.

# 8. FALLBACK DESIGN RULES (minimum bar even with the skills)

Real design tokens (CSS variables / Tailwind theme): one accent, a neutral scale, one type scale with a distinctive display face (self-hosted) plus a readable body face, consistent spacing and radius. Strong hierarchy, generous whitespace, AA contrast, 44px touch targets, loading/empty/error states on every screen, visible focus states.

# 9. PHASES (commit after each; each ends with green tests and a successful build)

- **M0:** create branch `motion-rebuild` (if not already on it), read the code, write `MOTION_PLAN.md`, record which design skills were found. Baseline: `npm test` and `npm run build` green.
- **M1:** install libraries; build `frontend/src/motion/` foundations (GSAP registration, `SmoothScrollProvider`, `useReducedMotion`, `motionConfig`, primitives). Wire Lenis+ScrollTrigger. Prove it with a minimal demo on `/dev`.
- **M2:** design system pass: tokens, typography, navbar, layout shell, page transitions, toasts. Persistent tracker still not remounting on route change (verify with a test or a dev assertion).
- **M3:** `VantaBackground` (lazy loaded, fallbacks, destroy on unmount) and the **landing page** with the scroll story.
- **M4:** auth pages and **onboarding** (Vanta + animated stepper and results), verified in mock mode end to end.
- **M5:** home, course, profile (incl. Reduce motion toggle), insights, summary.
- **M6:** lesson player motion with Focus mode, variant crossfade, curation notices, and the performance guard (`useMotionBudget`).
- **M7:** polish and audit: full web-design-guidelines audit of every page, accessibility pass (keyboard, reduced motion, screen-reader headings), bundle check (Vanta/three/GSAP plugins lazy where possible; report bundle sizes before vs after), cross-route scroll/back-button tests, README "Motion" section, update `ASSUMPTIONS.md`.
- **M8 (verification, do not skip):** run the full test suite and production build; start both servers; walk the **entire flow in mock mode** (register, onboarding, home, course, lesson, summary, insights, profile); confirm no console errors, no duplicate Lenis/Vanta instances after repeated route changes (check for leaks), reduced-motion mode works, Vanta fallback works with WebGL blocked, and tracker FPS is not degraded by the animations on the lesson page. Fix everything found.

# 10. DEFINITION OF DONE

- [ ] Lenis, GSAP and Vanta are installed from npm, wired as in Section 1, and actually used on the pages in Section 3.
- [ ] All existing tests pass; no changes to `shared/`, `backend/` or tracking internals; privacy test still passes.
- [ ] Landing page `/` exists with a working GSAP scroll story and Vanta hero.
- [ ] Vanta appears only on landing, onboarding and auth pages, with working fallbacks, and is destroyed on unmount (no leaks).
- [ ] Lesson page has the motion described in Section 5, Focus mode works, and the performance guard degrades motion automatically.
- [ ] `prefers-reduced-motion` and the in-app Reduce motion toggle both work.
- [ ] The design skills were used (or the fallback applied and logged), and every page passed the web design guidelines audit.
- [ ] `npm run build` passes; bundle size report included.

# FINAL REPORT FORMAT

Reply with: (1) what was built per page (one line each), (2) library versions used and any version pinning (especially `three` for Vanta) and why, (3) test and build results, (4) bundle size before/after, (5) which design skills were used and the audit result, (6) deviations and assumptions, (7) known limitations, (8) how to run it.
