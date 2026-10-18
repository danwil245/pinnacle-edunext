/**
 * Calibration + style-probe clips (placeholder, swappable). Onboarding plays:
 *   - an "interest" clip for the learner's chosen topic (engaged baseline),
 *   - a generic "neutral" clip (resting baseline),
 *   - one visual-style and one hands-on-style probe clip on the SAME neutral
 *     topic (so the style probe measures format, not interest).
 * Each entry is { label, src }.
 */
const V = 'https://storage.googleapis.com/gtv-videos-bucket/sample/';

export const INTEREST_CLIPS = {
  'web-development': { label: 'Building for the web', src: `${V}ForBiggerFun.mp4` },
  'data-science': { label: 'Thinking with data', src: `${V}ElephantsDream.mp4` },
  design: { label: 'The craft of design', src: `${V}Sintel.mp4` },
};

export const NEUTRAL_CLIP = { label: 'A general overview', src: `${V}SubaruOutbackOnStreetAndDirt.mp4` };

export const STYLE_PROBE_CLIPS = {
  visual: { label: 'Explained visually', src: `${V}BigBuckBunny.mp4` },
  practical: { label: 'Learned by doing', src: `${V}ForBiggerBlazes.mp4` },
};

export default { INTEREST_CLIPS, NEUTRAL_CLIP, STYLE_PROBE_CLIPS };
