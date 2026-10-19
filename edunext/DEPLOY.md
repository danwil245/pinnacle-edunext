# Deploying EduNext

> **LIVE** (deployed):
> - Frontend (Vercel): https://edunext-learn.vercel.app
> - Backend (Render): https://edunext-api-jsg9.onrender.com (`/health` → ok)
> - Auto-deploy on push to `main` is ON for both. `CORS_ORIGINS` on Render = the Vercel URL.

Two free services: **frontend on Vercel** (static Vite build) and **backend on
Render** (Express + better-sqlite3). The frontend talks to the backend over HTTPS
using the `VITE_API_URL` you set on Vercel; the backend only allows the exact
Vercel origin via `CORS_ORIGINS`.

> **APP_ROOT is `edunext/`** (the folder whose `package.json` has `workspaces`).
> `vercel.json` lives in `edunext/`; `render.yaml` lives in `edunext/` too (move it
> to the connected repo's root and set `rootDir: edunext` if you connect a parent
> repo). See "Repository layout" at the bottom — it matters for a monorepo.

## Exact values to enter

**Vercel (frontend)**
| Setting | Value |
|---|---|
| Root Directory | `edunext` |
| Framework Preset | Other (uses `vercel.json`) |
| Install Command | `npm install` (from `vercel.json`) |
| Build Command | `npm run build` (from `vercel.json`) |
| Output Directory | `frontend/dist` (from `vercel.json`) |
| Env var (Production) | `VITE_API_URL` = `https://<your-render-service>.onrender.com` (no trailing slash) |

**Render (backend)** — easiest is the Blueprint (`render.yaml`):
| Setting | Value |
|---|---|
| Build Command | `npm install` |
| Start Command | `npm run start -w @edunext/backend` |
| Health Check Path | `/health` |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | generate a strong one (Blueprint sets `generateValue: true`) |
| `CORS_ORIGINS` | your Vercel URL, e.g. `https://edunext.vercel.app` (no trailing slash) |
| `DATABASE_PATH` | `./data/edunext.db` (ephemeral) or `/var/data/edunext.db` with a disk |

## Step-by-step

### 1. Push to GitHub
Commit everything and push to your repo. (See "Repository layout" — if EduNext is a
nested repo it must be a real subfolder of the pushed repo first.)

### 2. Deploy the backend on Render (do this first — you need its URL)
1. Render → **New +** → **Blueprint** → pick the repo → it reads `render.yaml` → **Apply**.
   (Or **New + → Web Service** and type the Build/Start commands + env vars above.)
2. Render generates `JWT_SECRET`. Leave `CORS_ORIGINS` as a placeholder for now.
3. Wait until it says **Live**, then open `https://<service>.onrender.com/health` in a
   browser — you should see `{"status":"ok",...}` (first hit may take ~30–60 s to wake).
4. Copy the service URL.

### 3. Deploy the frontend on Vercel
1. Vercel → **Add New… → Project** → pick the repo.
2. Set **Root Directory** = `edunext`. Vercel reads `vercel.json` for the rest.
3. Add env var **`VITE_API_URL`** = the Render URL (no trailing slash), for **Production**.
4. **Deploy**. Copy the Vercel production URL.

### 4. Wire CORS
Back in Render → your service → **Environment** → set **`CORS_ORIGINS`** to the exact
Vercel URL (no trailing slash) → **Save** (it redeploys).

### 5. Test the live site
Open the Vercel URL and check:
- Register + log in work (if it hangs a moment, the backend was asleep — the "Waking
  up the server…" banner should show and clear).
- Allow the **camera** when prompted (needs HTTPS — Vercel provides it).
- Calibration, a lesson, and the summary work.
- **Hard-refresh** a deep link like `/home` or `/learn/1` → it loads (no 404).
- Open DevTools console: no CORS errors, no 404s on `/models/*`, `/mediapipe/*.wasm`,
  or clip assets.

### 6. Before presenting
- Open the site a few minutes early to **wake the free backend**.
- The free database **resets on restart** — accounts can disappear; re-register.
- Keep **`/demo`** (scripted simulation) as a fallback if the webcam read is poor.

## Free-tier limitations (honest)
- **Render free sleeps** after ~15 min idle; the first request then takes ~30–60 s.
  The frontend shows a waking banner and retries, so it recovers on its own.
- **No persistent disk on free** → the SQLite DB is ephemeral; a restart/redeploy
  wipes accounts and sessions (placeholder courses auto-reseed). Attach a disk
  (paid) and set `DATABASE_PATH=/var/data/edunext.db` to persist.
- Cold starts can make the very first API call slow — idempotent GETs retry once.

## Troubleshooting
| Symptom | Cause / fix |
|---|---|
| CORS error in console | `CORS_ORIGINS` doesn't exactly match the Vercel origin (trailing slash, http vs https). Set it exactly, redeploy. |
| 404 on refresh of `/home` etc. | SPA fallback missing — ensure `vercel.json` `rewrites` is deployed (Root Directory = `edunext`). |
| Camera never prompts | Needs HTTPS (Vercel gives it) and `Permissions-Policy: camera=(self)` (in `vercel.json`). Localhost also works. |
| `/models/*` or `*.wasm` 404 | Model files missing from the build. They're in `frontend/public/{models,mediapipe}` and copied by `postinstall`; run `npm run predeploy` to confirm they're in `frontend/dist`. |
| `better-sqlite3` build fails on Render | Node version mismatch — the repo pins Node 20 (`.nvmrc`, `engines`). Ensure Render uses Node 20. |
| 502 / timeout on first request | Cold start — wait up to ~60 s; the waking banner handles it. |
| "Configuration needed" page | `VITE_API_URL` wasn't set for the production build. Set it on Vercel and redeploy. |
| Login/register "fails" intermittently | Usually a cold start; retry. Check the Render logs for errors. |

## Redeploy & maintenance
- **Redeploy:** push to the deployed branch — both platforms auto-deploy (`autoDeploy`).
- **Change env vars:** Vercel/Render dashboards → redeploy. Changing `VITE_API_URL`
  requires a frontend rebuild (Vercel does this on redeploy).
- **Logs:** Render → service → Logs; Vercel → project → Deployments → Logs.
- **Custom domain:** add it in Vercel, then add the domain to Render `CORS_ORIGINS`.
- **Preview deploys:** Vercel builds every PR; to allow their CORS, set
  `CORS_ORIGIN_PATTERNS` on Render to a regex like `^https://edunext-[a-z0-9-]+\.vercel\.app$`.

## Local production-like test
```bash
# Terminal 1 — backend (production mode)
cd edunext/backend
DATABASE_PATH=./data/smoke.db NODE_ENV=production \
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  CORS_ORIGINS=http://localhost:4173 PORT=4000 node src/index.js

# Terminal 2 — frontend built against that backend, served on a different port
cd edunext/frontend
VITE_API_URL=http://localhost:4000 VITE_MOCK_SIGNALS=1 npx vite build
npx vite preview --port 4173

# Terminal 3 — the smoke test + static checks
cd edunext
FRONTEND_URL=http://localhost:4173 API_URL=http://localhost:4000 npm run test:deploy
npm run predeploy
```

## Repository layout (important for this monorepo)
Vercel/Render deploy the files that are in the GitHub repo. EduNext lives in
`edunext/`. If `edunext/` is an **embedded/nested git repo**, the parent repo only
stores a pointer and the app's files are **not** actually pushed — deploys would get
an empty `edunext`. Make `edunext/` a normal subfolder of the repo you connect
(remove the nested `.git`, `git add edunext`, commit, push), **or** connect a repo
whose root *is* the EduNext app. With `edunext/` as a subfolder: Vercel Root
Directory = `edunext`; move `render.yaml` to the repo root and set `rootDir: edunext`.
