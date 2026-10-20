import { CONFIG } from '@edunext/shared';

/**
 * The single manifest for the six onboarding calibration clips. No clip path is
 * hardcoded anywhere else — onboarding reads everything from here.
 *
 * All six are locally generated, license-free motion graphics (see
 * `frontend/public/media/calibration/SOURCES.md` and `scripts/media/`), encoded
 * to the blink-measurement spec: MP4/H.264/yuv420p, 1280x720, 30fps, no audio,
 * +faststart, no text/flicker, calm similar brightness. Durations come from
 * CONFIG (CALIBRATION_CLIP_S for interest/neutral, STYLE_PROBE_CLIP_S for probes)
 * — if you change CONFIG, regenerate with `npm run media:generate`.
 *
 * Interest clips are keyed by the same topic slugs as the seeded courses and the
 * interest picker: 'web-development', 'data-science', 'design'.
 *
 * @typedef {{ id:string, role:'interest'|'neutral'|'probe', topic?:string,
 *   variant?:'visual'|'practical', label:string, src:string, poster:string,
 *   durationS:number, credit:string|null }} CalibrationClip
 */
const BASE = '/media/calibration';
const clip = (o) => Object.freeze({ credit: null, ...o, src: `${BASE}/${o.file}`, poster: `${BASE}/${o.file.replace('.mp4', '.jpg')}` });

/** @type {ReadonlyArray<CalibrationClip>} */
export const CALIBRATION_CLIPS = Object.freeze([
  clip({ id: 'web-dev-interest', role: 'interest', topic: 'web-development', label: 'Building for the web', file: 'web-dev-interest.mp4', durationS: CONFIG.CALIBRATION_CLIP_S }),
  clip({ id: 'data-science-interest', role: 'interest', topic: 'data-science', label: 'Thinking with data', file: 'data-science-interest.mp4', durationS: CONFIG.CALIBRATION_CLIP_S }),
  clip({ id: 'design-interest', role: 'interest', topic: 'design', label: 'The craft of design', file: 'design-interest.mp4', durationS: CONFIG.CALIBRATION_CLIP_S }),
  clip({ id: 'neutral', role: 'neutral', label: 'A general overview', file: 'neutral.mp4', durationS: CONFIG.CALIBRATION_CLIP_S }),
  clip({ id: 'probe-visual', role: 'probe', variant: 'visual', label: 'Explained visually', file: 'probe-visual.mp4', durationS: CONFIG.STYLE_PROBE_CLIP_S }),
  clip({ id: 'probe-practical', role: 'probe', variant: 'practical', label: 'Learned by doing', file: 'probe-practical.mp4', durationS: CONFIG.STYLE_PROBE_CLIP_S }),
]);

export const NEUTRAL_CLIP = CALIBRATION_CLIPS.find((c) => c.role === 'neutral');

/** Interest clip for a topic slug; falls back to the neutral clip if unknown. */
export function interestClipFor(topic) {
  return CALIBRATION_CLIPS.find((c) => c.role === 'interest' && c.topic === topic) || NEUTRAL_CLIP;
}

/** Style-probe clip for a variant ('visual' | 'practical'). */
export function probeClipFor(variant) {
  return CALIBRATION_CLIPS.find((c) => c.role === 'probe' && c.variant === variant);
}

// --- Back-compat shapes for existing consumers --------------------------------
export const INTEREST_CLIPS = Object.freeze(
  Object.fromEntries(CALIBRATION_CLIPS.filter((c) => c.role === 'interest').map((c) => [c.topic, c]))
);
export const STYLE_PROBE_CLIPS = Object.freeze({ visual: probeClipFor('visual'), practical: probeClipFor('practical') });
