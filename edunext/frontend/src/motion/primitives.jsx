import { useEffect, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap, ScrollTrigger, SplitText } from './gsap.js';
import { MOTION } from './motionConfig.js';
import { useReducedMotion } from './useReducedMotion.js';

/**
 * Reusable motion primitives. Every one is safe without JS and under reduced
 * motion: content renders visible by default and animations only *start from*
 * hidden once GSAP is ready. useGSAP(scope) cleans up tweens/triggers on unmount
 * and is StrictMode double-mount safe.
 */

// --- Reveal safety helpers ---------------------------------------------------
// Scroll-reveal entrances (Reveal/Stagger) animate `from { opacity: 0 }`, which
// GSAP writes to the element immediately. If the ScrollTrigger that is supposed
// to play the tween never fires — e.g. its positions were computed against a
// stale layout because the list was rendered *after* an async fetch — the tween
// can be left sitting at opacity 0 and the content stays invisible. These helpers
// guarantee a final visible state no matter what.

const REVEAL_SAFETY_BUFFER_MS = 800;

// Coalesce ScrollTrigger refreshes: when several reveals mount in the same frame
// (e.g. a page full of sections), recompute trigger positions once, after layout.
let refreshQueued = false;
function scheduleScrollTriggerRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    try {
      ScrollTrigger.refresh();
    } catch {
      /* ignore */
    }
  });
}

/** Final-state guarantee: make targets fully visible and drop inline tween props. */
export function forceRevealed(targets) {
  try {
    gsap.set(targets, { opacity: 1, y: 0, clearProps: 'opacity,transform' });
  } catch {
    /* ignore — targets may already be gone */
  }
}

/**
 * Is the element within the viewport (so a reveal *should* already have played)?
 * A degenerate/zero rect (e.g. jsdom, or an element not yet laid out) is treated
 * as on-screen, so geometry we can't read never leaves content hidden.
 */
export function isElementOnScreen(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return true;
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement?.clientHeight || 0;
  if (r.width === 0 && r.height === 0 && r.top === 0 && r.bottom === 0) return true;
  return r.top < vh && r.bottom > 0;
}

/**
 * Create a guarded reveal tween. Refreshes ScrollTrigger (so async-mounted lists
 * get correct positions), clears inline props on completion, and arms a safety
 * timeout that forces the final visible state if the tween hasn't completed and
 * the group is on-screen. Returns a cleanup fn (kills tween, trigger, timeout).
 */
function armReveal({ el, targets, y, stagger = 0, delay = 0, once, reduced, immediate = false }) {
  const list = targets;
  const count = list?.length ?? 1;
  if (reduced || !el || !count) {
    forceRevealed(list);
    return () => {};
  }
  let completed = false;
  let tween;
  try {
    tween = gsap.from(list, {
      opacity: 0,
      y,
      duration: MOTION.dur.base,
      delay,
      ease: MOTION.ease.out,
      stagger,
      // `immediate` content (primary lists that load async — Home, Course,
      // Insights) animates on mount with NO ScrollTrigger, so a stale/failed
      // trigger can never leave it stuck hidden. Scroll-reveal (Landing) keeps
      // the trigger.
      ...(immediate ? {} : { scrollTrigger: { trigger: el, start: MOTION.reveal.start, once } }),
      onComplete: () => {
        completed = true;
        gsap.set(list, { clearProps: 'opacity,transform' });
      },
    });
    // The list may have mounted after the last route-change ScrollTrigger.refresh
    // (it loaded from the API). Recompute trigger positions now that the real
    // content is laid out, otherwise an in-view reveal can fail to fire.
    if (!immediate) scheduleScrollTriggerRefresh();
  } catch {
    forceRevealed(list);
    return () => {};
  }
  const lifeMs = (MOTION.dur.base + delay + stagger * Math.max(0, count - 1)) * 1000;
  const safety = setTimeout(() => {
    if (!completed && isElementOnScreen(el)) forceRevealed(list);
  }, lifeMs + REVEAL_SAFETY_BUFFER_MS);
  return () => {
    clearTimeout(safety);
    tween?.scrollTrigger?.kill();
    tween?.kill();
  };
}

// --- Reveal: fade + rise into view on scroll ---------------------------------
export function Reveal({ children, as: Tag = 'div', y = MOTION.reveal.y, delay = 0, className = '', once = true, immediate = false }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  useGSAP(
    () => armReveal({ el: ref.current, targets: ref.current ? [ref.current] : [], y, delay, once, reduced, immediate }),
    { dependencies: [reduced], scope: ref }
  );
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}

// --- Stagger: reveal direct children in sequence -----------------------------
export function Stagger({ children, as: Tag = 'div', stagger = MOTION.stagger.base, y = MOTION.reveal.y, className = '', once = true, immediate = false }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  // Re-run (and re-reveal) whenever the number of children changes — e.g. a
  // course list that grows after the API responds, or a newly added course.
  const count = Array.isArray(children) ? children.filter(Boolean).length : children ? 1 : 0;
  useGSAP(
    () => {
      const el = ref.current;
      const kids = el ? Array.from(el.children) : [];
      return armReveal({ el, targets: kids, y, stagger, once, reduced, immediate });
    },
    { dependencies: [reduced, count], scope: ref }
  );
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}

// --- SplitHeading: animate a heading per-word, keeping it readable to AT ------
export function SplitHeading({ children, as: Tag = 'h1', className = '', delay = 0 }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  useGSAP(
    () => {
      if (reduced || !ref.current) return;
      const split = new SplitText(ref.current, { type: 'words', wordsClass: 'split-word' });
      gsap.set(ref.current, { opacity: 1 });
      // Promote the words to their own layer only for the duration of the reveal,
      // then clear it so we don't pin a GPU layer per word forever.
      gsap.set(split.words, { willChange: 'transform' });
      gsap.from(split.words, {
        opacity: 0,
        y: '0.6em',
        rotateX: -40,
        transformOrigin: '0% 50%',
        duration: MOTION.dur.slow,
        ease: MOTION.ease.out,
        stagger: MOTION.stagger.base,
        delay,
        onComplete: () => gsap.set(split.words, { willChange: 'auto' }),
      });
      return () => split.revert();
    },
    { dependencies: [reduced], scope: ref }
  );
  // aria-label keeps the full text available; the split <span>s are decorative.
  const label = typeof children === 'string' ? children : undefined;
  return (
    <Tag ref={ref} className={className} aria-label={label}>
      {children}
    </Tag>
  );
}

// --- Magnetic: subtle pointer-follow for a CTA -------------------------------
export function Magnetic({ children, strength = 0.35, className = '' }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  useGSAP(
    () => {
      if (reduced || !ref.current) return;
      const el = ref.current;
      const xTo = gsap.quickTo(el, 'x', { duration: MOTION.dur.fast, ease: MOTION.ease.out });
      const yTo = gsap.quickTo(el, 'y', { duration: MOTION.dur.fast, ease: MOTION.ease.out });
      const onMove = (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * strength);
        yTo((e.clientY - (r.top + r.height / 2)) * strength);
      };
      const reset = () => {
        xTo(0);
        yTo(0);
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerleave', reset);
      return () => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerleave', reset);
      };
    },
    { dependencies: [reduced], scope: ref }
  );
  return (
    <div ref={ref} className={`inline-block ${className}`}>
      {children}
    </div>
  );
}

// --- CountUp: animate a number when it scrolls into view ---------------------
export function CountUp({ to, from = 0, decimals = 0, suffix = '', duration = MOTION.dur.slow, className = '' }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? to : from);
  useGSAP(
    () => {
      if (reduced || !ref.current) {
        setDisplay(to);
        return;
      }
      const obj = { v: from };
      gsap.to(obj, {
        v: to,
        duration,
        ease: MOTION.ease.out,
        scrollTrigger: { trigger: ref.current, start: MOTION.reveal.start, once: true },
        onUpdate: () => setDisplay(obj.v),
      });
    },
    { dependencies: [reduced, to], scope: ref }
  );
  return (
    <span ref={ref} className={className}>
      {Number(display).toFixed(decimals)}
      {suffix}
    </span>
  );
}

// --- PageTransition: fade/slide routed content in on mount -------------------
export function PageTransition({ children, className = '' }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  useGSAP(
    () => {
      if (reduced || !ref.current) return;
      gsap.from(ref.current, {
        opacity: 0,
        y: 12,
        duration: MOTION.dur.page,
        ease: MOTION.ease.out,
        clearProps: 'transform',
      });
    },
    { dependencies: [reduced], scope: ref }
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

// --- InlineError: gentle entrance + soft shake for form validation ----------
export function InlineError({ children, id, className = '' }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  useGSAP(
    () => {
      if (!ref.current) return;
      if (reduced) {
        gsap.set(ref.current, { opacity: 1, x: 0 });
        return;
      }
      const tl = gsap.timeline();
      tl.fromTo(ref.current, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: MOTION.dur.fast, ease: MOTION.ease.out });
      // A small, non-jarring left/right settle (not a harsh shake).
      tl.fromTo(ref.current, { x: -5 }, { x: 0, duration: 0.3, ease: 'elastic.out(1,0.5)' }, '<');
    },
    { dependencies: [children], scope: ref }
  );
  return (
    <p ref={ref} id={id} role="alert" className={`text-sm text-rose-400 ${className}`}>
      {children}
    </p>
  );
}

// --- TiltCard: pointer 3D tilt + a soft spotlight that follows the cursor ------
export function TiltCard({ children, className = '', max = 8, as: Tag = 'div' }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  useGSAP(
    () => {
      if (reduced || !ref.current) return;
      const el = ref.current;
      const canHover = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
      if (!canHover) return;
      gsap.set(el, { transformPerspective: 700 });
      const rx = gsap.quickTo(el, 'rotationX', { duration: 0.3, ease: MOTION.ease.out });
      const ry = gsap.quickTo(el, 'rotationY', { duration: 0.3, ease: MOTION.ease.out });
      const onMove = (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        ry((px - 0.5) * max * 2);
        rx((0.5 - py) * max * 2);
        el.style.setProperty('--mx', `${px * 100}%`);
        el.style.setProperty('--my', `${py * 100}%`);
      };
      const reset = () => {
        rx(0);
        ry(0);
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerleave', reset);
      return () => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerleave', reset);
      };
    },
    { dependencies: [reduced], scope: ref }
  );
  return (
    <Tag ref={ref} className={`tilt-card ${className}`}>
      {children}
    </Tag>
  );
}

// --- Scramble: short, subtle character-scramble into the final text ------------
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#%&*';
export function Scramble({ text, as: Tag = 'span', className = '', duration = 0.6 }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  useGSAP(
    () => {
      if (!ref.current) return;
      const node = ref.current;
      if (reduced) {
        node.textContent = text;
        return;
      }
      const target = String(text);
      const obj = { p: 0 };
      const tween = gsap.to(obj, {
        p: 1,
        duration,
        ease: 'none',
        onUpdate: () => {
          const reveal = Math.floor(obj.p * target.length);
          let out = '';
          for (let i = 0; i < target.length; i++) {
            out += i < reveal || target[i] === ' ' ? target[i] : SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0];
          }
          node.textContent = out;
        },
        onComplete: () => {
          node.textContent = target;
        },
      });
      return () => tween.kill();
    },
    { dependencies: [text, reduced], scope: ref }
  );
  // Visible text scrambles; aria-label carries the stable, readable value.
  return (
    <Tag ref={ref} className={className} aria-label={String(text)}>
      {text}
    </Tag>
  );
}

// Re-export for convenience.
export { ScrollTrigger };
