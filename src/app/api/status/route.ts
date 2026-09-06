import { NextResponse } from "next/server";
import { db } from "@/db";
import { clips, runs, sourceVideos } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { memoryPathFor, readMemory } from "@/lib/memory";
import { getSessionUser } from "@/lib/auth";
import { ctxForUser, ctxStatuses } from "@/lib/context";
import { oauthAppReady } from "@/lib/youtube-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ user: null });
  }
  const ctx = await ctxForUser(user.id);
  const mem = readMemory(memoryPathFor(user.id));
  const myRuns = await db.select().from(runs).where(eq(runs.userId, user.id)).orderBy(desc(runs.id)).limit(50);
  const myRunIds = myRuns.map((r) => r.id);
  const used = await db.select().from(sourceVideos).where(and(eq(sourceVideos.userId, user.id), eq(sourceVideos.status, "used")));
  const allClips = myRunIds.length
    ? (await db.select().from(clips).limit(2000)).filter((c) => myRunIds.includes(c.runId))
    : [];

  const now = new Date();
  const first = new Date(now);
  first.setHours(ctx.startHour, 0, 0, 0);
  if (first.getTime() <= now.getTime() + 30 * 60_000) first.setDate(first.getDate() + 1);

  return NextResponse.json({
    user,
    integrations: ctxStatuses(ctx),
    stats: {
      totalRuns: myRuns.filter((r) => r.status !== "running").length,
      activeRuns: myRuns.filter((r) => r.status === "running").length,
      clipsScheduled: allClips.length,
      videosUsed: used.length,
      memoryRuns: mem.runCount,
    },
    config: {
      sourceChannel: ctx.sourceHandle,
      shortsPerRun: ctx.shortsPerRun,
      startHour: ctx.startHour,
      intervalMin: ctx.intervalMin,
      nextWindow: first.toISOString(),
      telegramConnected: !!(ctx.telegramBotToken && ctx.telegramChatId),
      youtubeConnected: !!(ctx.ytRefreshToken && ctx.uploadEnabled),
      youtubeOAuthReady: oauthAppReady(),
      youtubeChannel: ctx.ytChannelId
        ? {
            id: ctx.ytChannelId,
            title: ctx.ytChannelTitle,
            handle: ctx.ytChannelHandle,
            thumbnail: ctx.ytChannelThumbnail,
          }
        : null,
    },
  });
}
