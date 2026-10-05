const KEY = 'blink-detection-calibration-profile-v1';

/** Load a previously saved calibration profile, if any. */
export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.boundaries) || parsed.boundaries.length !== 4) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persist a calibration profile (shape: { engagedBpm, neutralBpm, boundaries, personalized }). */
export function saveProfile(profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage errors (e.g. private browsing / storage disabled).
  }
}

/** Clear the stored profile, e.g. before recalibrating. */
export function clearProfile() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
