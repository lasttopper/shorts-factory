import { NextResponse } from "next/server";
import { db } from "@/db";
import { clips, runs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function respond(buf: Buffer, contentType: string, filename: string, inline = false) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
      ...(inline ? { "Content-Disposition": `inline; filename="${filename}"` } : {}),
    },
  });
}

/** Artifacts are stored in PostgreSQL — this route decodes and serves them per owner. */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { path: segs } = await params;
  const runMatch = segs[0]?.match(/^run-(\d+)$/);
  const file = segs[1] || "";
  if (!runMatch || !file) return NextResponse.json({ error: "not found" }, { status: 404 });
  const runId = parseInt(runMatch[1], 10);

  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run || run.userId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  // run report
  const reportMatch = file.match(/^run-\d+-report\.md$/);
  if (reportMatch) {
    if (!run.reportB64) return NextResponse.json({ error: "not found" }, { status: 404 });
    return respond(Buffer.from(run.reportB64, "base64"), "text/markdown; charset=utf-8", file, true);
  }

  // clip thumbnail / caption file
  const clipMatch = file.match(/^clip-(\d{2})-(thumb\.jpg|thumb\.svg)$/) || file.match(/^clip-(\d{2})\.ass$/);
  if (!clipMatch) return NextResponse.json({ error: "not found" }, { status: 404 });
  const idx = parseInt(clipMatch[1], 10);
  const [clip] = await db
    .select({ thumbnailB64: clips.thumbnailB64, assContent: clips.assContent })
    .from(clips)
    .where(and(eq(clips.runId, runId), eq(clips.idx, idx)));
  if (!clip) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (file.endsWith(".ass")) {
    if (!clip.assContent) return NextResponse.json({ error: "not found" }, { status: 404 });
    return respond(Buffer.from(clip.assContent, "utf8"), "text/plain; charset=utf-8", file, true);
  }
  if (!clip.thumbnailB64) return NextResponse.json({ error: "not found" }, { status: 404 });
  return respond(Buffer.from(clip.thumbnailB64, "base64"), "image/jpeg", file);
}
