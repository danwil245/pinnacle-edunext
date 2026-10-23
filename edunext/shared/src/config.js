/**
 * Single source of truth for every tunable number in EduNext. Imported by the
 * shared logic, the backend, and the frontend. Nothing here may be hardcoded
 * elsewhere — if you need a threshold, add it here and read it from CONFIG.
 *
 * Frozen so an accidental mutation at runtime throws in strict mode instead of
 * silently drifting one consumer's view of the config away from another's.
 */
export const CONFIG = Object.freeze({
  TICK_MS: 5000,
  BLINK_WINDOW_MS: 60000,
  MIN_OBSERVED_S_FOR_BPM: 20, // warm-up: no BPM until this much face time observed
  CALIBRATION_CLIP_S: 45,
  STYLE_PROBE_CLIP_S: 20,
  EMOTION_SAMPLE_MS: 1000, // emotion inference at ~1 Hz
  EMOTION_SMOOTH_N: 5,
  EMOTION_THRESH: 0.35,
  WEIGHTS: Object.freeze({ blink: 0.45, emotion: 0.35, feedback: 0.2 }),
  EMA_ALPHA: 0.35,
  FEEDBACK_FRESH_S: 180,
  SCORE_LEVELS: Object.freeze({ high: 70, low: 40 }),
  BLINK_SCORE: Object.freeze({
    hyperfocused: 85,
    attentive: 100,
    neutral: 65,
    fatigued: 30,
    sleepy: 10,
  }),
  EMOTION_SCORE: Object.freeze({
    engaged: 100,
    neutral: 60,
    confused: 45,
    frustrated: 25,
    bored: 20,
  }),
  FEEDBACK_SCORE: Object.freeze({
    thumbs_up: 100,
    thumbs_down: 15,
    too_easy: 55,
    just_right: 100,
    too_hard: 30,
    still_here_yes: 80,
    still_here_no: 20,
  }),
  CURATION: Object.freeze({
    WARMUP_S: 60,
    COOLDOWN_S: 90,
    BREAK_TICKS: 6,
    REPLAY_TICKS: 4,
    SWITCH_TICKS: 8,
    SLOWDOWN_TICKS: 6,
    SPEEDUP_TICKS: 12,
    SPEEDUP_SCORE: 80,
    SLOWDOWN_SCORE: 50,
    SWITCH_SCORE: 40,
    RATE_MIN: 0.75,
    RATE_MAX: 1.5,
    RATE_STEP: 0.25,
    REPLAY_BACK_S: 30,
    REPLAY_RATE: 0.85,
  }),
  FEEDBACK_PROMPTS: Object.freeze({ MAX_PER_LESSON: 3, MIN_GAP_S: 120 }),
  // Break prompt timings (UI only — not part of the curation math). LENGTH_S is
  // the suggested break duration; SNOOZE_S is how long "Remind me later" defers.
  BREAK: Object.freeze({ LENGTH_S: 300, SNOOZE_S: 300 }),
  STYLE: Object.freeze({
    PROBE_WEIGHT: 3,
    LESSON_WEIGHT: 1,
    MIN_LESSON_VALID_S: 90,
    BALANCED_MARGIN: 5,
    CONF_DIFF_SCALE: 25,
    CONF_WEIGHT_SCALE: 6,
    EXPLORE_RATE: 0.15,
    LOW_CONF: 0.6,
  }),
  RECOMMEND: Object.freeze({
    W_INTEREST: 0.45,
    W_STYLE: 0.3,
    W_HISTORY: 0.15,
    IN_PROGRESS_BOOST: 0.15,
  }),
  // Teacher analytics (Prompt B). MIN_VALID_SESSIONS gates "not enough data yet".
  ANALYTICS: Object.freeze({
    MIN_VALID_SESSIONS: 3, // below this a lesson shows "not enough data yet"
    TIMELINE_BUCKETS: 10, // class engagement timeline resolution (% of lesson)
    TREND_WINDOW: 5, // sessions considered for a student's up/down/flat trend
    TREND_MARGIN: 5, // score delta (0..100) needed to call a trend up/down
    LOW_ENGAGEMENT_SCORE: 45, // a session below this is "low"
    LOW_ENGAGEMENT_SESSIONS: 3, // this many recent low sessions => flag for check-in
  }),
});

export default CONFIG;
