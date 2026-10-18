/**
 * Ambient background polish for non-lesson pages: two soft glow blobs that drift
 * on a very slow transform-only CSS loop, plus a static grain overlay. No animated
 * filters, no box-shadow animation. Sits on its own `-z` layer, never intercepts
 * pointer events, and is paused flat under reduced motion by the global CSS rule.
 * NEVER rendered on the lesson page (see Section 4 rules).
 */
export default function Ambient({ className = '' }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}>
      <div
        className="ambient-blob animate-drift-a"
        style={{ top: '-8%', left: '-6%', width: '46vw', height: '46vw', background: 'radial-gradient(circle, rgba(14,165,233,0.22), transparent 70%)' }}
      />
      <div
        className="ambient-blob animate-drift-b"
        style={{ bottom: '-12%', right: '-8%', width: '52vw', height: '52vw', background: 'radial-gradient(circle, rgba(99,102,241,0.18), transparent 70%)' }}
      />
      <div className="absolute inset-0 edunext-grain opacity-[0.035]" />
    </div>
  );
}
