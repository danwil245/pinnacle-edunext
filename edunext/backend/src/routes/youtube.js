import { Router } from 'express';
import { isYouTubeId } from '@edunext/shared';
import { badRequest } from '../middleware/error.js';
import { checkYouTubeEmbeddable } from '../youtubeCheck.js';

/**
 * GET /api/youtube/check?videoId=... (auth required)
 * Server-side YouTube oEmbed check: confirms the video exists and allows
 * embedding. Returns { ok, title, author } or { ok:false, reason }. No API key.
 * The caller never needs to expose anything to YouTube directly.
 */
export function youtubeRoutes() {
  const router = Router();

  router.get('/youtube/check', async (req, res, next) => {
    try {
      const videoId = String(req.query.videoId || '');
      if (!isYouTubeId(videoId)) return next(badRequest('Invalid videoId (expected an 11-char YouTube id)'));
      return res.json(await checkYouTubeEmbeddable(videoId));
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

export default youtubeRoutes;
