import fs from "fs";
import path from "path";

export const ENV_PATH = path.join(process.cwd(), ".env");

export type EnvKeyDef = {
  key: string;
  label: string;
  group: string;
  secret?: boolean;
  placeholder?: string;
  help?: string;
};

export const ENV_KEYS: EnvKeyDef[] = [
  { key: "SOURCE_CHANNEL_HANDLE", label: "Source channel handle", group: "Source", placeholder: "@NotYourType", help: "The channel shorts are clipped from" },
  { key: "SOURCE_CHANNEL_ID", label: "Source channel ID", group: "Source", placeholder: "UCxxxxxxxx (optional, auto-resolved)" },
  { key: "SHORTS_PER_RUN", label: "Shorts per run", group: "Source", placeholder: "10" },
  { key: "SCHEDULE_START_HOUR", label: "First slot hour (0-23)", group: "Source", placeholder: "9" },
  { key: "SLOT_INTERVAL_MIN", label: "Minutes between slots", group: "Source", placeholder: "90" },
  { key: "YOUTUBE_API_KEY", label: "YouTube Data API key", group: "YouTube", secret: true, help: "Enables live channel scanning (Google Cloud Console)" },
  { key: "YT_CLIENT_ID", label: "OAuth client ID", group: "YouTube", secret: true },
  { key: "YT_CLIENT_SECRET", label: "OAuth client secret", group: "YouTube", secret: true },
  { key: "YT_REFRESH_TOKEN", label: "OAuth refresh token", group: "YouTube", secret: true, help: "Required to upload + schedule on your channel" },
  { key: "YOUTUBE_UPLOAD_ENABLED", label: "Enable real uploads", group: "YouTube", placeholder: "false" },
  { key: "OPENAI_API_KEY", label: "OpenAI API key", group: "AI", secret: true, help: "Titles, descriptions and captions get AI-written" },
  { key: "OPENAI_MODEL", label: "OpenAI model", group: "AI", placeholder: "gpt-4o-mini" },
  { key: "TELEGRAM_BOT_TOKEN", label: "Telegram bot token", group: "Telegram", secret: true, help: "From @BotFather" },
  { key: "TELEGRAM_CHAT_ID", label: "Telegram chat ID", group: "Telegram", secret: true, help: "Where the daily report is delivered" },
  { key: "GDRIVE_FOLDER_ID", label: "Drive folder ID", group: "Google Drive", secret: true, help: "Shared collab folder that stores .env + memory.md" },
  { key: "GOOGLE_DRIVE_TOKEN", label: "Drive OAuth access token", group: "Google Drive", secret: true, help: "Used to push/pull .env and memory.md for collaborators" },
];

export function readEnvFile(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = fs.readFileSync(ENV_PATH, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* file may not exist yet */
  }
  return out;
}

export function getEnv(key: string, fallback = ""): string {
  const v = process.env[key];
  if (v !== undefined && v !== "") return v;
  const file = readEnvFile();
  return file[key] ?? fallback;
}

export function envInt(key: string, fallback: number): number {
  const n = parseInt(getEnv(key, ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function setEnvValues(values: Record<string, string>): void {
  const existingLines = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)
    : [];
  const seen = new Set<string>();
  const next = existingLines.map((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m && m[1] in values) {
      seen.add(m[1]);
      const val = values[m[1]];
      if (val === "") return line; // empty input = keep existing
      return `${m[1]}=${val}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(values)) {
    if (!seen.has(k) && v !== "") next.push(`${k}=${v}`);
  }
  fs.writeFileSync(ENV_PATH, next.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").replace(/\n{3,}/g, "\n\n") + "\n");
  for (const [k, v] of Object.entries(values)) {
    if (v !== "") process.env[k] = v;
  }
}

export function mask(value: string): string {
  if (!value) return "";
  if (value.length <= 6) return "••••••";
  return `${"•".repeat(Math.max(6, value.length - 6))}${value.slice(-4)}`;
}

export type IntegrationStatus = {
  id: string;
  label: string;
  live: boolean;
  detail: string;
};

export function integrationStatuses(): IntegrationStatus[] {
  const ytKey = !!getEnv("YOUTUBE_API_KEY");
  const ytOAuth = !!(getEnv("YT_CLIENT_ID") && getEnv("YT_CLIENT_SECRET") && getEnv("YT_REFRESH_TOKEN"));
  const uploadOn = getEnv("YOUTUBE_UPLOAD_ENABLED") === "true";
  const openai = !!getEnv("OPENAI_API_KEY");
  const tg = !!(getEnv("TELEGRAM_BOT_TOKEN") && getEnv("TELEGRAM_CHAT_ID"));
  const drive = !!(getEnv("GDRIVE_FOLDER_ID") && getEnv("GOOGLE_DRIVE_TOKEN"));
  return [
    { id: "youtube_scan", label: "YouTube scan", live: ytKey, detail: ytKey ? "Live channel scanning via Data API" : "Simulation catalog (add API key)" },
    { id: "youtube_upload", label: "YouTube scheduling", live: ytOAuth && uploadOn, detail: ytOAuth && uploadOn ? "Real uploads + publishAt scheduling" : "Schedule plan only (OAuth + enable flag needed)" },
    { id: "openai", label: "AI copywriter", live: openai, detail: openai ? `AI titles/captions (${getEnv("OPENAI_MODEL", "gpt-4o-mini")})` : "Template engine (add OpenAI key)" },
    { id: "telegram", label: "Telegram report", live: tg, detail: tg ? "Report + attachments delivered to chat" : "Report preview only (add bot token)" },
    { id: "gdrive", label: "Drive collab sync", live: drive, detail: drive ? ".env + memory.md synced to team folder" : "Local .env only (add folder + token)" },
  ];
}
