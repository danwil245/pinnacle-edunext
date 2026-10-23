import { z } from 'zod';
import { ZONE_KEYS } from './zones.js';
import { EMOTION_LABELS } from './emotion.js';

/**
 * Zod schemas for every API payload. Imported by the backend (to validate
 * incoming requests) and reused by the frontend client where useful.
 *
 * The privacy invariant is enforced here: `tickSchema` is `.strict()` and
 * contains only derived numbers/labels — any image/frame/base64 field (or an
 * absurdly long string) is rejected, so camera data can never reach the server.
 */

export const emailSchema = z.string().email().max(254);
export const passwordSchema = z.string().min(8).max(200);

export const registerSchema = z.object({
  email: emailSchema,
  name: z.string().min(1).max(100),
  password: passwordSchema,
  // Teacher registration (optional, backward-compatible). When role='teacher'
  // the server also requires a valid inviteCode; a student registration omits
  // both (or sends role='student').
  role: z.enum(['student', 'teacher']).optional(),
  inviteCode: z.string().max(200).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const interestsSchema = z.object({
  interests: z.array(z.string().min(1).max(64)).min(1).max(2),
});

const emotionBaselineClip = z
  .object({
    neutral: z.number(),
    happy: z.number(),
    sad: z.number(),
    angry: z.number(),
    fearful: z.number(),
    disgusted: z.number(),
    surprised: z.number(),
  })
  .strict();

export const calibrationSchema = z.object({
  calibration: z.object({
    engagedBpm: z.number().nullable(),
    neutralBpm: z.number().nullable(),
    boundaries: z.array(z.number()).length(4),
    personalized: z.boolean(),
    emotionBaseline: z
      .object({ engagedClip: emotionBaselineClip, neutralClip: emotionBaselineClip })
      .nullable()
      .optional(),
    clipSeconds: z.number().optional(),
    completedAt: z.string().optional(),
    // Set when a calibration clip failed to load and an in-browser fallback was
    // used, so the stored result records the degraded read. Optional + additive;
    // no effect on calibration math.
    usedFallbackClip: z.boolean().optional(),
    sourceQuality: z
      .object({
        blinksEngaged: z.number(),
        blinksNeutral: z.number(),
        faceSecondsEngaged: z.number(),
        faceSecondsNeutral: z.number(),
      })
      .partial()
      .optional(),
  }),
  styleProbe: z
    .object({
      visual: z.object({ meanScore: z.number(), seconds: z.number() }),
      practical: z.object({ meanScore: z.number(), seconds: z.number() }),
    })
    .nullable(),
});

// A single engagement tick. STRICT: only derived fields, no image/blob data.
export const tickSchema = z
  .object({
    t: z.number().int().nonnegative(),
    bpm: z.number().nullable(),
    zone: z.enum(ZONE_KEYS).nullable(),
    emotion: z.enum(EMOTION_LABELS).nullable(),
    score: z.number().nullable(),
    faceDetected: z.boolean(),
    observedS: z.number().nonnegative(),
  })
  .strict();

export const ticksBatchSchema = z.object({
  ticks: z.array(tickSchema).min(1).max(200),
});

export const feedbackSchema = z.object({
  t: z.number().int().nonnegative(),
  kind: z.string().min(1).max(40),
  value: z.string().min(1).max(40),
});

export const curationSchema = z.object({
  t: z.number().int().nonnegative(),
  action: z.string().min(1).max(40),
  reason: z.string().max(300),
  outcome: z.enum(['auto', 'accepted', 'dismissed']),
});

export const sessionCreateSchema = z.object({
  lessonId: z.number().int().positive(),
});

export const endSessionSchema = z.object({
  completed: z.boolean(),
});
