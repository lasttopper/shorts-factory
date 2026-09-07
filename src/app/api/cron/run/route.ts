import { NextResponse } from "next/server";
import { db, pool } from "@/db";
import { userSettings } from "@/db/schema";
import { sql } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { startPipeline } from "@/lib/pipeline";
import { ensureDatabaseSchema } from "@/db/bootstrap";

function authorized(req: Request): boolean {
  const secret = getEnv("CRON_SECRET");
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  const alt = req.headers.get("x-cron-secret") || "";
  const query = new URL(req.url).searchParams.get("secret") || "";
  return header === `Bearer ${secret}` || alt === secret || query === secret;
}

/**
 * Daily auto-run for every user who enabled it.
 * Trigger with Vercel Cron (vercel.json) or any external scheduler:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/run
 */
async function handle(req: Request) {
  await ensureDatabaseSchema(pool).catch(() => {});
  if (!getEnv("CRON_SECRET")) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured on the host" }, { status: 401 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({ userId: userSettings.userId, config: userSettings.config })
    .from(userSettings)
    .where(sql`(${userSettings.config} ->> 'autoRunEnabled') = 'true'`);

  const now = Date.now();
  const queued: number[] = [];
  const skipped: { userId: number; reason: string }[] = [];

  for (const row of rows) {
    const last = row.config?.lastAutoRunAt ? new Date(row.config.lastAutoRunAt).getTime() : 0;
    if (now - last < 20 * 60 * 60 * 1000) {
      skipped.push({ userId: row.userId, reason: "already ran in the last 20 hours" });
      continue;
    }
    try {
      // startPipeline is fire-and-forget: each user's batch keeps executing
      // in the background after this endpoint responds.
      await startPipeline(row.userId);
      queued.push(row.userId);
      await db
        .update(userSettings)
        .set({ config: { ...row.config, lastAutoRunAt: new Date().toISOString() } })
        .where(sql`${userSettings.userId} = ${row.userId}`);
    } catch (e: any) {
      skipped.push({ userId: row.userId, reason: e?.message ?? "start failed" });
    }
  }

  return NextResponse.json({ ok: true, queued, skipped, durationMs: Date.now() - now });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
