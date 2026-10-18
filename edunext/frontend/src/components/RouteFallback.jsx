/**
 * Suspense fallback shown while a route chunk loads. A calm, on-brand skeleton
 * built from the shared `.skeleton` class (a single transformed gradient sweep,
 * paused automatically under reduced motion by the global CSS rule). No layout
 * shift: it reserves roughly the shape of a typical page header + cards.
 */
export default function RouteFallback() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="skeleton mb-6 h-9 w-2/3 max-w-sm" />
      <div className="skeleton mb-10 h-5 w-1/2 max-w-xs" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-36 w-full" />
        ))}
      </div>
    </div>
  );
}
