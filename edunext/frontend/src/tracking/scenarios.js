/**
 * Scripted mock scenario: a sequence of phases, each with a target blink rate
 * and a 7-class emotion distribution. The MockSignalSource replays these using
 * the SAME buildTick/engagement/curation code paths as the real camera, so a
 * presenter can demo the whole adaptive flow without a webcam.
 *
 * Phase times are in VIRTUAL seconds; the provider's time-scale compresses them
 * into real time (e.g. 10x => the ~130s scenario runs in ~13 real seconds).
 */
function probs(p) {
  return { neutral: 0, happy: 0, sad: 0, angry: 0, fearful: 0, disgusted: 0, surprised: 0, ...p };
}

export const DEFAULT_SCENARIO = {
  name: 'engaged → drifting → confused → fatigued → recovering',
  phases: [
    { until: 20, label: 'engaged', bpm: 12, probs: probs({ happy: 0.7, neutral: 0.3 }) },
    { until: 40, label: 'drifting', bpm: 17, probs: probs({ neutral: 0.8, sad: 0.2 }) },
    { until: 75, label: 'confused', bpm: 18, probs: probs({ fearful: 0.4, surprised: 0.3, neutral: 0.3 }) },
    { until: 120, label: 'fatigued', bpm: 27, probs: probs({ sad: 0.6, neutral: 0.4 }) },
    { until: Infinity, label: 'recovering', bpm: 14, probs: probs({ happy: 0.5, neutral: 0.5 }) },
  ],
};

export const SCENARIOS = { default: DEFAULT_SCENARIO };

/** Find the active phase for a given elapsed virtual-seconds value. */
export function phaseAt(scenario, elapsedS) {
  return scenario.phases.find((p) => elapsedS < p.until) || scenario.phases[scenario.phases.length - 1];
}
