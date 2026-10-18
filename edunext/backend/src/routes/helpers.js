import { notFound, forbidden } from '../middleware/error.js';

/** Load + normalize a user's profile (JSON columns parsed). */
export function loadProfile(db, userId) {
  const p = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!p) return null;
  return {
    interests: JSON.parse(p.interests),
    onboardingComplete: !!p.onboarding_complete,
    calibration: p.calibration ? JSON.parse(p.calibration) : null,
    learningStyle: p.learning_style,
    styleConfidence: p.style_confidence,
    styleStats: JSON.parse(p.style_stats),
  };
}

/** Distinct topics that actually have seeded courses (used to validate interests). */
export function knownTopics(db) {
  return db.prepare('SELECT DISTINCT topic FROM courses').all().map((r) => r.topic);
}

/** Fetch a session and assert the caller owns it. Throws ApiError otherwise. */
export function loadOwnedSession(db, userId, sessionId) {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) throw notFound('Session not found');
  if (session.user_id !== userId) throw forbidden('You do not own this session');
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
