import { NextResponse } from "next/server";
import { db } from "@/db";
import { clips, runs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { ctxForUser } from "@/lib/context";
import { initResumableUpload } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Opens a YouTube upload session for one clip so the browser can upload the MP4 directly. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const clipId = parseInt(id, 10);
  if (!Number.isFinite(clipId)) return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });

  const [clip] = await db.select().from(clips).where(eq(clips.id, clipId));
  if (!clip) return NextResponse.json({ ok: false, error: "clip not found" }, { status: 404 });
  const [run] = await db.select().from(runs).where(eq(runs.id, clip.runId));
  if (!run || run.userId !== user.id) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  const ctx = await ctxForUser(user.id);
  if (!ctx.ytRefreshToken || !ctx.uploadEnabled) {
    return NextResponse.json({ ok: false, error: "Connect your YouTube channel first (Connections & Keys)" }, { status: 400 });
  }

  const { fileSize } = await req.json().catch(() => ({}));
  const size = Number(fileSize);
  if (!Number.isFinite(size) || size < 1024) {
    return NextResponse.json({ ok: false, error: "Invalid file size" }, { status: 400 });
  }

  // YouTube requires publishAt in the future; bump stale slots forward.
  let publishAt = clip.publishAt ? new Date(clip.publishAt) : new Date(Date.now() + 3600_000);
  if (publishAt.getTime() <= Date.now() + 5 * 60_000) {
    publishAt = new Date(Date.now() + 3600_000);
  }

  try {
    const uploadUrl = await initResumableUpload(
      {
        title: clip.title,
        description: `${clip.description}\n\n${clip.hashtags}`,
        tags: (clip.hashtags || "#shorts").split(/\s+/).filter(Boolean).map((t) => t.replace(/^#/, "")),
        publishAtIso: publishAt.toISOString(),
        fileSize: size,
      },
      { clientId: ctx.ytClientId, clientSecret: ctx.ytClientSecret, refreshToken: ctx.ytRefreshToken }
    );
    await db.update(clips).set({ publishAt, status: "uploading" }).where(eq(clips.id, clipId));
    return NextResponse.json({ ok: true, uploadUrl, publishAt: publishAt.toISOString() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
