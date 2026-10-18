// Client mirror of the backend placeholder calibration clips so onboarding is
// self-contained (content is placeholder + swappable by design — see
// ASSUMPTIONS.md). Keep in sync with backend/src/content/calibrationClips.js.
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
