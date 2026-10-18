import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { useEffect } from 'react';
import userEvent from '@testing-library/user-event';
import { SmoothScrollProvider } from '../src/motion/SmoothScrollProvider.jsx';

/**
 * Architecture invariant: anything mounted ABOVE <Routes> (the SmoothScrollProvider,
 * and in the real app the TrackingProvider camera/FaceMesh) must NOT remount when the
 * route changes. This mirrors how the persistent tracker survives navigation. If this
 * test ever fails, the camera stream would be torn down on every navigation.
 */
function Persistent({ onMount }) {
  useEffect(() => {
    onMount();
  }, [onMount]);
  return <div data-testid="persistent" />;
}

describe('route changes do not remount providers above <Routes>', () => {
  it('keeps a single mount across navigation', async () => {
    const mountSpy = vi.fn();
    render(
      <MemoryRouter initialEntries={['/a']}>
        <SmoothScrollProvider>
          <Persistent onMount={mountSpy} />
          <nav>
            <Link to="/a">a</Link>
            <Link to="/b">b</Link>
          </nav>
          <Routes>
            <Route path="/a" element={<div>page a</div>} />
            <Route path="/b" element={<div>page b</div>} />
          </Routes>
        </SmoothScrollProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('page a')).toBeInTheDocument();
    await act(async () => {
      await userEvent.click(screen.getByText('b'));
    });
    expect(screen.getByText('page b')).toBeInTheDocument();
    // Persistent sibling mounted exactly once despite the route change.
    expect(mountSpy).toHaveBeenCalledTimes(1);
  });
});
