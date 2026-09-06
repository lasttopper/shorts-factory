import { NextResponse } from "next/server";
import { db } from "@/db";
import { sourceVideos } from "@/db/schema";
import { memoryPathFor, readMemory } from "@/lib/memory";
import { and, desc, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ videos: [], usedIds: [], runCount: 0 });
  const rows = await db
    .select()
    .from(sourceVideos)
    .where(and(eq(sourceVideos.userId, user.id)))
    .orderBy(desc(sourceVideos.id))
    .limit(60);
  const mem = readMemory(memoryPathFor(user.id));
  return NextResponse.json({
    videos: rows,
    usedIds: mem.usedVideoIds,
    runCount: mem.runCount,
  });
}
