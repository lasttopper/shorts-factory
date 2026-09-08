# Shorts Factory — Multi-User Shorts Automation

Every teammate gets a private pipeline: select a source channel they own/manage or are licensed to repurpose, pick an unused video, cut 10 vertical Shorts with burned bottom captions, write titles/descriptions/hashtags, create thumbnails, upload and schedule all 10 on **their own** connected YouTube channel, then receive the batch report in **their own** Telegram chat. Per-user PostgreSQL memory prevents accidental repeats.

## Run on Google Colab (free demo, zero setup)

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/lasttopper/shorts-factory/blob/main/colab/Shorts_Factory_on_Colab.ipynb)

Open the notebook → **Runtime → Run all** (~8 min) → paste your Neon database URLs when prompted → get a public `trycloudflare.com` URL. Great for testing the full multi-user flow locally-free before deploying. Sessions last ~12 h; use Vercel for production.

## Deploy free on Vercel + Neon (no card, permanent)

All state lives in PostgreSQL — the app is fully serverless-compatible.

1. Create a free [Neon](https://neon.com) project → copy the **pooled** connection string (`DATABASE_URL`) and **direct** string (`DATABASE_URL_UNPOOLED`).
2. Push this repo to GitHub → [vercel.com](https://vercel.com) → **Add New Project** → import it (sign in with GitHub, no card).
3. Add Environment Variables:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | Neon **pooled** URL |
   | `DATABASE_URL_UNPOOLED` | Neon **direct** URL |
   | `AUTH_SECRET` | permanent random 32+ byte string (never change) |
   | `YOUTUBE_API_KEY` | Google Cloud → YouTube Data API v3 |
   | `TELEGRAM_BOT_TOKEN` | @BotFather |
   | `APP_URL` | your `https://<project>.vercel.app` (set after first deploy) |
   | `OPENAI_API_KEY` | optional AI copywriter |
4. **Deploy**, then follow **“Enable ‘Connect with YouTube’”** below.
5. Free daily automation: use [cron-job.org](https://cron-job.org) (free) → POST `https://<project>.vercel.app/api/pipeline/run` with header `Cookie: sf_session=<your cookie>`.

> On serverless, system keys are read-only in the app (manage them as env vars). Each user's source channel, Telegram chat ID, YouTube connection, AI key and schedule still save normally — they live in the database. The whole batch pipeline runs inside one request (~15–45 s, within the 300 s function limit).

## Deploy free on Render (no VPS needed)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

1. Push this repo to GitHub (public or private).
2. Go to **render.com → New → Blueprint** and select the repo — `render.yaml` provisions a **free web service + free PostgreSQL** automatically.
3. For Neon or another external PostgreSQL provider, set `DATABASE_URL` to its **pooled** URL and `DATABASE_URL_UNPOOLED` to its **direct** URL. Drizzle uses the direct URL for schema setup; the app uses the pooler at runtime.
4. When deploy finishes, open your public URL and **create your account**.
4. In Render → your service → **Environment**, add optional live-integration keys:
   | Key | Purpose |
   |---|---|
   | `YOUTUBE_API_KEY` | Live scans of the source channel |
   | `APP_URL` | Permanent public URL, e.g. `https://your-app.example.com` |
   | `YT_CLIENT_ID` + `YT_CLIENT_SECRET` | One shared Google Web OAuth client; enables every user's **Connect with YouTube** button |
   | `TELEGRAM_BOT_TOKEN` | One shared factory bot (each user adds only their chat ID in-app) |
   | `OPENAI_API_KEY` | AI-written titles/captions instead of templates |
   | `GITHUB_TOKEN` + `GITHUB_STATE_REPO` | Commit memory.md + reports to GitHub |

   > Set keys as **env vars here**, not only via the in-app settings UI — the free plan's disk is ephemeral, so UI-saved `.env` entries reset on redeploy, while env vars persist forever. **Dedupe is safe either way**: used-video locks live in the persistent database too.
5. In Google Cloud, enable **YouTube Data API v3**, configure the OAuth consent screen, and create a **Web application** OAuth client. Add `${APP_URL}/api/oauth/youtube/callback` as an exact Authorized redirect URI.
6. Each teammate: registers → clicks **Connect with YouTube** → chooses their Google/YouTube account → approves access → returns with their channel connected automatically. They then set their **source channel handle** and **Telegram chat ID**, and hit **RUN TODAY'S BATCH**. Users never paste a client secret or refresh token.

## Zero-touch rendering + YouTube scheduling

On a persistent Node host such as Render, one run now performs the full media workflow without a file picker:

1. Scan the configured source channel and choose an unused long-form video.
2. Download one 720p working copy with `yt-dlp` to temporary storage.
3. Render 10 sequential 720×1280 MP4s with FFmpeg and burn the generated bottom captions.
4. Upload every MP4 with YouTube's resumable upload API.
5. Create each video as private with an ISO `publishAt`, so YouTube releases it at its assigned slot.
6. Apply the generated thumbnail, update Telegram/GitHub state, then delete every temporary media file.

Each user must enable **ZERO-TOUCH VIDEO FACTORY**, connect their destination YouTube channel, and confirm they own/manage or are licensed to repurpose the source content. Unauthorized copying can cause copyright claims or channel strikes. The worker intentionally refuses to download until that confirmation is saved.

The default Render worker uses one FFmpeg thread, 720×1280 output, and processes clips sequentially to stay within a small instance's memory. A 10-clip batch can take several minutes.

## State on GitHub (no Google Drive)

Set `GITHUB_TOKEN` (fine-grained PAT with **Contents: read/write** on your repo) and optionally `GITHUB_STATE_REPO` (defaults to `lasttopper/shorts-factory`). Every run then commits:

- `state/memory-u<id>.md` — that user's locked-video history
- `state/runs/run-<id>.md` — the full batch report

Anyone can read or restore state from the repo (**Pull state from GitHub** in the app). Secrets are never committed to GitHub.

## Daily auto-run via cron

1. Set `CRON_SECRET` in your host's environment variables.
2. Each user enables **AUTO-RUN MY PIPELINE DAILY** in Connections & Keys.
3. Trigger the endpoint daily — `vercel.json` already schedules it at 07:00 UTC:

```
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/cron/run
```

Runs everyone who opted in (max one batch per user per 20 hours), reports to each user's Telegram, and commits state to GitHub. cron-job.org works too if you want a different time.

## Enable “Connect with YouTube” (administrator, one time)

1. Open [Google Cloud Console](https://console.cloud.google.com), create/select a project, then enable **YouTube Data API v3**.
2. Open **Google Auth Platform / OAuth consent screen**:
   - Choose **External** for users outside your Workspace.
   - Add app name, support email and developer email.
   - While testing, add every intended Google account under **Test users**.
3. Open **Credentials → Create credentials → OAuth client ID → Web application**.
4. Add this exact **Authorized redirect URI** (scheme, host, and path must match):
   ```
   https://YOUR-PUBLIC-APP/api/oauth/youtube/callback
   ```
5. On your host, set these persistent environment variables:
   ```
   APP_URL=https://YOUR-PUBLIC-APP
   YT_CLIENT_ID=...apps.googleusercontent.com
   YT_CLIENT_SECRET=GOCSPX-...
   YOUTUBE_API_KEY=AIza...   # source-channel scanning
   AUTH_SECRET=<stable random 32+ byte value>
   ```
6. Redeploy. Every logged-in user now sees **Connect with YouTube** on the dashboard and Connections page. They choose a Google account, approve `youtube.upload` + `youtube.readonly`, and return automatically. The app identifies the channel and encrypts that user's refresh token in PostgreSQL.

The first registered account is the **admin** and can see shared system settings. Later accounts are **members** and can only manage their own source channel, YouTube connection, Telegram destination, AI override and schedule. Users cannot access another user's runs or artifacts.

> Google OAuth apps left in **Testing** are limited to configured test users, and Google may expire testing refresh tokens. For a public multi-user service, complete Google's production/verification requirements before inviting unrestricted users.

### Free-plan notes
- The service **sleeps after ~15 min idle** — first visit takes up to ~60 s to wake.
- Free PostgreSQL **expires after 90 days** — export/recreate when Render emails you.
- Temporary source/MP4 files exist only during a worker run and are deleted afterward; metadata, memory, thumbnails and reports remain in PostgreSQL.

### Free daily automation
No server cron needed — use [cron-job.org](https://cron-job.org) or the included GitHub Actions workflow to call `/api/cron/run` with `Authorization: Bearer <CRON_SECRET>`. Every opted-in user then receives a full automatic render/upload batch.

## Local development
```bash
npm install
npx drizzle-kit push --force   # needs DATABASE_URL in .env
npm run dev
```

## Stack
Next.js (App Router) · PostgreSQL + Drizzle ORM · yt-dlp · FFmpeg · sharp · Tailwind · Telegram Bot API · YouTube Data API v3 + per-user OAuth · GitHub Contents API.
