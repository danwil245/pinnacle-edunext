import { useEffect, useRef, useState } from 'react';
import { loadYouTubeApi, createYouTubeController, ytStateToString, thumbnailUrl } from './mediaController.js';

/** Human-readable reason for a YouTube failure, shown with the raw code. */
function describeError(code) {
  const map = {
    2: 'the video ID was rejected',
    5: 'the video can’t play in this player',
    100: 'the video was removed or made private',
    101: 'the owner doesn’t allow it to be embedded',
    150: 'the owner doesn’t allow it to be embedded',
    153: 'the page referrer was missing',
    timeout: 'it took too long to load',
    api: 'the YouTube player script failed to load',
  };
  return map[code] || 'an unknown error occurred';
}

/**
 * A privacy-enhanced YouTube player for a lesson. Shows only the thumbnail until
 * the learner clicks play (no player, no YouTube requests, faster course pages);
 * then lazy-loads the IFrame API once and creates ONE player on the
 * youtube-nocookie host. Exposes a MediaController via `onController`, maps player
 * states to onState/onEnded, and on any embed error shows a friendly fallback
 * (never a blank box). Destroys the player on unmount.
 *
 * The player is created in an effect keyed only on [started, videoId] — NOT on
 * the UI status — so transitioning to "ready"/"error" never tears down the live
 * player (an earlier bug: onReady set the phase, which re-ran the create effect
 * and its cleanup destroyed the player right after it loaded → black box).
 */
export default function YouTubePlayer({ videoId, startSeconds = 0, title, onController, onState, onEnded, onError, onFallback }) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const controllerRef = useRef(null);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [errorCode, setErrorCode] = useState(null);

  // Reset to the thumbnail when the video changes (e.g. variant switch).
  useEffect(() => {
    setStarted(false);
    setStatus('idle');
    setErrorCode(null);
  }, [videoId]);

  useEffect(() => {
    if (!started) return undefined;
    let cancelled = false;
    let ready = false;
    setStatus('loading');
    setErrorCode(null);

    const fail = (code) => {
      if (cancelled) return;
      setErrorCode(code);
      setStatus('error');
      onError?.(code);
    };

    const timer = setTimeout(() => { if (!cancelled && !ready) fail('timeout'); }, 14000);

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
              ready = true;
              clearTimeout(timer);
              setStatus('ready');
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
              fail(e?.data ?? 'error');
            },
          },
        });
      })
      .catch(() => fail('api'));

    return () => {
      cancelled = true;
      clearTimeout(timer);
      try { controllerRef.current?.destroy(); } catch { /* ignore */ }
      controllerRef.current = null;
      playerRef.current = null;
      onController?.(null);
    };
    // Intentionally NOT keyed on `status`: only (re)create the player when the
    // learner starts it or the video changes — never on a ready/error UI update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, videoId]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
      {!started && (
        <button
          type="button"
          onClick={() => setStarted(true)}
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

      {started && status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-sm text-slate-300">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" aria-hidden />
        </div>
      )}

      {/* The API replaces this node with the iframe. Stays mounted while the
          player is alive (loading/ready) so a status change never unmounts it. */}
      {started && status !== 'error' && (
        <div className="absolute inset-0 h-full w-full">
          <div ref={hostRef} className="h-full w-full" />
        </div>
      )}

      {started && status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-300">
          <p className="max-w-sm text-sm">
            This video can’t be played here — {describeError(errorCode)}
            {errorCode != null && <span className="text-slate-400"> (error {String(errorCode)})</span>}.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {onFallback && (
              <button className="btn-ghost" onClick={onFallback}>Use the other version</button>
            )}
            <button
              className="btn-ghost"
              onClick={() => { setStarted(false); setStatus('idle'); setErrorCode(null); }}
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
