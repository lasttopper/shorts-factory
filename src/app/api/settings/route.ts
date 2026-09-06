import { NextResponse } from "next/server";
import { ENV_KEYS, ENV_PATH, getEnv, mask, setEnvValues } from "@/lib/env";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });
  return NextResponse.json({
    path: ENV_PATH,
    readOnly: !!process.env.VERCEL,
    readOnlyReason: process.env.VERCEL
      ? "This host is serverless — set system keys as Environment Variables in the Vercel dashboard."
      : undefined,
    keys: ENV_KEYS.map((def) => ({
      ...def,
      set: !!getEnv(def.key),
      masked: def.secret ? mask(getEnv(def.key)) : getEnv(def.key),
    })),
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });
  if (process.env.VERCEL) {
    return NextResponse.json(
      { ok: false, error: "Serverless host: set system keys as Environment Variables in your Vercel project settings, then redeploy." },
      { status: 400 }
    );
  }
  const body = await req.json();
  const allowed = new Set(ENV_KEYS.map((k) => k.key));
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.values ?? {})) {
    if (allowed.has(k) && typeof v === "string") values[k] = v.trim();
  }
  setEnvValues(values);
  return NextResponse.json({ ok: true, saved: Object.keys(values).filter((k) => values[k] !== "") });
}
