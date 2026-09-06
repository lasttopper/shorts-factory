import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

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
  const { path: segs } = await params;
  const root = path.join(process.cwd(), "public", "artifacts");
  const abs = path.join(root, ...segs);
  if (!abs.startsWith(root) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const ext = path.extname(abs).slice(1).toLowerCase();
  const buf = fs.readFileSync(abs);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      ...(ext === "md" || ext === "ass" ? { "Content-Disposition": `inline; filename="${path.basename(abs)}"` } : {}),
    },
  });
}
