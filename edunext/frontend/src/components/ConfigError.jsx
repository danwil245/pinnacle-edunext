/**
 * Shown instead of the app when a production build was deployed without
 * VITE_API_URL — a loud, clear configuration error rather than a silently broken
 * app (every API call would otherwise fail with a confusing network error).
 */
export default function ConfigError() {
  return (
    <div className="grid min-h-screen place-items-center p-6 text-center">
      <div className="card max-w-lg space-y-4">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/15 text-2xl" aria-hidden>
          ⚙️
        </div>
        <h1 className="font-display text-2xl font-bold">Configuration needed</h1>
        <p className="text-slate-300">
          This build is missing <code className="rounded bg-black/40 px-1">VITE_API_URL</code>, so it doesn’t know
          where the backend is. Set it to your backend URL (for example{' '}
          <code className="rounded bg-black/40 px-1">https://your-api.onrender.com</code>) in the hosting
          project’s environment variables and redeploy.
        </p>
        <p className="text-xs text-slate-500">See DEPLOY.md → Vercel → environment variables.</p>
      </div>
    </div>
  );
}
