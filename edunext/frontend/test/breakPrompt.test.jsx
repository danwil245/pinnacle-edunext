import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BreakPrompt from '../src/pages/lesson/BreakPrompt.jsx';
import BreakScreen from '../src/pages/lesson/BreakScreen.jsx';

/**
 * Bug 2 — the rebuilt "take a short break?" UI. Covers the three actions, the
 * accessible dialog contract (role/aria-modal, focus on open, Escape = keep
 * going), and the break screen's countdown + resume.
 */
describe('BreakPrompt', () => {
  const handlers = () => ({ onTakeBreak: vi.fn(), onKeepGoing: vi.fn(), onRemindLater: vi.fn() });

  it('is an accessible modal dialog with the three actions', () => {
    render(<BreakPrompt breakMinutes={5} reason="fatigue" {...handlers()} motionOff />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-describedby');
    expect(screen.getByRole('button', { name: /take a 5-min break/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep going/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remind me later/i })).toBeInTheDocument();
  });

  it('calls each handler and focuses the primary action on open', () => {
    const h = handlers();
    render(<BreakPrompt breakMinutes={5} {...h} motionOff />);
    expect(screen.getByRole('button', { name: /take a 5-min break/i })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: /take a 5-min break/i }));
    fireEvent.click(screen.getByRole('button', { name: /keep going/i }));
    fireEvent.click(screen.getByRole('button', { name: /remind me later/i }));
    expect(h.onTakeBreak).toHaveBeenCalledTimes(1);
    expect(h.onKeepGoing).toHaveBeenCalledTimes(1);
    expect(h.onRemindLater).toHaveBeenCalledTimes(1);
  });

  it('Escape maps to "keep going" (least destructive)', () => {
    const h = handlers();
    render(<BreakPrompt breakMinutes={5} {...h} motionOff />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(h.onKeepGoing).toHaveBeenCalledTimes(1);
    expect(h.onTakeBreak).not.toHaveBeenCalled();
  });

  it('clicking the backdrop keeps going (does not take a break)', () => {
    const h = handlers();
    const { container } = render(<BreakPrompt breakMinutes={5} {...h} motionOff />);
    fireEvent.click(container.querySelector('[aria-hidden]'));
    expect(h.onKeepGoing).toHaveBeenCalledTimes(1);
  });
});

describe('BreakScreen', () => {
  it('shows a countdown and resumes via "I’m back"', () => {
    const onResume = vi.fn();
    render(<BreakScreen secondsLeft={125} totalS={300} onResume={onResume} motionOff />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('2:05')).toBeInTheDocument();
    const back = screen.getByRole('button', { name: /i’m back|i'm back/i });
    expect(back).toHaveFocus();
    fireEvent.click(back);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('announces when the break time is up', () => {
    render(<BreakScreen secondsLeft={0} totalS={300} onResume={() => {}} motionOff />);
    expect(screen.getByText(/break’s done|break's done/i)).toBeInTheDocument();
  });
});
