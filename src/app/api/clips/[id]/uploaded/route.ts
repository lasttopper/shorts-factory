import { NextResponse } from "next/server";
import { db } from "@/db";
import { clips, runs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Called by the browser after the MP4 upload completes; records the real YouTube video id. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const clipId = parseInt(id, 10);
  const { videoId, publishAt } = await req.json().catch(() => ({}));

  const [clip] = await db.select().from(clips).where(eq(clips.id, clipId));
  if (!clip) return NextResponse.json({ ok: false, error: "clip not found" }, { status: 404 });
  const [run] = await db.select().from(runs).where(eq(runs.id, clip.runId));
  if (!run || run.userId !== user.id) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  if (!videoId || typeof videoId !== "string") {
    return NextResponse.json({ ok: false, error: "videoId required" }, { status: 400 });
  }

  await db
    .update(clips)
    .set({
      youtubeVideoId: videoId,
      status: "scheduled",
      ...(publishAt ? { publishAt: new Date(publishAt) } : {}),
    })
    .where(eq(clips.id, clipId));

  return NextResponse.json({ ok: true, videoId, url: `https://youtube.com/watch?v=${videoId}` });
}
