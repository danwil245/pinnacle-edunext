import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, pingHealth } from '../api/client.js';

/**
 * Cold-start helper. Render-free when the backend answers quickly. On a Render
 * free instance (which sleeps and can take 30–60 s to wake) it shows an
 * unobtrusive, accessible banner with a spinner and retries with backoff up to
 * ~90 s, then offers a manual retry. Only active when the API is on a separate
 * origin (VITE_API_URL set); with the local dev proxy there's no cold start.
 */
const MAX_WAIT_MS = 90000;

export default function ServerWaking() {
  const active = Boolean(API_BASE); // absolute API origin => possible cold start
  const [status, setStatus] = useState('checking'); // checking | ok | waking | error
  const [retryKey, setRetryKey] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!active) {
      setStatus('ok');
      return undefined;
    }
    let cancelled = false;
    const start = Date.now();
    let attempt = 0;

    const loop = async () => {
      const ok = await pingHealth(2500);
      if (cancelled) return;
      if (ok) {
        setStatus('ok');
        return;
      }
      if (Date.now() - start > MAX_WAIT_MS) {
        setStatus('error');
        return;
      }
      setStatus('waking');
      attempt += 1;
      const delay = Math.min(5000, 1000 * attempt);
      timerRef.current = setTimeout(loop, delay);
    };
    loop();
    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [active, retryKey]);

  const retry = useCallback(() => setRetryKey((k) => k + 1), []);

  if (status === 'ok' || status === 'checking') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[95] flex items-center justify-center gap-3 border-b border-white/10 bg-slate-900/95 px-4 py-2 text-sm text-slate-200"
    >
      {status === 'waking' ? (
        <>
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" aria-hidden />
          <span>Waking up the server… this can take up to a minute on the free tier.</span>
        </>
      ) : (
        <>
          <span className="text-amber-300">Couldn’t reach the server.</span>
          <button onClick={retry} className="rounded-md bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/20">
            Try again
          </button>
        </>
      )}
    </div>
  );
}
