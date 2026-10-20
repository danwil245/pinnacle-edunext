import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CONFIG } from '@edunext/shared';
import { CALIBRATION_CLIPS, NEUTRAL_CLIP, interestClipFor, probeClipFor, INTEREST_CLIPS, STYLE_PROBE_CLIPS } from '../src/content/calibrationClips.js';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '..', 'public');

// Topic slugs the seeded courses + interest picker use.
const TOPIC_SLUGS = ['web-development', 'data-science', 'design'];

describe('calibration clips manifest', () => {
  it('has exactly the six clips with the expected files', () => {
    expect(CALIBRATION_CLIPS).toHaveLength(6);
    const files = CALIBRATION_CLIPS.map((c) => c.src.split('/').pop()).sort();
    expect(files).toEqual([
      'data-science-interest.mp4', 'design-interest.mp4', 'neutral.mp4',
      'probe-practical.mp4', 'probe-visual.mp4', 'web-dev-interest.mp4',
    ]);
  });

  it('durations come from CONFIG', () => {
    for (const c of CALIBRATION_CLIPS) {
      const expected = c.role === 'probe' ? CONFIG.STYLE_PROBE_CLIP_S : CONFIG.CALIBRATION_CLIP_S;
      expect(c.durationS).toBe(expected);
    }
  });

  it('interest clips cover every seeded topic slug', () => {
    for (const slug of TOPIC_SLUGS) {
      const c = interestClipFor(slug);
      expect(c.role).toBe('interest');
      expect(c.topic).toBe(slug);
      expect(INTEREST_CLIPS[slug]).toBe(c);
    }
  });

  it('has a neutral clip and both style probes', () => {
    expect(NEUTRAL_CLIP.role).toBe('neutral');
    expect(probeClipFor('visual').variant).toBe('visual');
    expect(probeClipFor('practical').variant).toBe('practical');
    expect(STYLE_PROBE_CLIPS.visual).toBe(probeClipFor('visual'));
  });

  it('every clip + poster file exists on disk', () => {
    for (const c of CALIBRATION_CLIPS) {
      expect(existsSync(join(pub, c.src)), `missing ${c.src}`).toBe(true);
      expect(existsSync(join(pub, c.poster)), `missing ${c.poster}`).toBe(true);
    }
  });

  it('every src points under /media/calibration and is frozen', () => {
    for (const c of CALIBRATION_CLIPS) {
      expect(c.src.startsWith('/media/calibration/')).toBe(true);
      expect(Object.isFrozen(c)).toBe(true);
    }
  });
});
