/**
 * MediaController — the single interface the lesson session + curation use to
 * control playback, regardless of whether the media is a self-hosted HTML5 video
 * (calibration clips) or a YouTube IFrame player. Methods:
 *   play(), pause(), seekTo(seconds), getCurrentTime(), getDuration(),
 *   setRate(rate), getRate(), getAvailableRates(), onStateChange(cb)=>unsub,
 *   destroy().
 * State strings passed to onStateChange: 'playing' | 'paused' | 'buffering' | 'ended'.
 */

const DEFAULT_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Controller over a plain <video> element. */
export function createHtml5Controller(video) {
  const listeners = new Set();
  const emit = (s) => listeners.forEach((cb) => cb(s));
  const onPlay = () => emit('playing');
  const onPause = () => emit('paused');
  const onEnded = () => emit('ended');
  const onWaiting = () => emit('buffering');
  video.addEventListener('play', onPlay);
  video.addEventListener('pause', onPause);
  video.addEventListener('ended', onEnded);
  video.addEventListener('waiting', onWaiting);
  return {
    kind: 'html5',
    play: () => video.play?.().catch(() => {}),
    pause: () => video.pause?.(),
    seekTo: (s) => { try { video.currentTime = Math.max(0, s); } catch { /* ignore */ } },
    getCurrentTime: () => video.currentTime || 0,
    getDuration: () => (Number.isFinite(video.duration) ? video.duration : 0),
    setRate: (r) => { try { video.playbackRate = r; } catch { /* ignore */ } },
    getRate: () => video.playbackRate || 1,
    getAvailableRates: () => DEFAULT_RATES,
    onStateChange: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    destroy: () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('waiting', onWaiting);
      listeners.clear();
    },
  };
}

/**
 * Controller over a YouTube IFrame player (YT.Player). The component wires the
 * player's state changes into `emit` so curation sees the same events as HTML5.
 */
export function createYouTubeController(player) {
  const listeners = new Set();
  return {
    kind: 'youtube',
    play: () => player.playVideo?.(),
    pause: () => player.pauseVideo?.(),
    seekTo: (s) => player.seekTo?.(Math.max(0, s), true),
    getCurrentTime: () => player.getCurrentTime?.() || 0,
    getDuration: () => player.getDuration?.() || 0,
    setRate: (r) => player.setPlaybackRate?.(r),
    getRate: () => player.getPlaybackRate?.() || 1,
    getAvailableRates: () => (player.getAvailablePlaybackRates?.() || DEFAULT_RATES),
    onStateChange: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    /** Called by the component from YT onStateChange. */
    emit: (s) => listeners.forEach((cb) => cb(s)),
    destroy: () => {
      try { player.destroy?.(); } catch { /* ignore */ }
      listeners.clear();
    },
  };
}

/** Map a YT player-state code to our state string. */
export function ytStateToString(code, YT) {
  const S = (YT && YT.PlayerState) || { PLAYING: 1, PAUSED: 2, BUFFERING: 3, ENDED: 0 };
  if (code === S.PLAYING) return 'playing';
  if (code === S.PAUSED) return 'paused';
  if (code === S.BUFFERING) return 'buffering';
  if (code === S.ENDED) return 'ended';
  return null;
}

// --- YouTube IFrame API loader (lazy, once, StrictMode-safe) ------------------
let apiPromise = null;

export function loadYouTubeApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') try { prev(); } catch { /* ignore */ }
      resolve(window.YT);
    };
    if (!document.getElementById('youtube-iframe-api')) {
      const s = document.createElement('script');
      s.id = 'youtube-iframe-api';
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => { apiPromise = null; reject(new Error('Failed to load the YouTube player.')); };
      document.head.appendChild(s);
    }
    setTimeout(() => {
      if (!(window.YT && window.YT.Player)) { apiPromise = null; reject(new Error('YouTube player timed out.')); }
    }, 12000);
  });
  return apiPromise;
}

/** Privacy-enhanced thumbnail URL (no cookies / player until the learner clicks). */
export function thumbnailUrl(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
