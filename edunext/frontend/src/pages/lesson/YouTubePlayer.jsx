import { useEffect, useRef, useState } from 'react';
import { loadYouTubeApi, createYouTubeController, ytStateToString, thumbnailUrl } from './mediaController.js';

/**
 * A privacy-enhanced YouTube player for a lesson. Shows only the thumbnail until
 * the learner clicks play (no player, no YouTube requests, faster course pages);
 * then lazy-loads the IFrame API once and creates ONE player on the
 * youtube-nocookie host. Exposes a MediaController via `onController`, maps player
 * states to onState/onEnded, and on any embed error shows a friendly fallback
 * (never a blank box). Destroys the player on unmount.
 */
export default function YouTubePlayer({ videoId, startSeconds = 0, title, onController, onState, onEnded, onError, onFallback }) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const controllerRef = useRef(null);
  const [phase, setPhase] = useState('thumb'); // thumb | loading | ready | error

  // Reset to the thumbnail when the video changes (e.g. variant switch).
  useEffect(() => {
    setPhase('thumb');
  }, [videoId]);

  useEffect(() => {
    if (phase !== 'loading') return undefined;
    let cancelled = false;
    let timer = setTimeout(() => { if (!cancelled && phase !== 'ready') { setPhase('error'); onError?.('timeout'); } }, 14000);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        playerRef.current = new YT.Player(hostRef.current, {
          videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
            enablejsapi: 1,
            origin: window.location.origin,
            start: Math.max(0, Math.floor(startSeconds || 0)),
            autoplay: 1,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              clearTimeout(timer);
              setPhase('ready');
              const ctrl = createYouTubeController(playerRef.current);
              controllerRef.current = ctrl;
              onController?.(ctrl);
              playerRef.current.playVideo?.();
            },
            onStateChange: (e) => {
              const s = ytStateToString(e.data, window.YT);
              if (s) {
                controllerRef.current?.emit(s);
                onState?.(s);
                if (s === 'ended') onEnded?.();
              }
            },
            onError: (e) => {
              clearTimeout(timer);
              setPhase('error');
              onError?.(e?.data ?? 'error');
            },
          },
        });
      })
      .catch(() => { if (!cancelled) { setPhase('error'); onError?.('api'); } });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      try { controllerRef.current?.destroy(); } catch { /* ignore */ }
      controllerRef.current = null;
      playerRef.current = null;
      onController?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, videoId]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
      {phase === 'thumb' && (
        <button
          type="button"
          onClick={() => setPhase('loading')}
          className="group absolute inset-0 h-full w-full"
          aria-label={title ? `Play: ${title}` : 'Play video'}
        >
          <img src={thumbnailUrl(videoId)} alt="" className="h-full w-full object-cover opacity-90" loading="lazy" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-black/60 text-2xl text-white ring-1 ring-white/30 transition group-hover:scale-105 group-hover:bg-black/75">
              ▶
            </span>
          </span>
        </button>
      )}

      {phase === 'loading' && (
        <div className="absolute inset-0 grid place-items-center text-sm text-slate-300">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" aria-hidden />
        </div>
      )}

      {/* The API replaces this node with the iframe. Kept mounted for loading/ready. */}
      {(phase === 'loading' || phase === 'ready') && (
        <div className="absolute inset-0 h-full w-full">
          <div ref={hostRef} className="h-full w-full" />
        </div>
      )}

      {phase === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-300">
          <p className="max-w-sm text-sm">This video can’t be played here (it may be unavailable or have embedding disabled).</p>
          <div className="flex flex-wrap justify-center gap-2">
            {onFallback && (
              <button className="btn-ghost" onClick={onFallback}>Use the other version</button>
            )}
            <button className="btn-ghost" onClick={() => setPhase('thumb')}>Try again</button>
          </div>
        </div>
      )}
    </div>
  );
}
