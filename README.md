# EduNext

**A self-hosted course platform that adapts to how *you* learn, using on-device attention and emotion sensing.**

EduNext watches how a learner is doing *while* they learn (blink rate, facial expression, and short in-lesson feedback), builds a **personal baseline** for each learner, and uses it to adapt pace, breaks, replays and lesson format. Everything is sensed in the browser: **video never leaves your device.**

**Live demo:** https://edunext.vercel.app

> University project, SSN College of Engineering. Guide: Dr. S. Mohanavalli. Team: Midhush Kanna and [danwil245](https://github.com/danwil245).

---

## Why EduNext

Self-paced online learning has a huge drop-out problem, and platforms only see clicks and watch time. A learner can be lost or checked out and nobody knows until they quit. Blink rate is a well-studied, low-cost signal of attention, but it differs a lot from person to person, so one universal threshold is unreliable. EduNext measures each learner against **their own baseline** instead.

## How it works

1. **Onboarding calibration.** The learner picks an interest, then watches one clip on that topic and one neutral clip while blink rate and expression are measured. This builds a personal model: their own blink-rate zones and emotion baseline.
2. **Style probe.** Two short clips (one visual-style, one hands-on-style) give an early estimate of the format the learner engages with more: **visual** or **practical**.
3. **Live sensing during lessons.** Three signals are combined into one rolling **engagement score**:

   | Signal | How it is measured | Default weight |
   |---|---|---|
   | Blink rate | MediaPipe FaceMesh, Eye Aspect Ratio, rolling BPM against the personal baseline | 0.45 |
   | Emotion | In-browser face expression model, mapped to engaged / neutral / confused / frustrated / bored | 0.35 |
   | Feedback | Short in-lesson prompts (thumbs, difficulty, "still with us?") | 0.20 |

   Weights are renormalized over whichever signals are available, then smoothed with an exponential moving average.
4. **Adaptive curation.** Based on the score and its trend, EduNext can suggest a break, replay a section, switch the lesson variant (visual or practical), slow down, or speed up, with warm-up and cooldown rules so it does not nag.
5. **Recommendation.** Courses are ranked using the learner's interests and learning-style profile, with a "why recommended" explanation. Lessons are served in the preferred variant, with a small exploration rate so the estimate keeps improving.

### Attention zones

Blink rate maps to five zones: **hyperfocused, attentive, neutral, fatigued, sleepy**. Default boundaries are `[8, 15, 21, 31]` blinks per minute. After calibration they are rescaled per learner from their engaged and neutral readings (falling back to the defaults if the two readings are too close to be meaningful).

## Tech stack

- **Frontend:** React 18, Vite 5, Tailwind CSS, Recharts, GSAP, Lenis, Vanta (animated backgrounds)
- **Sensing (in-browser):** MediaPipe FaceMesh, `@vladmandic/face-api`
- **Backend:** Node.js, Express 4, SQLite (`better-sqlite3`), JWT auth, `bcryptjs`, `zod` validation
- **Shared logic:** pure, unit-tested JavaScript in `shared/` (zones, emotion mapping, engagement, curation, style detection, recommendation)
- **Testing:** Vitest, Supertest, Playwright
- **Hosting:** Vercel (frontend), Render (backend)

## Repository layout

```
.
├── shared/      # Pure logic and config used by both sides (unit-tested)
├── backend/     # Express API, SQLite schema, migrations, seed content
├── frontend/    # React app: pages, tracking layer, onboarding, lesson player
├── e2e/         # Playwright end-to-end and deploy smoke tests
├── scripts/     # Perf measurement and pre-deploy checks
├── docs/        # Notes, reports and screenshots
├── render.yaml  # Render blueprint (backend)
└── vercel.json  # Vercel config (frontend)
```

## Getting started (local)

**Requirements:** Node.js 20 or newer, a modern Chromium-based browser, and a webcam (or use mock mode, below).

```bash
git clone https://github.com/danwil245/pinnacle-edunext.git
cd pinnacle-edunext        # if EduNext still lives in a subfolder, cd into it (e.g. cd edunext)

npm install
cp backend/.env.example backend/.env       # then set JWT_SECRET
cp frontend/.env.example frontend/.env     # VITE_API_URL=http://localhost:4000

npm run seed       # creates the database and placeholder courses
npm run dev        # frontend on http://localhost:5173, backend on http://localhost:4000
```

Open http://localhost:5173, register, and complete onboarding. Browsers only allow camera access on `localhost` or HTTPS.

### Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start frontend and backend together |
| `npm run seed` | Create and seed the database (idempotent) |
| `npm test` | Run all unit and integration tests |
| `npm run build` | Production build |
| `npm run test:deploy` | Two-origin end-to-end smoke test (Playwright) |
| `npm run predeploy` | Checks configs, env vars and build output before deploying |

(Some scripts depend on which build phases are present in your copy. Run `npm run` to list what exists.)

### Mock mode and demo

No camera, or a webcam that reads poorly in the room? EduNext has a **mock signal source** that feeds scripted blink and emotion data, so the full adaptive flow can be shown without a camera. Use the `/dev` page to toggle it, and `/demo` for a captioned, scripted scenario (engaged, drifting, fatigued, recovery). The scripted scenario is a **simulation**, not a live reading, and is labeled as such in the app.

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `VITE_API_URL` | frontend | Backend base URL (no trailing slash) |
| `JWT_SECRET` | backend | Token signing secret (required in production, use a long random value) |
| `CORS_ORIGINS` | backend | Comma-separated list of allowed frontend origins |
| `DATABASE_PATH` | backend | Location of the SQLite file |
| `PORT`, `NODE_ENV` | backend | Provided by the host in production |

Never commit real secrets. Only `.env.example` files are tracked.

## Deployment

The frontend deploys to **Vercel** and the backend to **Render**. See [`DEPLOY.md`](./DEPLOY.md) for exact settings. Short version:

1. Deploy the backend on Render, then check `/health`.
2. Deploy the frontend on Vercel with `VITE_API_URL` set to the Render URL.
3. Set `CORS_ORIGINS` on Render to the exact Vercel URL and redeploy.

**Free-tier notes:** the Render backend sleeps after about 15 minutes of inactivity, so the first request can take 30 to 60 seconds (the app shows a "waking up" banner). The free tier has no persistent disk, so the database can reset on restart or redeploy and accounts may disappear. Open the site a few minutes before a demo.

## Privacy

- Camera frames and video **never leave the browser.** All face processing runs on-device.
- Only derived numbers and labels (blink rate, zone, emotion label, engagement score) are sent to the server and stored.
- The tick upload schema is covered by an automated test that fails if any image, blob or base64 field appears.
- Learners can recalibrate or delete all their data from the Profile page.

## Limitations (please read)

- The link between blink rate and attention is supported by **population-level research**, but EduNext's output is an **estimate for one person, not a diagnosis.** Blink rate is also affected by screen use, lighting, dry eyes, contact lenses, medication and caffeine.
- A short calibration yields only a small number of blinks, so the personal baseline is **noisy.** The app says so and allows recalibration.
- The emotion mapping (facial expression classes to engaged, confused, frustrated, bored) is a **heuristic**, not a validated affect model. A facial expression is not an internal state.
- "Visual vs practical" is a lightweight engagement-based preference signal, not an innate trait. The learning-styles literature is contested, so the app phrases it as "the format you engage with more."
- Course content is **placeholder.**
- The hosted demo runs on free tiers (see Deployment).

## Research background

- Nakano, Yamamoto, Kitajo, Takahashi, Kitazawa (2009). *Synchronization of spontaneous eyeblinks while viewing video stories.* Proc. R. Soc. B.
- Nakano, Kato, Morito, Itoi, Kitazawa (2013). *Blink-related momentary activation of the default mode network while viewing videos.* PNAS.
- Maffei and Angrilli (2018). *Spontaneous blink rate as an index of attention and emotion during film clips viewing.* Physiology and Behavior.
- Ranti, Jones, Klin, Shultz (2020). *Blink rate patterns provide a reliable measure of individual engagement with scene content.* Scientific Reports.
- Chidi-Egboka et al. (2023). Blink behavior during reading on digital devices.

## Roadmap

- Replace placeholder content with real courses
- Larger pilot study of the personal baseline and learning-style signal
- Persistent database for the hosted version
- A better-validated emotion model

## Team

- Midhush Kanna
- [danwil245](https://github.com/danwil245)

**Guide:** Dr. S. Mohanavalli, SSN College of Engineering

## License

Add a license before making this repository public (for example MIT), or keep it private as a university project.
