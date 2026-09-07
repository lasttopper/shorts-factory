import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { ctxForUser } from "@/lib/context";
import { getEnv } from "@/lib/env";
import { fetchChannelVideos, getAccessToken } from "@/lib/youtube";
import { testTelegram } from "@/lib/telegram";
import { testGithub } from "@/lib/github-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, detail: "Log in first" }, { status: 401 });
  const ctx = await ctxForUser(user.id);
  const { integration } = await req.json();
  try {
    switch (integration) {
      case "youtube_scan": {
        if (!ctx.youtubeApiKey) return NextResponse.json({ ok: false, detail: "YOUTUBE_API_KEY not set — running on simulation catalog" });
        const vids = await fetchChannelVideos(5, { apiKey: ctx.youtubeApiKey, sourceHandle: ctx.sourceHandle });
        return NextResponse.json({ ok: true, detail: `Live scan OK — ${vids.length} recent videos found on ${ctx.sourceHandle}` });
      }
      case "youtube_upload": {
        if (!ctx.ytRefreshToken) return NextResponse.json({ ok: false, detail: "Your channel isn't connected — click Connect with YouTube" });
        await getAccessToken({ clientId: ctx.ytClientId, clientSecret: ctx.ytClientSecret, refreshToken: ctx.ytRefreshToken });
        return NextResponse.json({ ok: true, detail: "OAuth token refresh OK — your channel is connected" });
      }
      case "openai": {
        if (!ctx.openaiKey) return NextResponse.json({ ok: false, detail: "OPENAI_API_KEY not set — template engine active" });
        const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${ctx.openaiKey}` } });
        return NextResponse.json(res.ok ? { ok: true, detail: "OpenAI key valid — AI copywriter live" } : { ok: false, detail: `OpenAI rejected key (${res.status})` });
      }
      case "telegram": {
        const r = await testTelegram({ botToken: ctx.telegramBotToken, chatId: ctx.telegramChatId });
        return NextResponse.json(r);
      }
      case "github": {
        const r = await testGithub();
        return NextResponse.json(r);
      }
      case "cron": {
        if (!getEnv("CRON_SECRET")) return NextResponse.json({ ok: false, detail: "CRON_SECRET not set — add it to enable the daily auto-run" });
        return NextResponse.json({ ok: true, detail: "Cron endpoint armed. Trigger daily: POST /api/cron/run with header 'Authorization: Bearer <CRON_SECRET>'" });
      }
      default:
        return NextResponse.json({ ok: false, detail: "unknown integration" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, detail: e.message?.slice(0, 200) ?? "test failed" });
  }
}
