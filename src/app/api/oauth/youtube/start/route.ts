import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { appUrl, oauthAppReady, youtubeAuthorizationUrl } from "@/lib/youtube-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/?auth=required", appUrl(req)));
  if (!oauthAppReady()) {
    return NextResponse.redirect(new URL("/settings?youtube=admin_setup_required", appUrl(req)));
  }

  const state = randomBytes(32).toString("base64url");
  const authUrl = youtubeAuthorizationUrl({
    request: req,
    state,
    loginHint: user.email,
  });
  const res = NextResponse.redirect(authUrl);
  res.cookies.set("sf_youtube_oauth", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/oauth/youtube",
    maxAge: 10 * 60,
  });
  return res;
}
