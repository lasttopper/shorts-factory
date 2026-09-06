import { getEnv } from "./env";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export type ConnectedYoutubeChannel = {
  id: string;
  title: string;
  customUrl: string;
  thumbnail: string;
};

export function oauthAppReady(): boolean {
  return !!(getEnv("YT_CLIENT_ID") && getEnv("YT_CLIENT_SECRET"));
}

/** Resolves the browser-facing URL correctly behind Render/Koyeb/HF proxies. */
export function appUrl(request: Request | string): string {
  const configured = getEnv("APP_URL");
  if (configured) return configured.replace(/\/$/, "");
  if (typeof request !== "string") {
    const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
    let forwardedProto = (request.headers.get("x-forwarded-proto") || "https").split(",")[0];
    if (forwardedHost) {
      const host = forwardedHost.split(",")[0];
      const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(host);
      // Some free-host reverse proxies report their internal HTTP hop. OAuth must
      // use the browser-facing HTTPS scheme for every public hostname.
      if (!isLocal && forwardedProto === "http") forwardedProto = "https";
      return `${forwardedProto}://${host}`.replace(/\/$/, "");
    }
    return new URL(request.url).origin;
  }
  return new URL(request).origin;
}

export function youtubeRedirectUri(request: Request | string): string {
  return `${appUrl(request)}/api/oauth/youtube/callback`;
}

export function youtubeAuthorizationUrl(opts: {
  request: Request;
  state: string;
  loginHint?: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", getEnv("YT_CLIENT_ID"));
  url.searchParams.set("redirect_uri", youtubeRedirectUri(opts.request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YOUTUBE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("state", opts.state);
  if (opts.loginHint) url.searchParams.set("login_hint", opts.loginHint);
  return url.toString();
}

export async function exchangeYoutubeCode(code: string, request: Request): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getEnv("YT_CLIENT_ID"),
      client_secret: getEnv("YT_CLIENT_SECRET"),
      redirect_uri: youtubeRedirectUri(request),
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Google token exchange failed (${res.status})`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || "",
    expiresIn: data.expires_in || 0,
  };
}

/** Identifies the actual YouTube channel selected on Google's consent screen. */
export async function fetchMyYoutubeChannel(accessToken: string): Promise<ConnectedYoutubeChannel> {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("mine", "true");
  url.searchParams.set("maxResults", "1");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `YouTube channel lookup failed (${res.status})`);
  const c = data?.items?.[0];
  if (!c) {
    throw new Error("This Google account has no YouTube channel. Create a channel on YouTube, then connect again.");
  }
  return {
    id: c.id,
    title: c.snippet?.title || "YouTube channel",
    customUrl: c.snippet?.customUrl || "",
    thumbnail: c.snippet?.thumbnails?.default?.url || "",
  };
}

export async function revokeGoogleToken(token: string): Promise<void> {
  if (!token) return;
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
}
