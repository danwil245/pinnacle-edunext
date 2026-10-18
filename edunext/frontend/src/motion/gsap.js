// Single GSAP entry point. Plugins are registered exactly once here; every other
// module imports `gsap` (and the plugins) from this file so registration can't be
// duplicated or missed. GSAP 3.13+ ships all plugins free in the public npm package.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

// Tiny debug handle so the perf harness (scripts/perf/measure.mjs) can read the
// live ScrollTrigger instance count from the page. Read-only reference to the
// already-global plugin singleton — no behavioural or visual effect.
if (typeof window !== 'undefined') {
  window.__edunextPerf = { gsap, ScrollTrigger };
}

export { gsap, ScrollTrigger, SplitText };
