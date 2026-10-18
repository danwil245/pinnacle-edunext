import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { openDb } from './db.js';
import { migrate } from './migrate.js';
import { COURSES } from './content/courses.js';

/**
 * Seed placeholder courses + lessons. Idempotent: upserts by course slug and by
 * (course_id, position) so re-running never duplicates rows.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function seed(db) {
  const upsertCourse = db.prepare(`
    INSERT INTO courses (slug, title, topic, description, level, practical_ratio)
    VALUES (@slug, @title, @topic, @description, @level, @practical_ratio)
    ON CONFLICT(slug) DO UPDATE SET
      title=excluded.title, topic=excluded.topic, description=excluded.description,
      level=excluded.level, practical_ratio=excluded.practical_ratio
  `);
  const courseIdBySlug = db.prepare('SELECT id FROM courses WHERE slug = ?');
  const findLesson = db.prepare('SELECT id FROM lessons WHERE course_id = ? AND position = ?');
  const insertLesson = db.prepare(`
    INSERT INTO lessons (course_id, position, title, duration_s, visual, practical)
    VALUES (@course_id, @position, @title, @duration_s, @visual, @practical)
  `);
  const updateLesson = db.prepare(`
    UPDATE lessons SET title=@title, duration_s=@duration_s, visual=@visual, practical=@practical
    WHERE id=@id
  `);

  const run = db.transaction(() => {
    for (const course of COURSES) {
      upsertCourse.run(course);
      const { id: courseId } = courseIdBySlug.get(course.slug);
      for (const lesson of course.lessons) {
        const row = {
          course_id: courseId,
          position: lesson.position,
          title: lesson.title,
          duration_s: lesson.duration_s,
          visual: JSON.stringify(lesson.visual),
          practical: JSON.stringify(lesson.practical),
        };
        const existing = findLesson.get(courseId, lesson.position);
        if (existing) updateLesson.run({ ...row, id: existing.id });
        else insertLesson.run(row);
      }
    }
  });
  run();

  const courseCount = db.prepare('SELECT COUNT(*) n FROM courses').get().n;
  const lessonCount = db.prepare('SELECT COUNT(*) n FROM lessons').get().n;
  return { courses: courseCount, lessons: lessonCount };
}

/** Collect every distinct video URL referenced by the seed content. */
function videoUrls() {
  const urls = new Set();
  for (const c of COURSES) {
    for (const l of c.lessons) {
      if (l.visual?.videoUrl) urls.add(l.visual.videoUrl);
      if (l.practical?.videoUrl) urls.add(l.practical.videoUrl);
    }
  }
  return [...urls];
}

/** Best-effort HEAD check — warns on unreachable URLs but never fails seeding. */
async function checkVideos() {
  for (const url of videoUrls()) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) console.warn(`[seed] video URL returned ${res.status}: ${url}`);
    } catch (err) {
      console.warn(`[seed] could not reach video URL (${err.name}): ${url}`);
    }
  }
}

// CLI: `npm run seed` (cross-platform entry check)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.env.DB_PATH || './data/edunext.db';
  const db = openDb(path);
  migrate(db);
  const counts = seed(db);
  // eslint-disable-next-line no-console
  console.log(`Seeded ${counts.courses} courses, ${counts.lessons} lessons into ${path}`);
  await checkVideos();
  db.close();
}
