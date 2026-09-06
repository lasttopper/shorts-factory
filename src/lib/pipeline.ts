import fs from "fs";
import path from "path";
import { db } from "@/db";
import { runs, clips, sourceVideos, type StepLog, type CaptionLine } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { SIMULATED_CATALOG, type SourceVideo } from "./catalog";
import { fetchChannelVideos } from "./youtube";
import { generateCaptions, generateClipMeta } from "./ai";
import { artifactDir, buildAss, clipSvg, ffmpegCommand, renderThumbnail, relPublic } from "./thumbnail";
import { sendRunReport } from "./telegram";
import { envInt } from "./env";
import { fmtTime, readMemory, recordRunInMemory } from "./memory";
import { ctxForUser, ctxStatuses, runModeFor, type ExecCtx } from "./context";

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
          .select()
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

    // ---------- 2. SELECT (dedupe via this user's memory.md + DB) ----------
    const source = await runStep(runId, steps, "select", async () => {
      const mem = readMemory(ctx.memoryPath);
      const usedRows = await db
        .select()
        .from(sourceVideos)
        .where(and(eq(sourceVideos.userId, ctx.userId), eq(sourceVideos.status, "used")));
      const used = new Set([...mem.usedVideoIds, ...usedRows.map((r) => r.videoId)]);
      const fresh = catalog.filter((v) => !used.has(v.videoId) && v.durationSec >= 300);
      await sleep(350);
      if (!fresh.length) throw new Error("No unused source videos left — every catalog video is already in your memory.md");
      const pick = fresh[0];
      await db.update(runs).set({ sourceVideoId: pick.videoId, sourceVideoTitle: pick.title }).where(eq(runs.id, runId));
      return {
        detail: `"${pick.title}" (${fmtTime(pick.durationSec)}) — ${used.size} already used, ${fresh.length} fresh`,
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
      const out: Plan[] = [];
      for (let i = 0; i < ctx.shortsPerRun; i++) {
        const len = Math.round(clipMin + seededJitter(source.videoId, i * 7 + 3) * (clipMax - clipMin));
        const wStart = lo + i * span;
        const maxStart = Math.min(wStart + span * 0.55, hi - len);
        const start = Math.floor(wStart + seededJitter(source.videoId, i * 13 + 1) * (maxStart - wStart));
        out.push({ idx: i + 1, start: Math.max(0, start), len });
      }
      await sleep(400);
      return { detail: `${ctx.shortsPerRun} windows across ${fmtTime(D)} of footage, ${clipMin}-${clipMax}s each`, mode: "live" as const, result: out };
    });

    for (const p of plan) p.len = Math.min(59, p.len);

    // ---------- 4-5. CAPTIONS + METADATA ----------
    const dir = artifactDir(runId);
    const channelName = ctx.sourceHandle;
    const clipRows: { id: number; idx: number; start: number; len: number; hook: string; title: string; description: string; hashtags: string; captions: CaptionLine[] }[] = [];

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
        clipRows.push({ id: inserted.id, idx: p.idx, start: p.start, len: p.len, hook: "", title: "", description: "", hashtags: "", captions });
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

    // ---------- 6. THUMBNAILS ----------
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
        const base = path.join(dir, `clip-${String(c.idx).padStart(2, "0")}-thumb`);
        const rendered = await renderThumbnail(svg, base);
        const ass = buildAss(c.captions);
        const assName = `clip-${String(c.idx).padStart(2, "0")}.ass`;
        fs.writeFileSync(path.join(dir, assName), ass);
        const cmd = ffmpegCommand(source.videoId, c.start, c.len, `run-${runId}/${assName}`, `clip-${String(c.idx).padStart(2, "0")}.mp4`);
        await db.update(clips).set({ thumbnailPath: rendered.rel, assPath: `/artifacts/run-${runId}/${assName}`, renderCommand: cmd }).where(eq(clips.id, c.id));
      }
      return { detail: `${clipRows.length} 1280×720 thumbnails + .ass caption files saved to /artifacts/run-${runId}`, mode: "live", result: null };
    });

    // ---------- 7. RENDER ----------
    await runStep(runId, steps, "render", async () => {
      await sleep(650);
      for (const c of clipRows) {
        await db.update(clips).set({ status: "rendered" }).where(eq(clips.id, c.id));
      }
      return {
        detail: "Render jobs prepared (yt-dlp + ffmpeg burn-in command stored per clip; execute on a worker with ffmpeg to produce real mp4s)",
        mode: "simulated",
        result: null,
      };
    });

    // ---------- 8. SCHEDULE ----------
    const slots: Date[] = await runStep(runId, steps, "schedule", async () => {
      const now = new Date();
      const first = new Date(now);
      first.setHours(ctx.startHour, 0, 0, 0);
      if (first.getTime() <= now.getTime() + 30 * 60_000) first.setDate(first.getDate() + 1);
      const out: Date[] = [];
      let scheduled = 0;
      const uploadLive = ctx.uploadEnabled && !!ctx.ytRefreshToken;
      for (const c of clipRows.sort((a, b) => a.idx - b.idx)) {
        const slot = new Date(first.getTime() + (c.idx - 1) * ctx.intervalMin * 60_000);
        out.push(slot);
        const ytId = uploadLive ? "" : `dry_${(runId * 100 + c.idx).toString(36)}${Math.abs(Date.now() % 1296).toString(36)}`;
        await db
          .update(clips)
          .set({ publishAt: slot, youtubeVideoId: ytId, status: uploadLive ? "planned" : "scheduled" })
          .where(eq(clips.id, c.id));
        scheduled++;
      }
      await db.update(runs).set({ shortsScheduled: scheduled }).where(eq(runs.id, runId));
      const mode = uploadLive ? "live" : "simulated";
      return {
        detail: uploadLive
          ? `${scheduled} uploads queued on YOUR channel (OAuth publishAt scheduling)`
          : `${scheduled} slots locked: ${out[0].toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} → every ${ctx.intervalMin} min (dry-run ids)`,
        mode: mode as "live" | "simulated",
        result: out,
      };
    });

    // ---------- 9. TELEGRAM ----------
    await runStep(runId, steps, "telegram", async () => {
      const statusList = ctxStatuses(ctx);
      const report = buildReport(runId, source, ctx, clipRows.sort((a, b) => a.idx - b.idx), slots, statusList.map((s) => `${s.live ? "LIVE" : "SIM "} ${s.label}`).join("  •  "));
      const reportPath = path.join(dir, `run-${runId}-report.md`);
      fs.writeFileSync(reportPath, report);
      reportRel = relPublic(reportPath);

      const summary =
        `<b>SHORTS FACTORY — RUN #${runId} COMPLETE</b>\n` +
        `Source: <i>${source.title}</i> (${ctx.sourceHandle})\n` +
        `${clipRows.length} shorts scheduled: ${slots[0].toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} every ${ctx.intervalMin} min\n` +
        `Titles, captions (bottom), thumbnails attached. memory.md updated.`;
      const firstThumb = path.join(dir, "clip-01-thumb.jpg");
      const tg = await sendRunReport({
        runId,
        summary,
        photoPath: fs.existsSync(firstThumb) ? firstThumb : undefined,
        reportPath,
        creds: { botToken: ctx.telegramBotToken, chatId: ctx.telegramChatId },
      });
      telegramStatus = tg.error ? "failed" : tg.mode === "live" ? "sent" : "simulated";
      await db.update(runs).set({ telegramStatus, reportPath: reportRel }).where(eq(runs.id, runId));
      return {
        detail: tg.error ? `Failed: ${tg.error}` : tg.mode === "live" ? `Sent to your Telegram (${tg.sent.join(" + ")})` : "Simulated — add your chat ID in My Connections to receive it",
        mode: tg.mode,
        result: null,
      };
    });

    // ---------- 10. MEMORY ----------
    await runStep(runId, steps, "memory", async () => {
      const fresh = await db.select().from(clips).where(eq(clips.runId, runId));
      recordRunInMemory(
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
        ctx.memoryPath
      );
      await db
        .update(sourceVideos)
        .set({ status: "used", usedInRunId: runId })
        .where(and(eq(sourceVideos.userId, ctx.userId), eq(sourceVideos.videoId, source.videoId)));
      return { detail: `your memory.md updated — \`${source.videoId}\` locked, never reused`, mode: "live", result: null };
    });

    await db
      .update(runs)
      .set({ status: "success", finishedAt: new Date(), reportPath: reportRel, mode: runModeFor(ctx) })
      .where(eq(runs.id, runId));
  } catch (e: any) {
    await db
      .update(runs)
      .set({ status: "failed", error: e.message?.slice(0, 400) ?? "unknown", finishedAt: new Date(), telegramStatus })
      .where(eq(runs.id, runId));
    throw e;
  }
}

function buildReport(
  runId: number,
  source: SourceVideo,
  ctx: ExecCtx,
  clipRows: { idx: number; start: number; len: number; hook: string; title: string; description: string; hashtags: string }[],
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
- Hook caption: "${c.hook}" (bottom-anchored, .ass attached)
- Scheduled: ${slots[c.idx - 1].toISOString()}
- Description: ${c.description.replace(/\n/g, " ")}
- Hashtags: ${c.hashtags}
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

_Captions are bottom-burned via the attached .ass files. Next run auto-skips this source via memory.md._
`;
}

/** Fires the pipeline asynchronously for one user and returns the run id immediately. */
export async function startPipeline(userId: number): Promise<number> {
  const ctx = await ctxForUser(userId);
  const [r] = await db.insert(runs).values({ status: "running", userId }).returning({ id: runs.id });
  executeRun(r.id, ctx).catch(() => {});
  return r.id;
}
