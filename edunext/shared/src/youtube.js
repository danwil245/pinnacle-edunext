// Pure YouTube URL/ID parsing — shared by the frontend player and the backend
// oEmbed check. No network, no framework. Returns { videoId, startSeconds } or
// { error }.

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Parse a timestamp value: plain seconds ("90"), or "1h2m3s" / "2m30s" / "45s". */
export function parseTimestamp(v) {
  if (v == null) return 0;
  const s = String(v).trim();
  if (s === '') return 0;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (m && (m[1] || m[2] || m[3])) {
    return (parseInt(m[1] || 0, 10) * 3600) + (parseInt(m[2] || 0, 10) * 60) + parseInt(m[3] || 0, 10);
  }
  return 0;
}

/** True iff `s` is exactly an 11-char YouTube video id. */
export function isYouTubeId(s) {
  return typeof s === 'string' && ID_RE.test(s);
}

/**
 * Accepts: a bare 11-char id; watch?v=; youtu.be/; embed/; shorts/; /v/; with or
 * without extra query params, timestamps (t / start / #t=), and www / nocookie
 * hosts. Returns { videoId, startSeconds } or { error }.
 * @param {string} input
 */
export function parseYouTubeUrl(input) {
  if (!input || typeof input !== 'string') return { error: 'empty input' };
  const s = input.trim();
  if (ID_RE.test(s)) return { videoId: s, startSeconds: 0 };

  let url;
  try {
    url = new URL(s.includes('://') ? s : 'https://' + s);
  } catch {
    return { error: 'not a valid URL' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: 'not an http(s) URL' };
  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  let videoId = null;
  if (host === 'youtu.be') {
    videoId = url.pathname.slice(1).split('/')[0] || null;
  } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v');
    } else {
      const m = url.pathname.match(/^\/(embed|shorts|v)\/([^/?#]+)/);
      if (m) videoId = m[2];
    }
  } else {
    return { error: 'not a YouTube URL' };
  }

  if (!videoId || !ID_RE.test(videoId)) return { error: 'no valid video id' };

  const hashT = (url.hash.match(/[#&]t=([^&]+)/) || [])[1];
  const startSeconds = parseTimestamp(url.searchParams.get('t') || url.searchParams.get('start') || hashT);
  return { videoId, startSeconds };
}
