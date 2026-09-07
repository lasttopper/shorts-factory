import { NextResponse } from "next/server";
import { db } from "@/db";
import { clips, runs, sourceVideos } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { readMemory } from "@/lib/memory";
import { getSessionUser } from "@/lib/auth";
import { ctxForUser, ctxStatuses } from "@/lib/context";
import { oauthAppReady } from "@/lib/youtube-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ user: null });
    }

    // Resolve these independently-tolerantly so one failing query can't hang the dashboard.
    const [ctxResult, memResult, runsResult, usedResult, clipCountResult] = await Promise.allSettled([
      ctxForUser(user.id),
      readMemory(user.id),
      db.select().from(runs).where(eq(runs.userId, user.id)).orderBy(desc(runs.id)).limit(50),
      db.select().from(sourceVideos).where(and(eq(sourceVideos.userId, user.id), eq(sourceVideos.status, "used"))),
      db.select({ id: clips.id, runId: clips.runId }).from(clips).limit(2000),
    ]);

    if (ctxResult.status === "rejected") {
      throw ctxResult.reason;
    }
    const ctx = ctxResult.value;
    const mem = memResult.status === "fulfilled" ? memResult.value : { content: "", usedVideoIds: [], lastRunId: 0, runCount: 0 };
    const myRuns = runsResult.status === "fulfilled" ? runsResult.value : [];
    const used = usedResult.status === "fulfilled" ? usedResult.value : [];
    const myRunIds = myRuns.map((r) => r.id);
    const allClips = clipCountResult.status === "fulfilled"
      ? clipCountResult.value.filter((c) => myRunIds.includes(c.runId))
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
          ? { id: ctx.ytChannelId, title: ctx.ytChannelTitle, handle: ctx.ytChannelHandle, thumbnail: ctx.ytChannelThumbnail }
          : null,
      },
      degraded: [memResult, runsResult, usedResult, clipCountResult].some((r) => r.status === "rejected") || undefined,
    });
  } catch (e: any) {
    console.error("/api/status failed:", e);
    return NextResponse.json(
      { error: "status_unavailable", detail: e?.message?.slice(0, 300) ?? "unknown error" },
      { status: 500 }
    );
  }
}
