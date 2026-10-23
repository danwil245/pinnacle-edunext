/**
 * Server-side YouTube oEmbed check: confirms a video exists and allows
 * embedding, without any API key. Returns { ok, title, author } or
 * { ok:false, reason }. Results are cached briefly to avoid hammering oEmbed.
 *
 * Shared by the `/api/youtube/check` route (student + teacher UI preview) and the
 * teacher content routes (which verify a URL before saving a lesson).
 */
const CACHE = new Map(); // videoId -> { at, result }
const TTL_MS = 10 * 60 * 1000;

export async function checkYouTubeEmbeddable(videoId, { timeoutMs = 6000 } = {}) {
  const cached = CACHE.get(videoId);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.result;

  let result;
  try {
    const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      'https://www.youtube.com/watch?v=' + videoId
    )}&format=json`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const r = await fetch(oembed, { signal: controller.signal });
    clearTimeout(timer);
    if (r.ok) {
      const d = await r.json();
      result = { ok: true, title: d.title, author: d.author_name };
    } else {
      result = {
        ok: false,
        reason:
          r.status === 401
            ? 'embedding disabled'
            : r.status === 404
              ? 'not found'
              : `unavailable (${r.status})`,
      };
    }
  } catch {
    result = { ok: false, reason: 'check failed (network/timeout)' };
  }

  CACHE.set(videoId, { at: Date.now(), result });
  return result;
}

export default checkYouTubeEmbeddable;
