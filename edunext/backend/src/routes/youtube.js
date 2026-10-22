import { Router } from 'express';
import { isYouTubeId } from '@edunext/shared';
import { badRequest } from '../middleware/error.js';

/**
 * GET /api/youtube/check?videoId=... (auth required)
 * Server-side YouTube oEmbed check: confirms the video exists and allows
 * embedding. Returns { ok, title, author } or { ok:false, reason }. No API key.
 * Results are cached briefly to avoid hammering oEmbed. The caller never needs to
 * expose anything to YouTube directly.
 */
const CACHE = new Map(); // videoId -> { at, result }
const TTL_MS = 10 * 60 * 1000;

export function youtubeRoutes() {
  const router = Router();

  router.get('/youtube/check', async (req, res, next) => {
    try {
      const videoId = String(req.query.videoId || '');
      if (!isYouTubeId(videoId)) return next(badRequest('Invalid videoId (expected an 11-char YouTube id)'));

      const cached = CACHE.get(videoId);
      if (cached && Date.now() - cached.at < TTL_MS) return res.json(cached.result);

      let result;
      try {
        const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(
          'https://www.youtube.com/watch?v=' + videoId
        )}&format=json`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const r = await fetch(oembed, { signal: controller.signal });
        clearTimeout(timer);
        if (r.ok) {
          const d = await r.json();
          result = { ok: true, title: d.title, author: d.author_name };
        } else {
          result = {
            ok: false,
            reason: r.status === 401 ? 'embedding disabled' : r.status === 404 ? 'not found' : `unavailable (${r.status})`,
          };
        }
      } catch {
        result = { ok: false, reason: 'check failed (network/timeout)' };
      }

      CACHE.set(videoId, { at: Date.now(), result });
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

export default youtubeRoutes;
