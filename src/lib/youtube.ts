import { getEnv } from "./env";
import type { SourceVideo } from "./catalog";

export type YtCreds = {
  apiKey?: string;
  sourceHandle?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
};

function iso8601ToSec(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+(m[1] || 0) * 3600) + (+(m[2] || 0) * 60) + +(m[3] || 0);
}

async function ytApi(path: string, params: Record<string, string>, apiKey: string): Promise<any> {
  if (!apiKey) throw new Error("YOUTUBE_API_KEY not configured");
  const qs = new URLSearchParams({ ...params, key: apiKey });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${qs}`);
  if (!res.ok) throw new Error(`YouTube API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export async function resolveChannelId(creds: YtCreds = {}): Promise<string> {
  const preset = getEnv("SOURCE_CHANNEL_ID");
  if (preset) return preset;
  const handle = (creds.sourceHandle || getEnv("SOURCE_CHANNEL_HANDLE", "@NotYourType")).replace(/^@/, "");
  const data = await ytApi("channels", { part: "id", forHandle: handle }, creds.apiKey || getEnv("YOUTUBE_API_KEY"));
  const id = data?.items?.[0]?.id;
  if (!id) throw new Error(`Channel @${handle} not found`);
  return id;
}

/** Live scan of the source channel's recent long-form uploads. */
export async function fetchChannelVideos(maxResults = 25, creds: YtCreds = {}): Promise<SourceVideo[]> {
  const apiKey = creds.apiKey || getEnv("YOUTUBE_API_KEY");
  const channelId = await resolveChannelId(creds);
  const search = await ytApi("search", {
    part: "snippet",
    channelId,
    order: "date",
    type: "video",
    videoDuration: "medium",
    maxResults: String(maxResults),
  }, apiKey);
  const ids: string[] = (search.items || []).map((i: any) => i.id?.videoId).filter(Boolean);
  if (!ids.length) return [];
  const vids = await ytApi("videos", { part: "snippet,contentDetails", id: ids.join(",") }, apiKey);
  return (vids.items || []).map((v: any): SourceVideo => ({
    videoId: v.id,
    title: v.snippet?.title ?? "Untitled",
    channelTitle: v.snippet?.channelTitle ?? "",
    thumbnailUrl: v.snippet?.thumbnails?.high?.url ?? v.snippet?.thumbnails?.default?.url ?? "",
    durationSec: iso8601ToSec(v.contentDetails?.duration ?? ""),
    publishedAt: v.snippet?.publishedAt ?? "",
  }));
}

/** OAuth token refresh for the user's own (destination) channel. */
export async function getAccessToken(creds: YtCreds = {}): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId || getEnv("YT_CLIENT_ID"),
      client_secret: creds.clientSecret || getEnv("YT_CLIENT_SECRET"),
      refresh_token: creds.refreshToken || getEnv("YT_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`OAuth refresh failed: ${res.status}`);
  const data = await res.json();
  return data.access_token as string;
}

export type UploadArgs = {
  filePath: string;
  title: string;
  description: string;
  tags: string[];
  publishAtIso: string;
};

export type ResumableArgs = {
  title: string;
  description: string;
  tags: string[];
  publishAtIso: string;
  fileSize: number;
};

/**
 * Opens a YouTube resumable-upload session and returns the upload URL.
 * The browser (or a worker) then PUTs the MP4 bytes straight to that URL,
 * which keeps large video files away from the app server entirely.
 */
export async function initResumableUpload(args: ResumableArgs, creds: YtCreds = {}): Promise<string> {
  const token = await getAccessToken(creds);
  const metadata = {
    snippet: {
      title: args.title,
      description: args.description,
      tags: args.tags,
      categoryId: "22",
    },
    status: {
      privacyStatus: "private",
      publishAt: args.publishAtIso,
      selfDeclaredMadeForKids: false,
    },
  };
  const res = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(args.fileSize),
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify(metadata),
    }
  );
  if (!res.ok) throw new Error(`YouTube upload session failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const uploadUrl = res.headers.get("location") || res.headers.get("Location");
  if (!uploadUrl) throw new Error("YouTube did not return an upload session URL");
  return uploadUrl;
}

export async function uploadScheduledShort(args: UploadArgs, creds: YtCreds = {}): Promise<string> {
  const fs = await import("fs");
  const token = await getAccessToken(creds);
  const metadata = {
    snippet: {
      title: args.title,
      description: args.description,
      tags: args.tags,
      categoryId: "22",
    },
    status: {
      privacyStatus: "private",
      publishAt: args.publishAtIso,
      selfDeclaredMadeForKids: false,
    },
  };
  const boundary = "shortsfactory" + Date.now();
  const video = fs.readFileSync(args.filePath);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
    video,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.id as string;
}
