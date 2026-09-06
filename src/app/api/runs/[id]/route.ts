import { NextResponse } from "next/server";
import { db } from "@/db";
import { clips, runs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const runId = parseInt(id, 10);
  if (!Number.isFinite(runId)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const [run] = await db
    .select({
      id: runs.id, userId: runs.userId, status: runs.status, mode: runs.mode,
      sourceVideoId: runs.sourceVideoId, sourceVideoTitle: runs.sourceVideoTitle,
      shortsPlanned: runs.shortsPlanned, shortsScheduled: runs.shortsScheduled,
      steps: runs.steps, telegramStatus: runs.telegramStatus, reportPath: runs.reportPath,
      error: runs.error, startedAt: runs.startedAt, finishedAt: runs.finishedAt,
    })
    .from(runs)
    .where(eq(runs.id, runId));
  if (!run || run.userId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const clipRows = await db
    .select({
      id: clips.id, runId: clips.runId, idx: clips.idx, sourceVideoId: clips.sourceVideoId,
      startSec: clips.startSec, endSec: clips.endSec, hook: clips.hook, title: clips.title,
      description: clips.description, hashtags: clips.hashtags, captions: clips.captions,
      thumbnailPath: clips.thumbnailPath, assPath: clips.assPath, renderCommand: clips.renderCommand,
      publishAt: clips.publishAt, youtubeVideoId: clips.youtubeVideoId, status: clips.status,
      createdAt: clips.createdAt,
    })
    .from(clips)
    .where(eq(clips.runId, runId));
  clipRows.sort((a, b) => a.idx - b.idx);
  return NextResponse.json({ run, clips: clipRows });
}
