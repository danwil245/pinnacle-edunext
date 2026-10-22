import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import YouTubePlayer from '../src/pages/lesson/YouTubePlayer.jsx';

// Mock only the IFrame API loader; keep the real controller + helpers.
let lastEvents = null;
vi.mock('../src/pages/lesson/mediaController.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadYouTubeApi: vi.fn(() =>
      Promise.resolve({
        PlayerState: { PLAYING: 1, PAUSED: 2, BUFFERING: 3, ENDED: 0 },
        Player: class {
          constructor(_el, cfg) {
            lastEvents = cfg.events;
            this.playVideo = vi.fn();
            this.destroy = vi.fn();
            this.getAvailablePlaybackRates = () => [1];
          }
        },
      })
    ),
  };
});

describe('YouTubePlayer', () => {
  beforeEach(() => { lastEvents = null; });

  it('shows a thumbnail first, then loads and provides a controller on ready', async () => {
    const onController = vi.fn();
    render(<YouTubePlayer videoId="dQw4w9WgXcQ" title="A lesson" onController={onController} />);
    const play = screen.getByRole('button', { name: /play/i });
    fireEvent.click(play);
    await waitFor(() => expect(lastEvents).toBeTruthy());
    lastEvents.onReady();
    await waitFor(() => expect(onController).toHaveBeenCalled());
    const ctrl = onController.mock.calls.find((c) => c[0])?.[0];
    expect(ctrl.kind).toBe('youtube');
  });

  it('shows the fallback and calls onFallback on an embed error', async () => {
    const onFallback = vi.fn();
    render(<YouTubePlayer videoId="dQw4w9WgXcQ" onFallback={onFallback} />);
    fireEvent.click(screen.getByRole('button', { name: /play/i }));
    await waitFor(() => expect(lastEvents).toBeTruthy());
    lastEvents.onError({ data: 150 });
    await screen.findByText(/can.t be played/i);
    fireEvent.click(screen.getByRole('button', { name: /use the other version/i }));
    expect(onFallback).toHaveBeenCalled();
  });

  it('maps player state changes to onState/onEnded', async () => {
    const onState = vi.fn();
    const onEnded = vi.fn();
    render(<YouTubePlayer videoId="dQw4w9WgXcQ" onState={onState} onEnded={onEnded} />);
    fireEvent.click(screen.getByRole('button', { name: /play/i }));
    await waitFor(() => expect(lastEvents).toBeTruthy());
    lastEvents.onReady();
    window.YT = { PlayerState: { PLAYING: 1, PAUSED: 2, BUFFERING: 3, ENDED: 0 } };
    lastEvents.onStateChange({ data: 1 });
    lastEvents.onStateChange({ data: 0 });
    expect(onState).toHaveBeenCalledWith('playing');
    expect(onEnded).toHaveBeenCalled();
  });
});
