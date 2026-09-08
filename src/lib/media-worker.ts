import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import type { CaptionLine } from "@/db/schema";
import { buildAss } from "./thumbnail";
import { getEnv } from "./env";

const YTDLP_URL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

function command(binary: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${path.basename(binary)} timed out after ${Math.round(timeoutMs / 60000)} minutes`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk.toString()).slice(-3_000_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-12000);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(binary)} exited ${code}: ${stderr.slice(-1800)}`));
    });
  });
}

async function ffmpegPath(): Promise<string> {
  const override = getEnv("FFMPEG_PATH");
  if (override) return override;
  const mod: any = await (Function('return import("ffmpeg-static")')() as Promise<any>);
  const binary = mod.default ?? mod;
  if (!binary || typeof binary !== "string") throw new Error("Bundled FFmpeg is unavailable on this host");
  return binary;
}

async function exists(file: string): Promise<boolean> {
  try {
    await fsp.access(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Finds the build-bundled yt-dlp, or downloads a runtime copy into /tmp. */
export async function ensureYtDlp(): Promise<string> {
  const candidates = [
    getEnv("YT_DLP_PATH"),
    path.join(process.cwd(), "bin", "yt-dlp"),
    path.join(os.tmpdir(), "shorts-factory-yt-dlp"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }

  const target = path.join(os.tmpdir(), "shorts-factory-yt-dlp");
  const res = await fetch(YTDLP_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`Could not download yt-dlp (${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(target, bytes, { mode: 0o755 });
  await fsp.chmod(target, 0o755);
  return target;
}

export async function getReplayHighlights(videoId: string, count: number): Promise<number[]> {
  try {
    const ytdlp = await ensureYtDlp();
    const result = await command(
      ytdlp,
      [
        `https://www.youtube.com/watch?v=${videoId}`,
        "--dump-single-json",
        "--skip-download",
        "--no-warnings",
        "--no-playlist",
      ],
      3 * 60_000
    );
    const info = JSON.parse(result.stdout);
    const heatmap: { start_time?: number; end_time?: number; value?: number }[] = info?.heatmap || [];
    const ranked = heatmap
      .filter((h) => Number.isFinite(h.start_time) && Number.isFinite(h.end_time) && Number.isFinite(h.value))
      .sort((a, b) => (b.value || 0) - (a.value || 0));
    const selected: number[] = [];
    for (const point of ranked) {
      const center = ((point.start_time || 0) + (point.end_time || 0)) / 2;
      if (selected.every((existing) => Math.abs(existing - center) >= 45)) selected.push(center);
      if (selected.length >= count) break;
    }
    return selected.sort((a, b) => a - b);
  } catch (err: any) {
    console.error("Most Replayed heatmap unavailable; using timeline fallback:", err?.message || err);
    return [];
  }
}

export async function createMediaWorkspace(runId: number): Promise<string> {
  const root = path.join(os.tmpdir(), `shorts-factory-run-${runId}-${Date.now()}`);
  await fsp.mkdir(root, { recursive: true });
  return root;
}

/** Downloads a public video the user owns or is licensed to reuse. */
export async function downloadSourceVideo(videoId: string, workspace: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) throw new Error("Invalid YouTube source video id");
  const ytdlp = await ensureYtDlp();
  const ffmpeg = await ffmpegPath();
  const output = path.join(workspace, "source.mp4");
  const format = getEnv(
    "YT_DLP_FORMAT",
    "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/best[height<=720]"
  );
  const args = [
    `https://www.youtube.com/watch?v=${videoId}`,
    "--no-playlist",
    "--no-part",
    "--no-mtime",
    "--retries", "5",
    "--fragment-retries", "5",
    "--socket-timeout", "30",
    "--max-filesize", getEnv("MAX_SOURCE_SIZE", "700M"),
    "--format", format,
    "--merge-output-format", "mp4",
    "--ffmpeg-location", ffmpeg,
    "--output", output,
  ];
  await command(ytdlp, args, 20 * 60_000);

  if (!fs.existsSync(output)) {
    const possible = (await fsp.readdir(workspace)).find((f) => f.startsWith("source."));
    if (!possible) throw new Error("yt-dlp completed but did not create the source video");
    return path.join(workspace, possible);
  }
  return output;
}

function escapeFilterPath(input: string): string {
  return input.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export async function extractClipAudio(opts: {
  idx: number;
  sourcePath: string;
  workspace: string;
  startSec: number;
  durationSec: number;
}): Promise<string> {
  const ffmpeg = await ffmpegPath();
  const idx = String(opts.idx).padStart(2, "0");
  const output = path.join(opts.workspace, `clip-${idx}-speech.mp3`);
  await command(
    ffmpeg,
    [
      "-y",
      "-ss", String(opts.startSec),
      "-i", opts.sourcePath,
      "-t", String(Math.min(59, opts.durationSec)),
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-b:a", "64k",
      output,
    ],
    5 * 60_000
  );
  return output;
}

export type RenderClipArgs = {
  idx: number;
  sourcePath: string;
  workspace: string;
  startSec: number;
  durationSec: number;
  captions: CaptionLine[];
};

/** Cuts, vertical-crops, burns bottom captions, and exports one Shorts-ready MP4. */
export async function renderVerticalClip(args: RenderClipArgs): Promise<string> {
  const ffmpeg = await ffmpegPath();
  const idx = String(args.idx).padStart(2, "0");
  const assPath = path.join(args.workspace, `clip-${idx}.ass`);
  const output = path.join(args.workspace, `clip-${idx}.mp4`);
  await fsp.writeFile(assPath, buildAss(args.captions), "utf8");

  const size = getEnv("SHORTS_RENDER_SIZE", "720:1280");
  const [width, height] = size.split(":").map((v) => parseInt(v, 10));
  const w = Number.isFinite(width) ? width : 720;
  const h = Number.isFinite(height) ? height : 1280;
  const filter = [
    `scale=${w}:${h}:force_original_aspect_ratio=increase`,
    `crop=${w}:${h}`,
    `subtitles='${escapeFilterPath(assPath)}'`,
  ].join(",");

  await command(
    ffmpeg,
    [
      "-y",
      "-ss", String(args.startSec),
      "-i", args.sourcePath,
      "-t", String(Math.min(59, args.durationSec)),
      "-vf", filter,
      "-map", "0:v:0",
      "-map", "0:a:0?",
      "-c:v", "libx264",
      "-preset", getEnv("FFMPEG_PRESET", "veryfast"),
      "-crf", getEnv("FFMPEG_CRF", "24"),
      "-pix_fmt", "yuv420p",
      "-r", "30",
      "-threads", getEnv("FFMPEG_THREADS", "1"),
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      output,
    ],
    20 * 60_000
  );

  const stat = await fsp.stat(output);
  if (stat.size < 10_000) throw new Error(`Rendered clip ${idx} is unexpectedly small`);
  return output;
}

export async function cleanupMediaWorkspace(workspace: string | null): Promise<void> {
  if (!workspace) return;
  await fsp.rm(workspace, { recursive: true, force: true }).catch(() => {});
}
