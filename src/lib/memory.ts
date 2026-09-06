import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
export const MEMORY_PATH = path.join(DATA_DIR, "memory.md");

const USED_BEGIN = "<!-- USED:BEGIN -->";
const USED_END = "<!-- USED:END -->";

/** Per-user memory file: data/users/u-{id}/memory.md (id 0 = shared system file). */
export function memoryPathFor(userId: number): string {
  if (!userId) return MEMORY_PATH;
  return path.join(DATA_DIR, "users", `u-${userId}`, "memory.md");
}

export type MemoryData = {
  content: string;
  usedVideoIds: string[];
  lastRunId: number;
  runCount: number;
};

function baseFile(userId: number): string {
  return `# SHORTS FACTORY — PIPELINE MEMORY ${userId ? `— USER #${userId}` : "— SHARED"}
> Auto-managed by the pipeline. The orchestrator reads the USED list below so a source video is NEVER picked twice.
> Collaborators can sync this file through the Google Drive vault.

## Used source videos — DO NOT REUSE
${USED_BEGIN}
${USED_END}

## Next run notes
- Run the pipeline from the dashboard or POST /api/pipeline/run once per day.
- 10 shorts are planned, captioned, thumbnailed and scheduled in a single run.

## Run log (newest first)
`;
}

export function ensureMemoryFile(memPath: string = MEMORY_PATH): void {
  const dir = path.dirname(memPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(memPath)) {
    const m = memPath.match(/u-(\d+)/);
    fs.writeFileSync(memPath, baseFile(m ? parseInt(m[1], 10) : 0));
  }
}

export function readMemory(memPath: string = MEMORY_PATH): MemoryData {
  ensureMemoryFile(memPath);
  const content = fs.readFileSync(memPath, "utf8");
  const usedVideoIds: string[] = [];
  const b = content.indexOf(USED_BEGIN);
  const e = content.indexOf(USED_END);
  if (b !== -1 && e !== -1) {
    const section = content.slice(b + USED_BEGIN.length, e);
    for (const line of section.split("\n")) {
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

export function recordRunInMemory(entry: RunMemoryEntry, memPath: string = MEMORY_PATH): void {
  ensureMemoryFile(memPath);
  let content = fs.readFileSync(memPath, "utf8");
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

  fs.writeFileSync(memPath, content);
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
