import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getUserConfig, saveUserConfig } from "@/lib/context";
import type { UserConfig } from "@/db/schema";
import { protectSecret } from "@/lib/secret-crypto";
import { oauthAppReady, youtubeRedirectUri } from "@/lib/youtube-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECRET_KEYS = new Set(["ytClientSecret", "ytRefreshToken", "openaiApiKey", "telegramBotToken"]);
const mask = (v?: string) => (v ? "••••••••••••" : "");

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cfg = await getUserConfig(user.id);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) {
    out[k] = SECRET_KEYS.has(k) ? mask(v as string) : v;
  }
  const set: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(cfg)) set[k] = !!v;
  return NextResponse.json({
    config: out,
    set,
    youtubeOAuth: {
      ready: oauthAppReady(),
      redirectUri: youtubeRedirectUri(req),
      connected: !!(cfg.ytRefreshToken && cfg.ytChannelId),
    },
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { config } = await req.json().catch(() => ({ config: {} }));
  const current = await getUserConfig(user.id);
  const next: UserConfig = { ...current };

  const publicStringKeys: (keyof UserConfig)[] = [
    "sourceChannelHandle",
    "telegramChatId",
    "ytClientId", // legacy manual mode
    "openaiModel",
  ];
  for (const k of publicStringKeys) {
    const v = config[k];
    if (typeof v === "string" && v.trim() !== "") (next as any)[k] = v.trim();
  }

  const secretStringKeys: (keyof UserConfig)[] = [
    "telegramBotToken",
    "ytClientSecret", // legacy manual mode
    "ytRefreshToken", // legacy manual mode
    "openaiApiKey",
  ];
  for (const k of secretStringKeys) {
    const v = config[k];
    if (typeof v === "string" && v.trim() !== "") (next as any)[k] = protectSecret(v.trim());
  }

  if (typeof config.uploadEnabled === "boolean") next.uploadEnabled = config.uploadEnabled;
  if (typeof config.autoRunEnabled === "boolean") next.autoRunEnabled = config.autoRunEnabled;
  const numKeys: (keyof UserConfig)[] = ["shortsPerRun", "startHour", "intervalMin"];
  for (const k of numKeys) {
    const n = parseInt(config[k], 10);
    if (Number.isFinite(n) && n >= 0) (next as any)[k] = n;
  }
  await saveUserConfig(user.id, next);
  return NextResponse.json({ ok: true });
}
