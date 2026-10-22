import { describe, it, expect } from 'vitest';
import { parseYouTubeUrl, parseTimestamp, isYouTubeId } from '../src/youtube.js';

const ID = 'dQw4w9WgXcQ';

describe('parseYouTubeUrl', () => {
  it('accepts a bare 11-char id', () => {
    expect(parseYouTubeUrl(ID)).toEqual({ videoId: ID, startSeconds: 0 });
  });

  it('parses every common URL form', () => {
    const forms = [
      `https://www.youtube.com/watch?v=${ID}`,
      `http://youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://www.youtube.com/v/${ID}`,
      `youtube.com/watch?v=${ID}`, // no scheme
    ];
    for (const f of forms) {
      expect(parseYouTubeUrl(f).videoId, f).toBe(ID);
    }
  });

  it('keeps the id when there are extra query params', () => {
    const r = parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&list=PLxyz&index=3&feature=share`);
    expect(r.videoId).toBe(ID);
  });

  it('extracts start time from t / start / #t in several formats', () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=90`).startSeconds).toBe(90);
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&t=1m30s`).startSeconds).toBe(90);
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&start=45`).startSeconds).toBe(45);
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=45s`).startSeconds).toBe(45);
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}#t=1h2m3s`).startSeconds).toBe(3723);
  });

  it('rejects garbage and non-YouTube input', () => {
    for (const bad of ['', null, undefined, 42, 'not a url', 'https://vimeo.com/12345', 'https://example.com/watch?v=abc', 'https://youtube.com/watch?v=short', 'ftp://youtu.be/' + ID]) {
      expect(parseYouTubeUrl(bad).error, String(bad)).toBeTruthy();
      expect(parseYouTubeUrl(bad).videoId).toBeUndefined();
    }
  });

  it('rejects an id of the wrong length', () => {
    expect(parseYouTubeUrl('https://youtu.be/tooShort').error).toBeTruthy();
    expect(parseYouTubeUrl('https://youtu.be/waytoolongggggg').error).toBeTruthy();
  });
});

describe('parseTimestamp', () => {
  it('handles plain seconds and h/m/s', () => {
    expect(parseTimestamp('90')).toBe(90);
    expect(parseTimestamp('2m30s')).toBe(150);
    expect(parseTimestamp('1h')).toBe(3600);
    expect(parseTimestamp('')).toBe(0);
    expect(parseTimestamp(null)).toBe(0);
    expect(parseTimestamp('garbage')).toBe(0);
  });
});

describe('isYouTubeId', () => {
  it('validates 11-char ids', () => {
    expect(isYouTubeId(ID)).toBe(true);
    expect(isYouTubeId('short')).toBe(false);
    expect(isYouTubeId('has space!!')).toBe(false);
  });
});
