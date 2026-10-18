import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import { ATTENTION_ZONES } from '@edunext/shared';
import { gsap } from '../motion/gsap.js';
import { MOTION } from '../motion/motionConfig.js';
import { useReducedMotion } from '../motion/useReducedMotion.js';
import VantaBackground from '../motion/VantaBackground.jsx';
import Ambient from '../motion/Ambient.jsx';
import ScrollProgress from '../motion/ScrollProgress.jsx';
import Marquee from '../motion/Marquee.jsx';
import { SplitHeading, Reveal, Stagger, Magnetic, TiltCard } from '../motion/primitives.jsx';

const STORY = [
  {
    k: 'calibrate',
    title: 'Calibrate',
    body: 'A short, private calibration learns your personal blink baseline — everyone blinks at a different rate, so we measure yours, not an average.',
  },
  {
    k: 'sense',
    title: 'Sense',
    body: 'During a lesson your blink rate and facial expression are read on-device and combined into a single engagement estimate — updated every few seconds.',
  },
  {
    k: 'adapt',
    title: 'Adapt',
    body: 'If attention dips, EduNext gently adapts: slow down, replay, suggest a break, or switch how the lesson is taught — always your choice.',
  },
  {
    k: 'learn',
    title: 'Learn your way',
    body: 'Over time it notices which format you engage with more and leans into it — a preference signal, not a label stamped on you.',
  },
];

const SIGNALS = [
  { title: 'Blink rate', weight: '45%', body: 'Your personal blink zones map to an attention state.' },
  { title: 'Expression', weight: '35%', body: 'Seven facial expressions, baseline-subtracted, grouped into learning cues.' },
  { title: 'Your feedback', weight: '20%', body: 'A quick thumbs up/down keeps the estimate honest.' },
];

const REFERENCES = [
  'Nakano et al. — blink timing tracks attentional engagement',
  'Ranti et al. — blink rate as a proxy for cognitive load',
  'Maffei & Angrilli — spontaneous eye-blink and emotional state',
  'Ekman & Friesen — basic facial expressions of emotion',
  'Csikszentmihalyi — flow and sustained engagement',
];

const LIMITS = [
  'Estimates, not diagnoses.',
  'Blink rate shifts with lighting, screens, dry eyes, and caffeine.',
  'Expression ≠ inner state — it is a heuristic.',
  'Course content here is placeholder, clearly labelled.',
];

export default function Landing() {
  return (
    <div className="relative">
      {/* Fixed scroll-progress indicator across the whole landing page. */}
      <ScrollProgress className="fixed inset-x-0 top-0 z-50 h-1" />
      {/* Ambient glow blobs + grain behind everything below the hero. */}
      <Ambient className="fixed" />
      <Hero />
      <ScrollStory />
      <Zones />
      <Signals />
      <section className="border-y border-white/5 py-6">
        <Marquee items={REFERENCES} />
      </section>
      <Privacy />
      <Limits />
      <LandingFooter />
    </div>
  );
}

function Hero() {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  useGSAP(
    () => {
      if (reduced || !ref.current) return;
      // Scrub the hero away as you scroll: the whole block eases up + scales, and
      // the inner layers move at different speeds for depth. Transform/opacity only.
      const tl = gsap.timeline({
        scrollTrigger: { trigger: ref.current, start: 'top top', end: 'bottom top', scrub: true },
      });
      tl.to('[data-hero-inner]', { yPercent: -12, scale: 1.06, autoAlpha: 0.15, ease: 'none' }, 0);
      tl.to('[data-hero-pill]', { yPercent: -60, ease: 'none' }, 0);
      tl.to('[data-hero-cue]', { autoAlpha: 0, ease: 'none' }, 0);
    },
    { dependencies: [reduced], scope: ref }
  );
  return (
    <header ref={ref} className="relative grid min-h-[92vh] place-items-center overflow-hidden px-6 text-center">
      <VantaBackground />
      <div data-hero-inner className="relative z-10 mx-auto max-w-3xl space-y-7">
        <span data-hero-pill className="pill border-sky-400/30 bg-sky-500/10 text-sky-200">100% on-device · video never uploaded</span>
        <SplitHeading className="font-display text-5xl font-bold leading-[1.05] sm:text-7xl">
          Learning that pays attention back
        </SplitHeading>
        <Reveal as="p" delay={0.2} className="mx-auto max-w-xl text-lg text-slate-300">
          EduNext estimates your focus from your blink rate and expression, in your browser, and
          adapts each lesson to the way you actually engage.
        </Reveal>
        <Reveal delay={0.35} className="flex flex-wrap justify-center gap-3">
          <Magnetic>
            <Link to="/register" className="btn-primary px-6 text-base shadow-glow">
              Get started
            </Link>
          </Magnetic>
          <Link to="/login" className="btn-ghost px-6 text-base">
            Sign in
          </Link>
        </Reveal>
      </div>
      <div data-hero-cue className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-xs uppercase tracking-widest text-slate-400">
        Scroll to see how it works
      </div>
    </header>
  );
}

/**
 * The core scroll story: a pinned section that scrubs through calibrate -> sense
 * -> adapt -> learn as you scroll. Under reduced motion it collapses to a simple
 * stacked list (no pin, no scrub) so the content is always readable.
 */
function ScrollStory() {
  const root = useRef(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      if (reduced || !root.current) return;
      const panels = gsap.utils.toArray('[data-story-panel]', root.current);
      const steps = gsap.utils.toArray('[data-story-step]', root.current);

      gsap.set(steps, { autoAlpha: 0, y: 24 });
      gsap.set(steps[0], { autoAlpha: 1, y: 0 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: root.current,
          start: 'top top',
          end: `+=${panels.length * 60}%`,
          scrub: 0.6,
          pin: true,
          anticipatePin: 1,
        },
      });

      steps.forEach((step, i) => {
        if (i === 0) return;
        tl.to(steps[i - 1], { autoAlpha: 0, y: -24, duration: 0.4 }, '+=0.4')
          .fromTo(step, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.4 }, '<0.1')
          .to(
            root.current.querySelector('[data-story-progress]'),
            { scaleX: i / (steps.length - 1), duration: 0.4 },
            '<'
          );
      });
    },
    { dependencies: [reduced], scope: root }
  );

  if (reduced) {
    return (
      <section className="mx-auto max-w-3xl space-y-10 px-6 py-20">
        <h2 className="text-center font-display text-3xl font-bold">How it works</h2>
        {STORY.map((s, i) => (
          <div key={s.k} className="card">
            <div className="mb-1 text-sm font-semibold text-sky-300">Step {i + 1}</div>
            <h3 className="font-display text-2xl">{s.title}</h3>
            <p className="mt-2 text-slate-300">{s.body}</p>
          </div>
        ))}
      </section>
    );
  }

  return (
    <section ref={root} className="relative h-screen overflow-hidden" aria-label="How EduNext works">
      <div className="mx-auto flex h-full max-w-3xl flex-col justify-center px-6">
        <div className="mb-8 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div data-story-progress className="h-full origin-left scale-x-0 rounded-full bg-sky-400" />
        </div>
        <div className="relative min-h-[14rem]" data-story-panel>
          {STORY.map((s, i) => (
            <div key={s.k} data-story-step className="absolute inset-0">
              <div className="text-sm font-semibold text-sky-300">
                Step {i + 1} of {STORY.length}
              </div>
              <h3 className="mt-1 font-display text-4xl font-bold sm:text-5xl">{s.title}</h3>
              <p className="mt-4 max-w-xl text-lg text-slate-300">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Zones() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-20">
      <Reveal>
        <h2 className="text-center font-display text-3xl font-bold">Five attention zones</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-slate-400">
          Your blink rate maps onto a spectrum. The boundaries are personalised to you during
          calibration.
        </p>
      </Reveal>
      <Stagger className="mt-10 grid gap-3 sm:grid-cols-5">
        {ATTENTION_ZONES.map((z) => (
          <TiltCard key={z.key} className="card flex flex-col items-center gap-2 text-center" max={10}>
            <span className="h-10 w-10 rounded-full" style={{ background: z.color, boxShadow: `0 0 24px ${z.color}66` }} aria-hidden />
            <div className="font-display font-semibold">{z.label}</div>
            {z.note && <div className="text-xs text-slate-500">{z.note}</div>}
          </TiltCard>
        ))}
      </Stagger>
    </section>
  );
}

/**
 * The three signals as a pinned, horizontally-scrubbed gallery with a parallax
 * layer behind each card. Under reduced motion it falls back to a plain stagger
 * grid so the content is fully readable with no pin and no horizontal scroll.
 */
function Signals() {
  const root = useRef(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      if (reduced || !root.current) return;
      const track = root.current.querySelector('[data-signals-track]');
      const cards = gsap.utils.toArray('[data-signal-card]', track);
      const distance = () => Math.max(0, track.scrollWidth - root.current.offsetWidth);

      const scrub = gsap.to(track, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: root.current,
          start: 'top top',
          end: () => '+=' + distance(),
          scrub: 0.6,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });

      // Parallax the big weight number inside each card against the horizontal move.
      cards.forEach((card) => {
        const art = card.querySelector('[data-signal-art]');
        if (!art) return;
        gsap.fromTo(
          art,
          { xPercent: -18 },
          {
            xPercent: 18,
            ease: 'none',
            scrollTrigger: { containerAnimation: scrub, trigger: card, start: 'left right', end: 'right left', scrub: true },
          }
        );
      });
    },
    { dependencies: [reduced], scope: root }
  );

  if (reduced) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="text-center font-display text-3xl font-bold">Three signals, one estimate</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-slate-400">
          A weighted blend — and when a signal is missing, the rest are re-weighted so the score stays meaningful.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {SIGNALS.map((s) => (
            <div key={s.title} className="card">
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-xl font-semibold">{s.title}</h3>
                <span className="font-mono text-sky-300">{s.weight}</span>
              </div>
              <p className="mt-2 text-sm text-slate-400">{s.body}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section ref={root} className="relative h-screen overflow-hidden" aria-label="Three signals, one estimate">
      <div className="pointer-events-none absolute left-1/2 top-12 z-10 -translate-x-1/2 px-6 text-center">
        <h2 className="font-display text-3xl font-bold">Three signals, one estimate</h2>
        <p className="mx-auto mt-2 max-w-xl text-slate-400">Scroll across — a weighted blend, re-weighted when a signal is missing.</p>
      </div>
      <div data-signals-track className="flex h-full items-center gap-[6vw] px-[14vw] will-change-transform">
        {SIGNALS.map((s, i) => (
          <div
            key={s.title}
            data-signal-card
            className="card relative flex h-72 w-[78vw] max-w-lg shrink-0 flex-col justify-end overflow-hidden sm:w-[46vw]"
          >
            <span data-signal-art aria-hidden className="pointer-events-none absolute -top-6 right-2 select-none font-display text-[9rem] font-bold leading-none text-sky-400/10">
              {s.weight}
            </span>
            <div className="relative z-10">
              <div className="text-sm font-semibold text-sky-300">Signal {i + 1} of {SIGNALS.length}</div>
              <h3 className="mt-1 font-display text-3xl font-semibold">{s.title}</h3>
              <div className="mt-1 font-mono text-sky-300">weight {s.weight}</div>
              <p className="mt-3 max-w-md text-slate-300">{s.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <Reveal className="card border-emerald-400/20 bg-emerald-500/[0.04] text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/15 text-2xl">
          🔒
        </div>
        <h2 className="font-display text-2xl font-bold">Your video never leaves your device</h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-300">
          All sensing runs in your browser. Only derived numbers — a blink rate, a zone, an emotion
          label, a score — are ever saved. A test in our codebase asserts the upload payload carries
          no image data. “Delete my data” removes your account and every related row.
        </p>
      </Reveal>
    </section>
  );
}

function Limits() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-16">
      <Reveal>
        <h2 className="mb-6 text-center font-display text-2xl font-bold text-slate-200">
          Honest about the limits
        </h2>
      </Reveal>
      <Stagger className="grid gap-3 sm:grid-cols-2" stagger={MOTION.stagger.tight}>
        {LIMITS.map((l) => (
          <div key={l} className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
            <span aria-hidden className="mt-0.5 text-amber-300">•</span>
            {l}
          </div>
        ))}
      </Stagger>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="relative overflow-hidden px-6 py-24 text-center">
      <Reveal className="relative z-10 mx-auto max-w-2xl space-y-6">
        <h2 className="font-display text-4xl font-bold">Ready to learn your way?</h2>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/register" className="btn-primary px-6 text-base">
            Create your account
          </Link>
          <Link to="/home" className="btn-ghost px-6 text-base">
            Go to my home
          </Link>
        </div>
        <p className="pt-6 text-xs text-slate-500">
          University project · SSN AI &amp; Education Technology. Learning-signal relationships are
          estimates, not diagnoses.
        </p>
      </Reveal>
    </footer>
  );
}
