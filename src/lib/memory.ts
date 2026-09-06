import { db } from "@/db";
import { userMemories } from "@/db/schema";
import { eq } from "drizzle-orm";

const USED_BEGIN = "<!-- USED:BEGIN -->";
const USED_END = "<!-- USED:END -->";

export type MemoryData = {
  content: string;
  usedVideoIds: string[];
  lastRunId: number;
  runCount: number;
};

function baseContent(userId: number): string {
  return `# SHORTS FACTORY — PIPELINE MEMORY ${userId ? `— USER #${userId}` : "— SHARED"}
> Auto-managed by the pipeline. Stored in PostgreSQL so it survives every host.
> The orchestrator reads the USED list below so a source video is NEVER picked twice.

## Used source videos — DO NOT REUSE
${USED_BEGIN}
${USED_END}

## Next run notes
- Run the pipeline from the dashboard or POST /api/pipeline/run once per day.
- 10 shorts are planned, captioned, thumbnailed and scheduled in a single run.

## Run log (newest first)
`;
}

export async function getMemoryContent(userId: number): Promise<string> {
  const [row] = await db.select().from(userMemories).where(eq(userMemories.userId, userId));
  if (row) return row.content;
  const content = baseContent(userId);
  await db.insert(userMemories).values({ userId, content }).onConflictDoNothing();
  return content;
}

export async function setMemoryContent(userId: number, content: string): Promise<void> {
  const [row] = await db.select().from(userMemories).where(eq(userMemories.userId, userId));
  if (row) {
    await db.update(userMemories).set({ content, updatedAt: new Date() }).where(eq(userMemories.userId, userId));
  } else {
    await db.insert(userMemories).values({ userId, content });
  }
}

export async function readMemory(userId: number): Promise<MemoryData> {
  const content = await getMemoryContent(userId);
  const usedVideoIds: string[] = [];
  const b = content.indexOf(USED_BEGIN);
  const e = content.indexOf(USED_END);
  if (b !== -1 && e !== -1) {
    for (const line of content.slice(b + USED_BEGIN.length, e).split("\n")) {
      const m = line.match(/^\s*-\s*`?([A-Za-z0-9_-]{3,})`?\s*\|/);
      if (m) usedVideoIds.push(m[1]);
    }
  }
  const runIds = [...content.matchAll(/### Run #(\d+)/g)].map((m) => parseInt(m[1], 10));
  return {
    content,
    usedVideoIds,
    lastRunId: runIds.length ? Math.max(...runIds) : 0,
    runCount: runIds.length,
  };
}

export type RunMemoryEntry = {
  runId: number;
  mode: string;
  sourceVideoId: string;
  sourceVideoTitle: string;
  clips: { idx: number; startSec: number; endSec: number; title: string; publishAt: string; youtubeVideoId: string }[];
  telegramStatus: string;
};

export async function recordRunInMemory(entry: RunMemoryEntry, userId: number): Promise<void> {
  let content = await getMemoryContent(userId);
  const date = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

  const usedLine = `- \`${entry.sourceVideoId}\` | ${entry.sourceVideoTitle} | run #${entry.runId} | ${date}`;
  if (content.includes(USED_BEGIN) && content.includes(USED_END)) {
    const e = content.indexOf(USED_END);
    content = content.slice(0, e) + usedLine + "\n" + content.slice(e);
  }

  const notes = `## Next run notes
- Last completed run: #${entry.runId} (${date}) — source \`${entry.sourceVideoId}\` is now locked.
- Next run will auto-skip it via the USED list above + database history.
- Reminder: runs are idempotent — re-running the same day picks the NEXT unused video.`;
  content = content.replace(/## Next run notes[\s\S]*?(?=\n## )/m, notes + "\n");

  const clipLines = entry.clips
    .map((c) => `  ${String(c.idx).padStart(2, "0")}. [${fmtTime(c.startSec)}-${fmtTime(c.endSec)}] ${c.title} → publishes ${c.publishAt}${c.youtubeVideoId ? ` (yt: ${c.youtubeVideoId})` : ""}`)
    .join("\n");
  const logEntry = `### Run #${entry.runId} — ${date}
- Mode: ${entry.mode} | Telegram: ${entry.telegramStatus}
- Source: ${entry.sourceVideoTitle} (\`${entry.sourceVideoId}\`)
- Clips:
${clipLines}

`;
  content = content.replace("## Run log (newest first)\n", "## Run log (newest first)\n" + logEntry);

  await setMemoryContent(userId, content);
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
