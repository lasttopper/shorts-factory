import { db } from "@/db";
import { runs, clips, sourceVideos, type StepLog, type CaptionLine } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { SIMULATED_CATALOG, type SourceVideo } from "./catalog";
import { fetchChannelVideos } from "./youtube";
import { generateCaptions, generateClipMeta, transcribeClipAudio } from "./ai";
import { buildAss, clipSvg, ffmpegCommand, renderThumbnail } from "./thumbnail";
import { sendRunReport } from "./telegram";
import { envInt } from "./env";
import { fmtTime, readMemory, recordRunInMemory } from "./memory";
import { ctxForUser, ctxStatuses, runModeFor, type ExecCtx } from "./context";
import { pushUserState } from "./github-state";
import { promises as fsp } from "fs";
import {
  cleanupMediaWorkspace,
  createMediaWorkspace,
  downloadSourceVideo,
  extractClipAudio,
  getReplayHighlights,
  renderVerticalClip,
} from "./media-worker";
import { setVideoThumbnail, uploadScheduledShortResumable } from "./youtube";

const STEP_DEFS: { key: string; label: string }[] = [
  { key: "scan", label: "Scan source channel" },
  { key: "select", label: "Pick unused video (memory.md)" },
  { key: "plan", label: "Plan 10 clip windows" },
  { key: "captions", label: "Generate bottom captions" },
  { key: "metadata", label: "Write titles + descriptions" },
  { key: "thumbnails", label: "Design thumbnails" },
  { key: "render", label: "Render 9:16 shorts" },
  { key: "schedule", label: "Schedule on YouTube" },
  { key: "telegram", label: "Telegram report + attachments" },
  { key: "memory", label: "Update memory.md" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function setSteps(runId: number, steps: StepLog[]) {
  await db.update(runs).set({ steps }).where(eq(runs.id, runId));
}

async function runStep<T>(runId: number, steps: StepLog[], key: string, fn: () => Promise<{ detail: string; mode?: "live" | "simulated"; result?: T }>): Promise<T> {
  const step = steps.find((s) => s.key === key)!;
  step.status = "running";
  const t0 = Date.now();
  await setSteps(runId, steps);
  try {
    const out = await fn();
    step.status = "done";
    step.detail = out.detail;
    step.mode = out.mode;
    step.durationMs = Date.now() - t0;
    await setSteps(runId, steps);
    return out.result as T;
  } catch (e: any) {
    step.status = "error";
    step.detail = e.message?.slice(0, 300) ?? "unknown error";
    step.durationMs = Date.now() - t0;
    await setSteps(runId, steps);
    throw e;
  }
}

function seededJitter(seed: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < seed.length; i++) h = (h * 33 + seed.charCodeAt(i)) | 0;
  return (Math.abs(h) % 1000) / 1000;
}

export async function executeRun(runId: number, ctx: ExecCtx): Promise<void> {
  const steps: StepLog[] = STEP_DEFS.map((d) => ({ ...d, status: "pending" as const }));
  let telegramStatus = "pending";
  let reportRel = "";
  let mediaWorkspace: string | null = null;
  const renderedFiles = new Map<number, string>();
  const thumbnailBuffers = new Map<number, Buffer>();
  let uploadFailures = 0;

  try {
    // ---------- 1. SCAN ----------
    const catalog = await runStep(runId, steps, "scan", async () => {
      let source: SourceVideo[] = [];
      let mode: "live" | "simulated" = "simulated";
      if (ctx.youtubeApiKey) {
        try {
          source = await fetchChannelVideos(25, { apiKey: ctx.youtubeApiKey, sourceHandle: ctx.sourceHandle });
          mode = source.length ? "live" : "simulated";
          if (!source.length) source = SIMULATED_CATALOG;
        } catch {
          source = SIMULATED_CATALOG;
          mode = "simulated";
        }
      } else {
        source = SIMULATED_CATALOG;
        await sleep(500);
      }
      for (const v of source) {
        const existing = await db
          .select({ id: sourceVideos.id })
          .from(sourceVideos)
          .where(and(eq(sourceVideos.userId, ctx.userId), eq(sourceVideos.videoId, v.videoId)));
        if (!existing.length) {
          await db.insert(sourceVideos).values({
            userId: ctx.userId,
            videoId: v.videoId,
            title: v.title,
            channelTitle: v.channelTitle,
            thumbnailUrl: v.thumbnailUrl,
            durationSec: v.durationSec,
            publishedAt: v.publishedAt,
          });
        }
      }
      return { detail: `${source.length} videos from ${ctx.sourceHandle} (${mode === "live" ? "live channel scan" : "simulation catalog"})`, mode, result: source };
    });

    // ---------- 2. SELECT (dedupe via this user's memory + DB) ----------
    const source = await runStep(runId, steps, "select", async () => {
      const mem = await readMemory(ctx.userId);
      const usedRows = await db
        .select({ videoId: sourceVideos.videoId })
        .from(sourceVideos)
        .where(and(eq(sourceVideos.userId, ctx.userId), eq(sourceVideos.status, "used")));
      const used = new Set([...mem.usedVideoIds, ...usedRows.map((r) => r.videoId)]);
      const fresh = catalog.filter((v) => !used.has(v.videoId) && v.durationSec >= 300);
      await sleep(350);

      let pick = fresh[0];
      let isRecycled = false;
      if (!pick) {
        // If all catalog videos have been used, recycle the oldest one so testing never gets blocked
        pick = catalog.filter((v) => v.durationSec >= 300)[0] || catalog[0];
        isRecycled = true;
      }

      await db.update(runs).set({ sourceVideoId: pick.videoId, sourceVideoTitle: pick.title }).where(eq(runs.id, runId));
      return {
        detail: isRecycled
          ? `"${pick.title}" (${fmtTime(pick.durationSec)}) — recycled oldest source (all ${catalog.length} catalog videos previously processed)`
          : `"${pick.title}" (${fmtTime(pick.durationSec)}) — ${used.size} already used, ${fresh.length} fresh remaining`,
        mode: "live" as const,
        result: pick,
      };
    });

    // ---------- 3. PLAN ----------
    const clipMin = envInt("CLIP_MIN_SEC", 34);
    const clipMax = envInt("CLIP_MAX_SEC", 56);
    type Plan = { idx: number; start: number; len: number };
    const plan: Plan[] = await runStep(runId, steps, "plan", async () => {
      const D = source.durationSec;
      const lo = Math.floor(D * 0.06);
      const hi = Math.floor(D * 0.94);
      const span = (hi - lo) / ctx.shortsPerRun;
      const useHeatmap =
        ctx.autoRenderEnabled &&
        ctx.sourceRightsConfirmed &&
        !source.videoId.startsWith("nyt_sim_");
      const peaks = useHeatmap ? await getReplayHighlights(source.videoId, ctx.shortsPerRun) : [];
      const out: Plan[] = [];
      for (let i = 0; i < ctx.shortsPerRun; i++) {
        const len = Math.round(clipMin + seededJitter(source.videoId, i * 7 + 3) * (clipMax - clipMin));
        let start: number;
        if (peaks[i] !== undefined) {
          start = Math.floor(Math.max(lo, Math.min(hi - len, peaks[i] - len * 0.35)));
        } else {
          const wStart = lo + i * span;
          const maxStart = Math.min(wStart + span * 0.55, hi - len);
          start = Math.floor(wStart + seededJitter(source.videoId, i * 13 + 1) * (maxStart - wStart));
        }
        out.push({ idx: i + 1, start: Math.max(0, start), len });
      }
      await sleep(250);
      return {
        detail: peaks.length
          ? `${peaks.length} audience replay peaks selected; ${ctx.shortsPerRun - peaks.length} timeline fallbacks; ${clipMin}-${clipMax}s each`
          : `${ctx.shortsPerRun} distributed highlight windows across ${fmtTime(D)}, ${clipMin}-${clipMax}s each`,
        mode: "live" as const,
        result: out,
      };
    });

    for (const p of plan) p.len = Math.min(59, p.len);

    // ---------- 4-5. CAPTIONS + METADATA ----------
    const channelName = ctx.sourceHandle;
    const clipRows: { id: number; idx: number; start: number; len: number; hook: string; title: string; description: string; hashtags: string; captions: CaptionLine[]; youtubeVideoId?: string }[] = [];

    let captionMode: "live" | "simulated" = "simulated";
    let metaMode: "live" | "simulated" = "simulated";

    await runStep(runId, steps, "captions", async () => {
      for (const p of plan) {
        const { captions, live } = await generateCaptions(source.title, "", p.len, ctx.openaiKey, ctx.openaiModel);
        if (live) captionMode = "live";
        const [inserted] = await db
          .insert(clips)
          .values({ runId, idx: p.idx, sourceVideoId: source.videoId, startSec: p.start, endSec: p.start + p.len, captions, status: "planned" })
          .returning({ id: clips.id });
        clipRows.push({ id: inserted.id, idx: p.idx, start: p.start, len: p.len, hook: "", title: "", description: "", hashtags: "", captions, youtubeVideoId: "" });
      }
      return { detail: `${clipRows.length} caption tracks generated, bottom-aligned style ready`, mode: captionMode, result: null };
    });

    await runStep(runId, steps, "metadata", async () => {
      for (const c of clipRows) {
        const { meta, live } = await generateClipMeta(source.title, c.idx, channelName, ctx.openaiKey, ctx.openaiModel);
        if (live) metaMode = "live";
        c.hook = meta.hook;
        c.title = meta.title;
        c.description = meta.description;
        c.hashtags = meta.hashtags;
        const caps = await generateCaptions(source.title, meta.hook, c.len, ctx.openaiKey, ctx.openaiModel);
        c.captions = caps.captions;
        await db.update(clips).set({ hook: c.hook, title: c.title, description: c.description, hashtags: c.hashtags, captions: c.captions }).where(eq(clips.id, c.id));
      }
      return { detail: `${clipRows.length} titles, descriptions and hashtag sets written`, mode: metaMode, result: null };
    });

    // ---------- 6. THUMBNAILS (stored in Postgres — survives any host) ----------
    let firstThumbB64 = "";
    await runStep(runId, steps, "thumbnails", async () => {
      for (const c of clipRows) {
        const svg = clipSvg({
          idx: c.idx,
          total: plan.length,
          title: c.title,
          hook: c.hook,
          window: `${fmtTime(c.start)} – ${fmtTime(c.start + c.len)}`,
          channelTag: channelName.replace(/^@/, ""),
        });
        const buf = await renderThumbnail(svg);
        const b64 = buf.toString("base64");
        thumbnailBuffers.set(c.idx, buf);
        if (c.idx === 1) firstThumbB64 = b64;
        const ass = buildAss(c.captions);
        const idxPad = String(c.idx).padStart(2, "0");
        const cmd = ffmpegCommand(source.videoId, c.start, c.len, `clip-${idxPad}.ass`, `clip-${idxPad}.mp4`);
        await db
          .update(clips)
          .set({
            thumbnailB64: b64,
            assContent: ass,
            thumbnailPath: `/artifacts/run-${runId}/clip-${idxPad}-thumb.jpg`,
            assPath: `/artifacts/run-${runId}/clip-${idxPad}.ass`,
            renderCommand: cmd,
          })
          .where(eq(clips.id, c.id));
      }
      return { detail: `${clipRows.length} 1280×720 thumbnails + caption files stored in the database`, mode: "live", result: null };
    });

    // ---------- 7. AUTO-DOWNLOAD + RENDER ----------
    await runStep(runId, steps, "render", async () => {
      const realSource = !source.videoId.startsWith("nyt_sim_");
      const authorized = ctx.autoRenderEnabled && ctx.sourceRightsConfirmed;
      const canUpload = ctx.uploadEnabled && !!ctx.ytRefreshToken;

      if (!realSource || !authorized || !canUpload) {
        for (const c of clipRows) {
          await db.update(clips).set({ status: "planned" }).where(eq(clips.id, c.id));
        }
        const reasons = [
          !realSource ? "live YouTube source scan is not configured" : "",
          !ctx.autoRenderEnabled ? "zero-touch rendering is disabled" : "",
          !ctx.sourceRightsConfirmed ? "source ownership/permission is not confirmed" : "",
          !canUpload ? "destination YouTube channel is not connected for uploads" : "",
        ].filter(Boolean);
        return {
          detail: `Automatic media work skipped: ${reasons.join("; ")}`,
          mode: "simulated" as const,
          result: null,
        };
      }

      const maxSourceSec = envInt("AUTO_RENDER_MAX_SOURCE_SEC", 1800);
      if (source.durationSec > maxSourceSec) {
        throw new Error(`Source is ${fmtTime(source.durationSec)}; automatic rendering limit is ${fmtTime(maxSourceSec)} on this host`);
      }

      mediaWorkspace = await createMediaWorkspace(runId);
      const sourcePath = await downloadSourceVideo(source.videoId, mediaWorkspace);
      for (const c of clipRows.sort((a, b) => a.idx - b.idx)) {
        await db.update(clips).set({ status: "rendering" }).where(eq(clips.id, c.id));
        let timedCaptions = c.captions;
        if (ctx.openaiKey) {
          const audioPath = await extractClipAudio({
            idx: c.idx,
            sourcePath,
            workspace: mediaWorkspace,
            startSec: c.start,
            durationSec: c.len,
          });
          const transcript = await transcribeClipAudio(audioPath, ctx.openaiKey);
          await fsp.unlink(audioPath).catch(() => {});
          if (transcript?.length) {
            timedCaptions = transcript;
            c.captions = transcript;
            await db.update(clips).set({ captions: transcript, assContent: buildAss(transcript) }).where(eq(clips.id, c.id));
          }
        }
        const output = await renderVerticalClip({
          idx: c.idx,
          sourcePath,
          workspace: mediaWorkspace,
          startSec: c.start,
          durationSec: c.len,
          captions: timedCaptions,
        });
        renderedFiles.set(c.idx, output);
        await db.update(clips).set({ status: "rendered" }).where(eq(clips.id, c.id));
      }
      return {
        detail: `${renderedFiles.size} vertical MP4s rendered automatically with bottom captions`,
        mode: "live" as const,
        result: null,
      };
    });

    // ---------- 8. AUTO-UPLOAD + NATIVE YOUTUBE SCHEDULING ----------
    const slots: Date[] = await runStep(runId, steps, "schedule", async () => {
      const now = new Date();
      const first = new Date(now);
      first.setHours(ctx.startHour, 0, 0, 0);
      if (first.getTime() <= now.getTime() + 90 * 60_000) first.setDate(first.getDate() + 1);
      const out: Date[] = [];
      let uploaded = 0;
      const uploadErrors: string[] = [];
      const creds = {
        clientId: ctx.ytClientId,
        clientSecret: ctx.ytClientSecret,
        refreshToken: ctx.ytRefreshToken,
      };

      for (const c of clipRows.sort((a, b) => a.idx - b.idx)) {
        const slot = new Date(first.getTime() + (c.idx - 1) * ctx.intervalMin * 60_000);
        out.push(slot);
        const renderedPath = renderedFiles.get(c.idx);

        if (!renderedPath) {
          const ytId = ctx.ytRefreshToken ? "" : `dry_${(runId * 100 + c.idx).toString(36)}${Math.abs(Date.now() % 1296).toString(36)}`;
          await db
            .update(clips)
            .set({ publishAt: slot, youtubeVideoId: ytId, status: ytId ? "simulated" : "planned" })
            .where(eq(clips.id, c.id));
          continue;
        }

        try {
          await db.update(clips).set({ publishAt: slot, status: "uploading" }).where(eq(clips.id, c.id));
          const videoId = await uploadScheduledShortResumable(
            {
              filePath: renderedPath,
              title: c.title,
              description: `${c.description}\n\n${c.hashtags}`,
              tags: c.hashtags.split(/\s+/).filter(Boolean).map((t) => t.replace(/^#/, "")),
              publishAtIso: slot.toISOString(),
            },
            creds
          );
          const thumb = thumbnailBuffers.get(c.idx);
          if (thumb) {
            await setVideoThumbnail(videoId, thumb, creds).catch((err) => {
              console.error(`Thumbnail for ${videoId} was not applied:`, err?.message || err);
            });
          }
          await db
            .update(clips)
            .set({ publishAt: slot, youtubeVideoId: videoId, status: "scheduled" })
            .where(eq(clips.id, c.id));
          c.youtubeVideoId = videoId;
          uploaded++;
          await fsp.unlink(renderedPath).catch(() => {});
        } catch (err: any) {
          uploadFailures++;
          uploadErrors.push(`#${c.idx}: ${err?.message?.slice(0, 120) || "upload failed"}`);
          await db.update(clips).set({ publishAt: slot, status: "failed" }).where(eq(clips.id, c.id));
        }
      }

      const scheduledCount = renderedFiles.size ? uploaded : 0;
      await db.update(runs).set({ shortsScheduled: scheduledCount }).where(eq(runs.id, runId));
      const automatic = renderedFiles.size > 0;
      return {
        detail: automatic
          ? `${uploaded}/${clipRows.length} MP4s uploaded and scheduled on YouTube${uploadErrors.length ? ` · ${uploadErrors.slice(0, 2).join(" | ")}` : ""}`
          : `${clipRows.length} publish slots planned from ${out[0].toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}; automatic upload waits for live scan, rights confirmation, and YouTube connection`,
        mode: automatic ? "live" as const : "simulated" as const,
        result: out,
      };
    });

    // ---------- 9. TELEGRAM ----------
    await runStep(runId, steps, "telegram", async () => {
      const statusList = ctxStatuses(ctx);
      const report = buildReport(runId, source, ctx, clipRows.sort((a, b) => a.idx - b.idx), slots, statusList.map((s) => `${s.live ? "LIVE" : "SIM "} ${s.label}`).join("  •  "));
      const reportB64 = Buffer.from(report, "utf8").toString("base64");
      reportRel = `/artifacts/run-${runId}/run-${runId}-report.md`;

      const summary =
        `<b>SHORTS FACTORY — RUN #${runId} COMPLETE</b>\n` +
        `Source: <i>${source.title}</i> (${ctx.sourceHandle})\n` +
        `${Math.max(0, clipRows.length - uploadFailures)}/${clipRows.length} shorts ready or scheduled: ${slots[0].toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} every ${ctx.intervalMin} min\n` +
        `Titles, captions (bottom), thumbnails attached. memory locked in the database.`;
      const tg = await sendRunReport({
        runId,
        summary,
        photo: firstThumbB64 ? { name: `run-${runId}-clip-01.jpg`, data: Buffer.from(firstThumbB64, "base64"), kind: "photo" } : undefined,
        report: { name: `run-${runId}-report.md`, data: Buffer.from(report, "utf8"), kind: "document" },
        creds: { botToken: ctx.telegramBotToken, chatId: ctx.telegramChatId },
      });
      telegramStatus = tg.error ? "failed" : tg.mode === "live" ? "sent" : "simulated";
      await db.update(runs).set({ telegramStatus, reportPath: reportRel, reportB64 }).where(eq(runs.id, runId));
      return {
        detail: tg.error ? `Failed: ${tg.error}` : tg.mode === "live" ? `Sent to your Telegram (${tg.sent.join(" + ")})` : "Simulated — add your chat ID in My Connections to receive it",
        mode: tg.mode,
        result: null,
      };
    });

    // ---------- 10. MEMORY + GITHUB STATE ----------
    await runStep(runId, steps, "memory", async () => {
      const fresh = await db.select().from(clips).where(eq(clips.runId, runId));
      await recordRunInMemory(
        {
          runId,
          mode: runModeFor(ctx),
          sourceVideoId: source.videoId,
          sourceVideoTitle: source.title,
          telegramStatus,
          clips: fresh
            .sort((a, b) => a.idx - b.idx)
            .map((c) => ({
              idx: c.idx,
              startSec: c.startSec,
              endSec: c.endSec,
              title: c.title,
              publishAt: c.publishAt ? new Date(c.publishAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "",
              youtubeVideoId: c.youtubeVideoId,
            })),
        },
        ctx.userId
      );
      await db
        .update(sourceVideos)
        .set({ status: "used", usedInRunId: runId })
        .where(and(eq(sourceVideos.userId, ctx.userId), eq(sourceVideos.videoId, source.videoId)));

      // Commit memory.md + the batch report to the GitHub state repo (best-effort).
      let stateDetail = `memory updated — \`${source.videoId}\` locked, never reused`;
      const gh = await pushUserState(ctx.userId, runId);
      if (gh) {
        stateDetail += gh.error
          ? ` · GitHub state failed: ${gh.error.slice(0, 80)}`
          : ` · committed to GitHub (${gh.files.map((f) => f.name).join(", ")})`;
      }
      return { detail: stateDetail, mode: "live", result: null };
    });

    await db
      .update(runs)
      .set({
        status: uploadFailures ? "partial" : "success",
        error: uploadFailures ? `${uploadFailures} YouTube upload(s) failed; successful uploads remain scheduled` : "",
        finishedAt: new Date(),
        reportPath: reportRel,
        mode: runModeFor(ctx),
      })
      .where(eq(runs.id, runId));
  } catch (e: any) {
    await db
      .update(runs)
      .set({ status: "failed", error: e.message?.slice(0, 400) ?? "unknown", finishedAt: new Date(), telegramStatus })
      .where(eq(runs.id, runId));
    throw e;
  } finally {
    await cleanupMediaWorkspace(mediaWorkspace);
  }
}

function buildReport(
  runId: number,
  source: SourceVideo,
  ctx: ExecCtx,
  clipRows: { idx: number; start: number; len: number; hook: string; title: string; description: string; hashtags: string; youtubeVideoId?: string }[],
  slots: Date[],
  integrationsLine: string
): string {
  const rows = clipRows
    .map(
      (c, i) => `| ${c.idx} | ${fmtTime(c.start)}–${fmtTime(c.start + c.len)} | ${c.title.replace(/\|/g, "/")} | ${slots[i].toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} |`
    )
    .join("\n");
  const details = clipRows
    .map(
      (c) => `### Clip ${String(c.idx).padStart(2, "0")} — ${c.title}
- Window: ${fmtTime(c.start)}–${fmtTime(c.start + c.len)} of source
- Hook caption: "${c.hook}" (bottom-anchored)
- Scheduled: ${slots[c.idx - 1].toISOString()}
- Description: ${c.description.replace(/\n/g, " ")}
- Hashtags: ${c.hashtags}
- YouTube: ${c.youtubeVideoId ? `https://youtube.com/watch?v=${c.youtubeVideoId}` : "not uploaded (simulation or failed)"}
- Artifacts: clip-${String(c.idx).padStart(2, "0")}-thumb.jpg, clip-${String(c.idx).padStart(2, "0")}.ass
`
    )
    .join("\n");
  return `# SHORTS FACTORY — BATCH REPORT RUN #${runId}
Generated: ${new Date().toISOString()}
User: #${ctx.userId} | Source channel: ${ctx.sourceHandle}

## Source
- Channel: ${source.channelTitle}
- Video: ${source.title}
- ID: \`${source.videoId}\` — https://youtube.com/watch?v=${source.videoId}
- Duration: ${fmtTime(source.durationSec)}

## Integrations
${integrationsLine}

## Schedule board (${clipRows.length} shorts, one run)
| # | Source window | Title | Publishes |
|--|--|--|--|
${rows}

## Clip details
${details}

_Captions are bottom-burned via the .ass files. Next run auto-skips this source via the database memory._
`;
}

/** Fires the pipeline for one user. */
export async function startPipeline(userId: number): Promise<number> {
  const ctx = await ctxForUser(userId);
  const [r] = await db.insert(runs).values({ status: "running", userId }).returning({ id: runs.id });
  executeRun(r.id, ctx).catch((err) => {
    console.error(`Pipeline start error for run #${r.id}:`, err);
  });
  return r.id;
}
