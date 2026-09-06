# Shorts Factory — Multi-User Shorts Automation

Every teammate gets a private pipeline: pick an unused video from any source channel (e.g. @NotYourType), cut the 10 best moments into Shorts with bottom captions, auto-write titles/descriptions/hashtags, design thumbnails, schedule 10 uploads per day on **their own** YouTube channel, and receive the full batch report (with attachments) in **their own** Telegram chat. A per-user `memory.md` guarantees no source video is ever clipped twice.

## Deploy free on Render (no VPS needed)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

1. Push this repo to GitHub (public or private).
2. Go to **render.com → New → Blueprint** and select the repo — `render.yaml` provisions a **free web service + free PostgreSQL** automatically.
3. When deploy finishes, open your `https://<name>.onrender.com` URL and **create your account**.
4. In Render → your service → **Environment**, add optional live-integration keys:
   | Key | Purpose |
   |---|---|
   | `YOUTUBE_API_KEY` | Live scans of the source channel |
   | `TELEGRAM_BOT_TOKEN` | One shared factory bot (each user adds only their chat ID in-app) |
   | `OPENAI_API_KEY` | AI-written titles/captions instead of templates |
   | `GDRIVE_FOLDER_ID` + `GOOGLE_DRIVE_TOKEN` | Collab vault (.env + memory.md sync) |

   > Set keys as **env vars here**, not only via the in-app settings UI — the free plan's disk is ephemeral, so UI-saved `.env` entries reset on redeploy, while env vars persist forever. **Dedupe is safe either way**: used-video locks live in the persistent database too.
5. Each teammate: registers → **Connections & Keys → MY CONNECTIONS** → sets their **source channel handle**, **Telegram chat ID**, and their **YouTube channel OAuth** (client ID/secret/refresh token, scope `youtube.upload`) → hits **RUN TODAY'S BATCH**.

### Free-plan notes
- The service **sleeps after ~15 min idle** — first visit takes up to ~60 s to wake.
- Free PostgreSQL **expires after 90 days** — export/recreate when Render emails you.
- Files written at runtime (`memory.md`, thumbnails) regenerate per run; DB remains the source of truth.

### Free daily automation
No server cron needed — use [cron-job.org](https://cron-job.org) (free) or a GitHub Actions scheduled workflow to POST `/api/pipeline/run` with your login cookie daily.

## Local development
```bash
npm install
npx drizzle-kit push --force   # needs DATABASE_URL in .env
npm run dev
```

## Stack
Next.js (App Router) · PostgreSQL + Drizzle ORM · sharp (thumbnail rendering) · Tailwind · Telegram Bot API · YouTube Data API v3 + OAuth · Google Drive API.
