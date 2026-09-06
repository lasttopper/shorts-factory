import { NextResponse } from "next/server";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ runs: [] });
  const rows = await db
    .select({
      id: runs.id, userId: runs.userId, status: runs.status, mode: runs.mode,
      sourceVideoId: runs.sourceVideoId, sourceVideoTitle: runs.sourceVideoTitle,
      shortsPlanned: runs.shortsPlanned, shortsScheduled: runs.shortsScheduled,
      steps: runs.steps, telegramStatus: runs.telegramStatus, reportPath: runs.reportPath,
      error: runs.error, startedAt: runs.startedAt, finishedAt: runs.finishedAt,
    })
    .from(runs)
    .where(eq(runs.userId, user.id))
    .orderBy(desc(runs.id))
    .limit(25);
  return NextResponse.json({ runs: rows });
}
