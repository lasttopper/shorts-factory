import { db } from "@/db";
import { userSettings, type UserConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getEnv } from "./env";
import { memoryPathFor } from "./memory";
import { unprotectSecret } from "./secret-crypto";

export type ExecCtx = {
  userId: number;
  sourceHandle: string;
  youtubeApiKey: string;
  openaiKey: string;
  openaiModel: string;
  telegramBotToken: string;
  telegramChatId: string;
  ytClientId: string;
  ytClientSecret: string;
  ytRefreshToken: string;
  ytChannelId: string;
  ytChannelTitle: string;
  ytChannelHandle: string;
  ytChannelThumbnail: string;
  uploadEnabled: boolean;
  shortsPerRun: number;
  startHour: number;
  intervalMin: number;
  memoryPath: string;
  artifactTag: string; // folder label for this user's artifacts
};

export async function getUserConfig(userId: number): Promise<UserConfig> {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  return row?.config ?? {};
}

export async function saveUserConfig(userId: number, cfg: UserConfig): Promise<void> {
  const existing = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  if (existing.length) {
    await db.update(userSettings).set({ config: cfg, updatedAt: new Date() }).where(eq(userSettings.userId, userId));
  } else {
    await db.insert(userSettings).values({ userId, config: cfg });
  }
}

/** Merge a user's personal connections over the shared factory .env defaults. */
export async function ctxForUser(userId: number): Promise<ExecCtx> {
  const cfg = userId ? await getUserConfig(userId) : {};
  const positive = (v: any, d: number) => (Number.isFinite(+v) && +v > 0 ? +v : d);
  const hour = (v: any, d: number) => (Number.isFinite(+v) && +v >= 0 && +v <= 23 ? +v : d);
  return {
    userId,
    sourceHandle: cfg.sourceChannelHandle || getEnv("SOURCE_CHANNEL_HANDLE", "@NotYourType"),
    youtubeApiKey: getEnv("YOUTUBE_API_KEY"),
    openaiKey: unprotectSecret(cfg.openaiApiKey) || getEnv("OPENAI_API_KEY"),
    openaiModel: cfg.openaiModel || getEnv("OPENAI_MODEL", "gpt-4o-mini"),
    telegramBotToken: unprotectSecret(cfg.telegramBotToken) || getEnv("TELEGRAM_BOT_TOKEN"),
    telegramChatId: cfg.telegramChatId || getEnv("TELEGRAM_CHAT_ID"),
    ytClientId: cfg.ytClientId || getEnv("YT_CLIENT_ID"),
    ytClientSecret: unprotectSecret(cfg.ytClientSecret) || getEnv("YT_CLIENT_SECRET"),
    ytRefreshToken: unprotectSecret(cfg.ytRefreshToken) || getEnv("YT_REFRESH_TOKEN"),
    ytChannelId: cfg.ytChannelId || "",
    ytChannelTitle: cfg.ytChannelTitle || "",
    ytChannelHandle: cfg.ytChannelHandle || "",
    ytChannelThumbnail: cfg.ytChannelThumbnail || "",
    uploadEnabled: cfg.uploadEnabled ?? getEnv("YOUTUBE_UPLOAD_ENABLED") === "true",
    shortsPerRun: Math.min(15, Math.max(1, positive(cfg.shortsPerRun, parseInt(getEnv("SHORTS_PER_RUN", "10"), 10) || 10))),
    startHour: hour(cfg.startHour, parseInt(getEnv("SCHEDULE_START_HOUR", "9"), 10) || 9),
    intervalMin: positive(cfg.intervalMin, parseInt(getEnv("SLOT_INTERVAL_MIN", "90"), 10) || 90),
    memoryPath: memoryPathFor(userId),
    artifactTag: userId ? `u-${userId}` : "shared",
  };
}

export type IntegrationStatus = {
  id: string;
  label: string;
  live: boolean;
  detail: string;
};

export function ctxStatuses(ctx: ExecCtx): IntegrationStatus[] {
  const ytKey = !!ctx.youtubeApiKey;
  const ytOAuth = !!(ctx.ytClientId && ctx.ytClientSecret && ctx.ytRefreshToken);
  const openai = !!ctx.openaiKey;
  const tg = !!(ctx.telegramBotToken && ctx.telegramChatId);
  const drive = !!(getEnv("GDRIVE_FOLDER_ID") && getEnv("GOOGLE_DRIVE_TOKEN"));
  return [
    { id: "youtube_scan", label: "YouTube scan", live: ytKey, detail: ytKey ? `Live scanning of ${ctx.sourceHandle}` : "Simulation catalog (add API key)" },
    { id: "youtube_upload", label: "Your channel", live: ytOAuth && ctx.uploadEnabled, detail: ytOAuth && ctx.uploadEnabled ? `${ctx.ytChannelTitle || "YouTube connected"} — uploads authorized` : "Not connected — click Connect with YouTube" },
    { id: "openai", label: "AI copywriter", live: openai, detail: openai ? `AI titles/captions (${ctx.openaiModel})` : "Template engine (add OpenAI key)" },
    { id: "telegram", label: "Telegram report", live: tg, detail: tg ? "Report + attachments delivered to your chat" : "Enter your chat ID in My Connections" },
    { id: "gdrive", label: "Drive collab sync", live: drive, detail: drive ? ".env + memory.md synced to team folder" : "Local only (shared vault not configured)" },
  ];
}

export function runModeFor(ctx: ExecCtx): string {
  const s = ctxStatuses(ctx);
  const live = s.filter((x) => x.live).length;
  if (live >= 4) return "live";
  if (live >= 1) return "hybrid";
  return "simulation";
}
