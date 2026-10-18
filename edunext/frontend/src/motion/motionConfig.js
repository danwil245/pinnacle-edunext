// The single source of truth for every motion value. No magic durations/eases/
// stagger numbers anywhere else in the motion layer — import from here. Frozen so
// it can't drift at runtime.
export const MOTION = Object.freeze({
  // Easing family (one family across the whole app).
  ease: {
    out: 'power3.out',
    inOut: 'power2.inOut',
    soft: 'power1.out',
  },
  // Durations (seconds). Entrances 0.4–0.8; feedback < 0.2.
  dur: Object.freeze({
    fast: 0.18,
    base: 0.5,
    slow: 0.8,
    page: 0.4,
  }),
  // Stagger between items in a group.
  stagger: Object.freeze({
    tight: 0.05,
    base: 0.08,
    loose: 0.12,
  }),
  // Reveal defaults.
  reveal: Object.freeze({
    y: 24,
    start: 'top 85%',
  }),
  // Lenis smooth-scroll.
  lenis: Object.freeze({
    duration: 1.1,
    // eslint-disable-next-line no-restricted-properties
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // expo-out
    wheelMultiplier: 1,
    touchMultiplier: 1.6,
  }),
  // Vanta WAVES settings (colors are dark base + single sky accent).
  vanta: Object.freeze({
    effect: 'waves',
    color: 0x0b2545, // deep navy wave
    shininess: 28,
    waveHeight: 14,
    waveSpeed: 0.7,
    zoom: 0.92,
    backgroundColor: 0x070b16, // page base (slate-950-ish)
  }),
  // Performance guard thresholds (see useMotionBudget).
  budget: Object.freeze({
    frameBudgetMs: 32, // ~30fps; above this = slow frame
    slowFramesToTrip: 90, // ~ consecutive slow frames (~1.5s @ a degraded 60hz sample)
    sampleWindow: 60, // frames averaged
    recoverAfterMs: 8000,
  }),
});

export default MOTION;
