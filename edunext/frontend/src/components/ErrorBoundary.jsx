import { Component } from 'react';

/**
 * App-wide error boundary. Without one, any render error — or a failed lazy-chunk
 * import after a redeploy (stale `index.html` pointing at chunk hashes that no
 * longer exist) — unmounts the whole tree to a blank screen. This catches both:
 * stale-chunk errors trigger a single automatic reload (guarded against loops);
 * anything else shows a readable recovery card instead of a blank page.
 */
const CHUNK_RE = /Loading chunk|dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i;
const RELOAD_FLAG = 'edunext_chunk_reloaded';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidMount() {
    // Reached a clean render — clear the one-shot reload guard so a *future*
    // stale-chunk error is still allowed to auto-reload once.
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      /* ignore */
    }
  }

  componentDidCatch(error) {
    // A stale lazy-chunk after a rebuild: reload once to pick up the new index.html.
    if (CHUNK_RE.test(error?.message || '')) {
      try {
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, '1');
          window.location.reload();
          return;
        }
      } catch {
        /* ignore storage failures */
      }
    }
    // eslint-disable-next-line no-console
    console.error('[EduNext] Uncaught error:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const isChunk = CHUNK_RE.test(this.state.error?.message || '');
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div className="card max-w-md space-y-4">
          <h1 className="font-display text-2xl font-bold">Something needs a refresh</h1>
          <p className="text-slate-300">
            {isChunk
              ? 'The app was updated in the background. Reload to get the latest version.'
              : 'An unexpected error interrupted this page. Reloading usually fixes it.'}
          </p>
          <button
            className="btn-primary mx-auto"
            onClick={() => {
              try {
                sessionStorage.removeItem(RELOAD_FLAG);
              } catch {
                /* ignore */
              }
              window.location.assign('/');
            }}
          >
            Reload EduNext
          </button>
          {!isChunk && (
            <pre className="max-h-40 overflow-auto rounded-lg bg-black/40 p-3 text-left text-xs text-rose-300">
              {String(this.state.error?.message || this.state.error)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
