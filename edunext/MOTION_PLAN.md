# MOTION_PLAN — EduNext frontend motion rebuild (Lenis + GSAP + Vanta)

Scope: a **front-end redesign + motion layer** over `frontend/`. No changes to
`shared/`, `backend/`, or tracking internals (`frontend/src/tracking/*`,
`useFaceMesh`, tick builder, engagement/curation). Existing tests must keep
passing; the privacy invariant (no frames/video leave the browser, no runtime
remote assets) holds — fonts and libs are bundled via npm; fonts self-hosted.

## Libraries (verified against installed packages)

| lib | version | import | notes |
|---|---|---|---|
| lenis | 1.3.27 | `import Lenis from 'lenis'` + `import 'lenis/dist/lenis.css'` | one instance, driven by gsap.ticker |
| gsap | 3.15.0 | `import gsap from 'gsap'`, `gsap/ScrollTrigger`, `gsap/SplitText`, `gsap/Flip` | all plugins free in public npm |
| @gsap/react | 2.1.2 | `import { useGSAP } from '@gsap/react'` | scoped, auto-cleanup, StrictMode-safe |
| vanta | 0.5.24 | `import WAVES from 'vanta/dist/vanta.waves.min'` (lazy) | needs THREE passed explicitly |
| three | **0.134.0 (pinned)** | `import * as THREE from 'three'` (lazy) | Vanta 0.5.24 targets r134; newer three breaks it |

Vanta effect chosen: **WAVES** (dark base + single sky accent; fits the calm
"focus" brand better than Fog, used consistently on landing/onboarding/auth).

## `frontend/src/motion/` foundation

- `gsap.js` — register ScrollTrigger/SplitText/Flip once; export the single `gsap`.
- `motionConfig.js` — one frozen object: durations, eases, stagger, Vanta settings,
  perf-budget thresholds. No magic numbers elsewhere.
- `useReducedMotion.js` — OS `prefers-reduced-motion` + persisted in-app toggle
  (localStorage, try/catch), broadcast so all consumers react live.
- `SmoothScrollProvider.jsx` — one Lenis instance wired to `gsap.ticker` +
  `ScrollTrigger.update`; disabled under reduced motion; scroll-to-top +
  `ScrollTrigger.refresh()` on route change; exposes `lenis` via context.
- `VantaBackground.jsx` — lazy `import()` of vanta+three; destroy on unmount;
  fallbacks (reduced motion / no WebGL / low-power / hidden tab / perf guard).
- `useMotionBudget.js` — rAF frame-time monitor; degrade flag + context.
- Primitives: `Reveal`, `SplitHeading`, `Stagger`, `PageTransition`, `Magnetic`,
  `CountUp` — all honor reduced motion and render content visible without JS.

## Page-by-page motion plan

| page | motion |
|---|---|
| **/** (new landing) | Vanta WAVES hero + SplitHeading + CTA; pinned/scrubbed scroll story (calibrate→sense→adapt→learn); 5-zone reveal; privacy; 3-signals; limitations strip; footer (link to /home for logged-in) |
| **Login / Register** | calm card entrance; inline validation color/shake (gentle); optional light Vanta |
| **Onboarding** | Vanta bg; animated stepper (eased progress); animated blink counter + progress ring; gentle no-face transition; result reveal — staggered zone table + CountUp confidence |
| **Home** | staggered card reveal, hover lift, "why" chips, skeletons |
| **Course** | breadcrumb/header reveal, staggered lesson list |
| **Profile** | section reveals; **Reduce motion toggle** lives here |
| **Insights** | section reveals; Recharts animate-in on first view |
| **Summary** | section reveals; line chart reveal; timeline markers appear in sequence |
| **Lesson** | animated chrome/HUD/prompts/notices; variant **crossfade**; animated engagement gauge; calm break overlay. NO looping motion near content, NO WebGL. **Focus mode** toggle. `data-lenis-prevent` on scroll panels. `useMotionBudget` auto-degrade. |
| **Global** | PageTransition on route change; scroll-aware navbar; animated `aria-live` toasts; custom scrollbar; focus-visible |

## Risks / guards

- **Tracker must not remount**: `TrackingProvider` stays above the router and the
  camera overlay is never wrapped in anything that unmounts on navigation.
  PageTransition only wraps routed page content, never the provider/overlay.
- **Main-thread contention** on the lesson page: `useMotionBudget` degrades motion
  if tracking FPS drops; no WebGL on the lesson route (asserted).
- **Vanta/three bundle size**: lazy-loaded via dynamic `import()` so they stay out
  of the main chunk.
- **Reduced motion / no-JS**: initial hidden states applied by JS only; content is
  readable without animation.

## Phases

M0 plan+baseline · M1 libs+foundation · M2 design system+chrome · M3 Vanta+landing
· M4 auth+onboarding · M5 content pages · M6 lesson+perf guard · M7 polish+audit ·
M8 verify. Commit after each; every phase ends green (`npm test` + `npm run build`).

## Design skills found

See `ASSUMPTIONS.md` → "Motion rebuild". Checked `.claude/skills/` and
`.agents/skills/` at the repo root.
