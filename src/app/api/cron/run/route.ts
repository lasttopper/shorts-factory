import { NextResponse } from "next/server";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { sql } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { startPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Hobby ceiling — several user batches fit comfortably

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

  const started = Date.now();
  const BUDGET_MS = 240_000; // leave headroom under the function limit
  const ran: number[] = [];
  const skipped: { userId: number; reason: string }[] = [];
  const errors: { userId: number; error: string }[] = [];

  for (const row of rows) {
    if (Date.now() - started > BUDGET_MS) {
      skipped.push({ userId: row.userId, reason: "time budget reached — will run on the next invocation" });
      continue;
    }
    const last = row.config?.lastAutoRunAt ? new Date(row.config.lastAutoRunAt).getTime() : 0;
    if (Date.now() - last < 20 * 60 * 60 * 1000) {
      skipped.push({ userId: row.userId, reason: "already ran in the last 20 hours" });
      continue;
    }
    try {
      await startPipeline(row.userId);
      ran.push(row.userId);
      await db
        .update(userSettings)
        .set({ config: { ...row.config, lastAutoRunAt: new Date().toISOString() } })
        .where(sql`${userSettings.userId} = ${row.userId}`);
    } catch (e: any) {
      errors.push({ userId: row.userId, error: e?.message ?? "run failed" });
    }
  }

  return NextResponse.json({ ok: errors.length === 0, ran, skipped, errors, durationMs: Date.now() - started });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
