import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getUserConfig, saveUserConfig } from "@/lib/context";
import { protectSecret } from "@/lib/secret-crypto";
import { appUrl, exchangeYoutubeCode, fetchMyYoutubeChannel } from "@/lib/youtube-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function settingsRedirect(req: Request, status: string, detail?: string): NextResponse {
  const url = new URL("/settings", appUrl(req));
  url.searchParams.set("youtube", status);
  if (detail) url.searchParams.set("detail", detail.slice(0, 180));
  const res = NextResponse.redirect(url);
  res.cookies.set("sf_youtube_oauth", "", { path: "/api/oauth/youtube", maxAge: 0 });
  return res;
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return settingsRedirect(req, "login_required");

  const url = new URL(req.url);
  const denied = url.searchParams.get("error");
  if (denied) return settingsRedirect(req, "denied", url.searchParams.get("error_description") || denied);

  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const cookieHeader = req.headers.get("cookie") || "";
  const stateCookie = cookieHeader
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("sf_youtube_oauth="))
    ?.slice("sf_youtube_oauth=".length) || "";

  if (!code || !state || !stateCookie || !safeEqual(state, decodeURIComponent(stateCookie))) {
    return settingsRedirect(req, "error", "Invalid or expired connection request. Please try again.");
  }

  try {
    const tokens = await exchangeYoutubeCode(code, req);
    const channel = await fetchMyYoutubeChannel(tokens.accessToken);
    const current = await getUserConfig(user.id);
    const refreshToken = tokens.refreshToken
      ? protectSecret(tokens.refreshToken)
      : current.ytRefreshToken;
    if (!refreshToken) throw new Error("Google did not return a refresh token. Disconnect access in your Google account, then try again.");

    await saveUserConfig(user.id, {
      ...current,
      ytRefreshToken: refreshToken,
      ytChannelId: channel.id,
      ytChannelTitle: channel.title,
      ytChannelHandle: channel.customUrl,
      ytChannelThumbnail: channel.thumbnail,
      ytConnectedAt: new Date().toISOString(),
      uploadEnabled: true,
    });
    return settingsRedirect(req, "connected", channel.title);
  } catch (e: any) {
    return settingsRedirect(req, "error", e.message || "YouTube connection failed");
  }
}
