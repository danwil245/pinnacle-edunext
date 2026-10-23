import { notFound, badRequest } from '../../middleware/error.js';
import { parseYouTubeUrl } from '@edunext/shared';
import { checkYouTubeEmbeddable } from '../../youtubeCheck.js';

/**
 * Load a course by id and assert the caller owns it. Returns the row.
 * Not-found and not-owned both map to 404 so ownership is never leaked (a
 * teacher can't probe which ids belong to other teachers).
 */
export async function loadOwnedCourse(db, ownerId, courseId) {
  const id = Number(courseId);
  if (!Number.isFinite(id)) throw notFound('Course not found');
  const course = await db.get('SELECT * FROM courses WHERE id = ? AND owner_id = ?', [id, ownerId]);
  if (!course) throw notFound('Course not found');
  return course;
}

/** Slugify a title; ensure global uniqueness by suffixing -2, -3, … */
export async function uniqueSlug(db, title, excludeId = null) {
  const base =
    String(title)
      .toLowerCase()
      .trim()
      .replace(/['"]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'course';
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const row = await db.get('SELECT id FROM courses WHERE slug = ?', [slug]);
    if (!row || (excludeId && Number(row.id) === Number(excludeId))) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

/**
 * Resolve a YouTube URL/id to a verified videoId. Parses first (clear message on
 * a malformed link), then oEmbed-verifies it is embeddable. Throws badRequest
 * with a readable reason otherwise.
 * @returns {{videoId:string, startSeconds:number, title?:string}}
 */
export async function resolveVerifiedVideo(url, label = 'video') {
  const parsed = parseYouTubeUrl(url);
  if (parsed.error) throw badRequest(`The ${label} link isn't a valid YouTube URL (${parsed.error}).`);
  const check = await checkYouTubeEmbeddable(parsed.videoId);
  if (!check.ok) throw badRequest(`The ${label} video can't be embedded (${check.reason}).`);
  return { videoId: parsed.videoId, startSeconds: parsed.startSeconds, title: check.title };
}

/** Public thumbnail URL from a videoId (i.ytimg.com — no uploads). */
export function thumbnailUrl(videoId) {
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}
