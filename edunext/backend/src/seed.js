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
export async function seed(db) {
  await db.transaction(async (tx) => {
    for (const course of COURSES) {
      await tx.run(
        `INSERT INTO courses (slug, title, topic, description, level, practical_ratio)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           title=excluded.title, topic=excluded.topic, description=excluded.description,
           level=excluded.level, practical_ratio=excluded.practical_ratio`,
        [course.slug, course.title, course.topic, course.description, course.level, course.practical_ratio]
      );
      const c = await tx.get('SELECT id FROM courses WHERE slug = ?', [course.slug]);
      const courseId = Number(c.id);
      for (const lesson of course.lessons) {
        const visual = JSON.stringify(lesson.visual);
        const practical = JSON.stringify(lesson.practical);
        const existing = await tx.get('SELECT id FROM lessons WHERE course_id = ? AND position = ?', [courseId, lesson.position]);
        if (existing) {
          await tx.run('UPDATE lessons SET title=?, duration_s=?, visual=?, practical=? WHERE id=?', [lesson.title, lesson.duration_s, visual, practical, Number(existing.id)]);
        } else {
          await tx.run('INSERT INTO lessons (course_id, position, title, duration_s, visual, practical) VALUES (?, ?, ?, ?, ?, ?)', [courseId, lesson.position, lesson.title, lesson.duration_s, visual, practical]);
        }
      }
    }
  });

  const cc = await db.get('SELECT COUNT(*) n FROM courses');
  const lc = await db.get('SELECT COUNT(*) n FROM lessons');
  return { courses: Number(cc.n), lessons: Number(lc.n) };
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
  const db = openDb();
  await migrate(db);
  const counts = await seed(db);
  // eslint-disable-next-line no-console
  console.log(`Seeded ${counts.courses} courses, ${counts.lessons} lessons (${db.kind}: ${db.host})`);
  await checkVideos();
  await db.close();
}
