/**
 * Branded placeholder shown in place of a lesson/calibration clip. The demo
 * content ships without real videos (and must not fetch remote assets), so rather
 * than requesting a dead URL and showing a "couldn't load" error, we render an
 * intentional, on-brand panel with a slow transform-only sheen. The calibration /
 * lesson measurement does not depend on the video playing, so nothing is lost.
 */
const DEAD_HOSTS = ['gtv-videos-bucket', 'storage.googleapis.com/gtv'];

/** True only for a self-hosted/real clip URL — the dead sample host returns false. */
export function isPlayableSrc(src) {
  return !!src && !DEAD_HOSTS.some((h) => src.includes(h));
}

export default function ClipPlaceholder({ title, caption = 'Simulated lesson clip — placeholder content', className = '' }) {
  return (
    <div className={`clip-placeholder relative grid aspect-video w-full place-items-center overflow-hidden ${className}`} aria-hidden>
      <div className="relative z-10 flex flex-col items-center gap-3 px-6 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full border border-white/20 bg-white/10 text-xl text-sky-200">▶</span>
        {title && <div className="font-display text-lg font-semibold text-slate-100">{title}</div>}
        <div className="text-[0.7rem] uppercase tracking-[0.2em] text-slate-400">{caption}</div>
      </div>
    </div>
  );
}
