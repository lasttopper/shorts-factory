# Shorts Factory — Multi-User Shorts Automation

Every teammate gets a private pipeline: pick an unused video from any source channel (e.g. @NotYourType), cut the 10 best moments into Shorts with bottom captions, auto-write titles/descriptions/hashtags, design thumbnails, schedule 10 uploads per day on **their own** YouTube channel, and receive the full batch report (with attachments) in **their own** Telegram chat. A per-user `memory.md` guarantees no source video is ever clipped twice.

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
   | `GDRIVE_FOLDER_ID` + `GOOGLE_DRIVE_TOKEN` | Collab vault (.env + memory.md sync) |

   > Set keys as **env vars here**, not only via the in-app settings UI — the free plan's disk is ephemeral, so UI-saved `.env` entries reset on redeploy, while env vars persist forever. **Dedupe is safe either way**: used-video locks live in the persistent database too.
5. In Google Cloud, enable **YouTube Data API v3**, configure the OAuth consent screen, and create a **Web application** OAuth client. Add `${APP_URL}/api/oauth/youtube/callback` as an exact Authorized redirect URI.
6. Each teammate: registers → clicks **Connect with YouTube** → chooses their Google/YouTube account → approves access → returns with their channel connected automatically. They then set their **source channel handle** and **Telegram chat ID**, and hit **RUN TODAY'S BATCH**. Users never paste a client secret or refresh token.

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
