import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  ass: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  mp4: "video/mp4",
};

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { path: segs } = await params;
  const runMatch = segs[0]?.match(/^run-(\d+)$/);
  if (!runMatch) return NextResponse.json({ error: "not found" }, { status: 404 });
  const runId = parseInt(runMatch[1], 10);
  const [run] = await db.select({ userId: runs.userId }).from(runs).where(eq(runs.id, runId));
  if (!run || run.userId !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const root = path.join(process.cwd(), "public", "artifacts");
  const abs = path.join(root, ...segs);
  if (!abs.startsWith(root + path.sep) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const ext = path.extname(abs).slice(1).toLowerCase();
  const buf = fs.readFileSync(abs);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
      ...(ext === "md" || ext === "ass" ? { "Content-Disposition": `inline; filename="${path.basename(abs)}"` } : {}),
    },
  });
}
