import { describe, it, expect } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { Stagger, Reveal, isElementOnScreen, forceRevealed } from '../src/motion/primitives.jsx';

/**
 * Regression for the "faded cards" bug: a Stagger/Reveal whose content mounts
 * after an async fetch could be left stuck at opacity 0 when its ScrollTrigger
 * never fired. jsdom never fires scroll triggers, so this is a faithful stand-in
 * for the stalled-trigger case — every card must still end fully visible via the
 * safety net. gsap writes a literal inline `opacity: 0` for the "from" state;
 * "fixed" means that inline 0 is gone (cleared / forced to visible).
 */

const notHidden = (el) => el.style.opacity !== '0';

describe('reveal reliability', () => {
  it('isElementOnScreen treats unknown/zero geometry as on-screen (fail-safe)', () => {
    expect(isElementOnScreen(null)).toBe(true);
    expect(isElementOnScreen({ getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, bottom: 0 }) })).toBe(true);
    expect(isElementOnScreen({ getBoundingClientRect: () => ({ width: 10, height: 10, top: 10, bottom: 20 }) })).toBe(true);
    expect(isElementOnScreen({ getBoundingClientRect: () => ({ width: 10, height: 10, top: 99999, bottom: 99999 }) })).toBe(false);
  });

  it('forceRevealed clears the hidden inline state', () => {
    const div = document.createElement('div');
    div.style.opacity = '0';
    document.body.appendChild(div);
    forceRevealed([div]);
    expect(notHidden(div)).toBe(true);
    div.remove();
  });

  it('every staggered card reaches full opacity even when the trigger never fires', async () => {
    const { container } = render(
      <Stagger>
        <div data-testid="card">A</div>
        <div data-testid="card">B</div>
        <div data-testid="card">C</div>
      </Stagger>
    );
    const cards = () => [...container.querySelectorAll('[data-testid="card"]')];
    expect(cards().length).toBe(3);
    await waitFor(() => cards().forEach((c) => expect(notHidden(c)).toBe(true)), { timeout: 4000 });
    cleanup();
  });

  it('a card added after the initial render also reaches full opacity', async () => {
    function Grid() {
      const [items, setItems] = useState(['Design Principles', 'Data Basics']);
      return (
        <div>
          <button onClick={() => setItems((x) => [...x, 'Test'])}>add</button>
          <Stagger>
            {items.map((t) => (
              <div key={t} data-testid="card">{t}</div>
            ))}
          </Stagger>
        </div>
      );
    }
    const { container, getByText } = render(<Grid />);
    await waitFor(() => expect(container.querySelectorAll('[data-testid="card"]').length).toBe(2), { timeout: 4000 });
    // Add a course after load (the reported scenario: "Test" appears invisible).
    getByText('add').click();
    await waitFor(() => {
      const cards = [...container.querySelectorAll('[data-testid="card"]')];
      expect(cards.length).toBe(3);
      cards.forEach((c) => expect(notHidden(c)).toBe(true));
      expect(cards.some((c) => c.textContent === 'Test')).toBe(true);
    }, { timeout: 4000 });
    cleanup();
  });

  it('immediate mode reveals all cards on mount (no scroll trigger)', async () => {
    const { container } = render(
      <Stagger immediate>
        <div data-testid="card">A</div>
        <div data-testid="card">B</div>
      </Stagger>
    );
    await waitFor(
      () => [...container.querySelectorAll('[data-testid="card"]')].forEach((c) => expect(notHidden(c)).toBe(true)),
      { timeout: 4000 }
    );
    cleanup();
  });

  it('a Reveal section ends visible', async () => {
    const { container } = render(<Reveal><p data-testid="sec">hello</p></Reveal>);
    await waitFor(() => {
      const box = container.querySelector('div');
      expect(notHidden(box)).toBe(true);
    }, { timeout: 4000 });
    cleanup();
  });
});
