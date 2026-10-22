import { describe, it, expect, vi } from 'vitest';
import { createHtml5Controller, createYouTubeController, ytStateToString } from '../src/pages/lesson/mediaController.js';

function fakeVideo() {
  const handlers = {};
  return {
    currentTime: 10,
    duration: 100,
    playbackRate: 1,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    addEventListener: (ev, cb) => { handlers[ev] = cb; },
    removeEventListener: (ev) => { delete handlers[ev]; },
    _fire: (ev) => handlers[ev] && handlers[ev](),
  };
}

describe('createHtml5Controller', () => {
  it('delegates play/pause/seek/rate and reports duration', () => {
    const v = fakeVideo();
    const c = createHtml5Controller(v);
    c.play(); expect(v.play).toHaveBeenCalled();
    c.pause(); expect(v.pause).toHaveBeenCalled();
    c.seekTo(42); expect(v.currentTime).toBe(42);
    c.seekTo(-5); expect(v.currentTime).toBe(0); // clamped
    c.setRate(1.5); expect(v.playbackRate).toBe(1.5);
    expect(c.getRate()).toBe(1.5);
    expect(c.getDuration()).toBe(100);
  });

  it('emits mapped state strings on media events', () => {
    const v = fakeVideo();
    const c = createHtml5Controller(v);
    const seen = [];
    c.onStateChange((s) => seen.push(s));
    v._fire('play'); v._fire('waiting'); v._fire('pause'); v._fire('ended');
    expect(seen).toEqual(['playing', 'buffering', 'paused', 'ended']);
  });
});

describe('createYouTubeController', () => {
  it('delegates to the YT player and emits to listeners', () => {
    const player = {
      playVideo: vi.fn(), pauseVideo: vi.fn(), seekTo: vi.fn(),
      getCurrentTime: () => 30, getDuration: () => 200,
      setPlaybackRate: vi.fn(), getPlaybackRate: () => 1.25,
      getAvailablePlaybackRates: () => [0.5, 1, 1.5, 2],
    };
    const c = createYouTubeController(player);
    c.play(); expect(player.playVideo).toHaveBeenCalled();
    c.seekTo(12); expect(player.seekTo).toHaveBeenCalledWith(12, true);
    c.setRate(1.5); expect(player.setPlaybackRate).toHaveBeenCalledWith(1.5);
    expect(c.getAvailableRates()).toEqual([0.5, 1, 1.5, 2]);
    expect(c.getCurrentTime()).toBe(30);
    const seen = [];
    c.onStateChange((s) => seen.push(s));
    c.emit('playing');
    expect(seen).toEqual(['playing']);
  });
});

describe('ytStateToString', () => {
  const YT = { PlayerState: { PLAYING: 1, PAUSED: 2, BUFFERING: 3, ENDED: 0 } };
  it('maps codes', () => {
    expect(ytStateToString(1, YT)).toBe('playing');
    expect(ytStateToString(2, YT)).toBe('paused');
    expect(ytStateToString(3, YT)).toBe('buffering');
    expect(ytStateToString(0, YT)).toBe('ended');
    expect(ytStateToString(5, YT)).toBe(null); // cued
  });
});
