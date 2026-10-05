// Hardcoded calibration clips for onboarding. Both are real, publicly hosted,
// freely-licensed sample videos (no auth, no rate limits) so calibration works
// out of the box without asking a first-time user to supply their own content.
//
// - "engaging": Big Buck Bunny (Blender Foundation, CC BY 3.0) — a short
//   animated film with a story and characters, chosen as a broadly engaging
//   reference clip.
// - "neutral": a generic car commercial — low narrative stakes, chosen as a
//   comparatively low-engagement reference clip.
//
// Swap these for your own content anytime — nothing else in the calibration
// flow depends on which videos are used.
export const CALIBRATION_VIDEOS = {
  engaging: {
    label: 'Big Buck Bunny',
    sub: 'Animated short film',
    src: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  },
  neutral: {
    label: 'Subaru Outback — On Street and Dirt',
    sub: 'Car commercial',
    src: 'https://storage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
  },
};

// How long we watch (and track blinks during) each calibration clip.
export const CALIBRATION_DURATION_S = 30;
