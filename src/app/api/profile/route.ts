import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getUserConfig, saveUserConfig } from "@/lib/context";
import type { UserConfig } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECRET_KEYS = new Set(["ytClientId", "ytClientSecret", "ytRefreshToken", "openaiApiKey", "telegramBotToken"]);
const mask = (v?: string) => (v ? (v.length > 6 ? `••••••${v.slice(-4)}` : "••••••") : "");

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cfg = await getUserConfig(user.id);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) {
    out[k] = SECRET_KEYS.has(k) ? mask(v as string) : v;
  }
  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) raw[k] = !!v; // "set" flags incl. secrets
  return NextResponse.json({ config: out, set: raw });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { config } = await req.json().catch(() => ({ config: {} }));
  const current = await getUserConfig(user.id);
  const next: UserConfig = { ...current };

  const strKeys: (keyof UserConfig)[] = ["sourceChannelHandle", "telegramChatId", "telegramBotToken", "ytClientId", "ytClientSecret", "ytRefreshToken", "openaiApiKey", "openaiModel"];
  for (const k of strKeys) {
    const v = config[k];
    if (typeof v === "string") {
      const t = v.trim();
      if (t !== "") (next as any)[k] = t; // empty input keeps existing value
    }
  }
  if (typeof config.uploadEnabled === "boolean") next.uploadEnabled = config.uploadEnabled;
  const numKeys: (keyof UserConfig)[] = ["shortsPerRun", "startHour", "intervalMin"];
  for (const k of numKeys) {
    const n = parseInt(config[k], 10);
    if (Number.isFinite(n) && n > 0) (next as any)[k] = n;
  }
  await saveUserConfig(user.id, next);
  return NextResponse.json({ ok: true });
}
