import { notFound, forbidden } from '../middleware/error.js';

/** Load + normalize a user's profile (JSON columns parsed). */
export async function loadProfile(db, userId) {
  const p = await db.get('SELECT * FROM profiles WHERE user_id = ?', [userId]);
  if (!p) return null;
  return {
    interests: JSON.parse(p.interests),
    onboardingComplete: !!Number(p.onboarding_complete),
    calibration: p.calibration ? JSON.parse(p.calibration) : null,
    learningStyle: p.learning_style,
    styleConfidence: p.style_confidence,
    styleStats: JSON.parse(p.style_stats),
  };
}

/** Distinct topics that actually have seeded courses (used to validate interests). */
export async function knownTopics(db) {
  const rows = await db.all('SELECT DISTINCT topic FROM courses');
  return rows.map((r) => r.topic);
}

/** Fetch a session and assert the caller owns it. Throws ApiError otherwise. */
export async function loadOwnedSession(db, userId, sessionId) {
  const session = await db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  if (!session) throw notFound('Session not found');
  if (Number(session.user_id) !== Number(userId)) throw forbidden('You do not own this session');
  return session;
}

/** Public course shape (camelCase, no internal columns). */
export function publicCourse(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    topic: row.topic,
    description: row.description,
    level: row.level,
    practicalRatio: row.practical_ratio,
  };
}
