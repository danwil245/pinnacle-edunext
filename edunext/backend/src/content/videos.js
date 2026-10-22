/**
 * Verified YouTube video references per seeded lesson, keyed by `${slug}:${position}`.
 *
 * RULES (see VIDEO_SOURCES.md):
 *  - Only real, oEmbed-verified, embeddable video IDs go here. Never invent an ID.
 *  - A `null` id means "no verified video yet" → the lesson falls back to its
 *    labelled placeholder content.
 *  - `start` is an optional start offset in seconds.
 *
 * The seed reads this map and writes the dedicated lesson columns
 * (visual_video_id / practical_video_id / visual_start_s / practical_start_s).
 */
export const LESSON_VIDEOS = Object.freeze({
  // Web development — all oEmbed-verified (see VIDEO_SOURCES.md)
  'web-foundations:1': { visualId: 'kUMe1FH4CHE', visualStart: 0, practicalId: 'pQN-pnXPaVg', practicalStart: 0 },
  'web-foundations:2': { visualId: 'D3iEE29ZXRM', visualStart: 0, practicalId: 'r1xBCi5SOjw', practicalStart: 0 },
  'web-foundations:3': { visualId: '0eqgd5IRnMQ', visualStart: 0, practicalId: 'XQEfWd1lh4Q', practicalStart: 0 },
  // Data science
  'data-science-essentials:1': { visualId: 'xi0vhXFPegw', visualStart: 0, practicalId: 'ykq-zpobuL8', practicalStart: 0 },
  'data-science-essentials:2': { visualId: 'ePn16S4tXYE', visualStart: 0, practicalId: 'ozKsfsldV7M', practicalStart: 0 },
  'data-science-essentials:3': { visualId: 'R44aOvXeKaU', visualStart: 0, practicalId: '6Cz_HbBncXE', practicalStart: 0 },
  // Design
  'design-principles:1': { visualId: 'DBHBmeNhYrY', visualStart: 0, practicalId: 'WOJpw0nwO6Q', practicalStart: 0 },
  'design-principles:2': { visualId: 'sByzHoiYFX0', visualStart: 0, practicalId: 'QrNi9FmdlxY', practicalStart: 0 },
  'design-principles:3': { visualId: '_2LLXnUdUIc', visualStart: 0, practicalId: '2QTHs7QSR9o', practicalStart: 0 },
});

/** Look up the video refs for a lesson, with safe defaults. */
export function videosFor(slug, position) {
  return LESSON_VIDEOS[`${slug}:${position}`] || { visualId: null, visualStart: 0, practicalId: null, practicalStart: 0 };
}
