import { getEnv } from "./env";
import { getMemoryContent, setMemoryContent } from "./memory";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * State storage on GitHub (replaces Google Drive).
 * memory.md and each run report are committed to the repo so every collaborator
 * can read/restore them. Secrets (.env) are intentionally NEVER stored here.
 */

export type GithubSyncResult = {
  mode: "live" | "simulated";
  direction: "push" | "pull";
  files: { name: string; action: string; url?: string }[];
  error?: string;
};

const API = "https://api.github.com";

export function githubConfigured(): boolean {
  return !!getEnv("GITHUB_TOKEN");
}

export function githubRepo(): string {
  return getEnv("GITHUB_STATE_REPO", "lasttopper/shorts-factory");
}

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${getEnv("GITHUB_TOKEN")}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
  });
  return res;
}

async function currentSha(path: string): Promise<string | null> {
  const res = await gh(`/repos/${githubRepo()}/contents/${encodeURIComponent(path)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.sha ?? null;
}

/** Create or update a text file in the repo. */
export async function putFile(path: string, content: string, message: string): Promise<string> {
  const sha = await currentSha(path);
  const res = await gh(`/repos/${githubRepo()}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`GitHub commit failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data?.content?.html_url ?? `https://github.com/${githubRepo()}/blob/main/${path}`;
}

/** Read a text file from the repo. Returns null when it doesn't exist. */
export async function getFile(path: string): Promise<string | null> {
  const res = await gh(`/repos/${githubRepo()}/contents/${encodeURIComponent(path)}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.content) return null;
  return Buffer.from(data.content, "base64").toString("utf8");
}

export function memoryPath(userId: number): string {
  return `state/memory${userId ? `-u${userId}` : ""}.md`;
}

export function reportPath(runId: number): string {
  return `state/runs/run-${runId}.md`;
}

/** Commit this user's memory + the run report to GitHub. Best-effort, never throws. */
export async function pushUserState(userId: number, runId?: number): Promise<GithubSyncResult | null> {
  if (!githubConfigured()) return null;
  const files: GithubSyncResult["files"] = [];
  try {
    const mem = await getMemoryContent(userId);
    const url = await putFile(memoryPath(userId), mem, `chore(state): update memory for user ${userId}`);
    files.push({ name: memoryPath(userId), action: "committed", url });
    if (runId) {
      const [run] = await db.select().from(runs).where(eq(runs.id, runId));
      if (run?.reportB64) {
        const report = Buffer.from(run.reportB64, "base64").toString("utf8");
        const rUrl = await putFile(reportPath(runId), report, `chore(state): add batch report run #${runId}`);
        files.push({ name: reportPath(runId), action: "committed", url: rUrl });
      }
    }
    return { mode: "live", direction: "push", files };
  } catch (err: any) {
    return { mode: "live", direction: "push", files, error: err.message };
  }
}

/** Push this user's memory (and latest report) to GitHub. */
export async function pushToGithub(userId: number, runId?: number): Promise<GithubSyncResult> {
  if (!githubConfigured()) {
    return {
      mode: "simulated",
      direction: "push",
      files: [
        { name: memoryPath(userId), action: "would commit to " + githubRepo() },
      ],
    };
  }
  const r = await pushUserState(userId, runId);
  return r ?? { mode: "simulated", direction: "push", files: [] };
}

/** Restore this user's memory from GitHub. */
export async function pullFromGithub(userId: number): Promise<GithubSyncResult> {
  if (!githubConfigured()) {
    return { mode: "simulated", direction: "pull", files: [{ name: memoryPath(userId), action: "would download from " + githubRepo() }] };
  }
  const files: GithubSyncResult["files"] = [];
  try {
    const mem = await getFile(memoryPath(userId));
    if (mem !== null) {
      await setMemoryContent(userId, mem);
      files.push({ name: memoryPath(userId), action: "restored into database" });
    } else {
      files.push({ name: memoryPath(userId), action: "not found in repo" });
    }
    return { mode: "live", direction: "pull", files };
  } catch (err: any) {
    return { mode: "live", direction: "pull", files, error: err.message };
  }
}

export async function testGithub(): Promise<{ ok: boolean; detail: string }> {
  if (!githubConfigured()) return { ok: false, detail: "GITHUB_TOKEN not set — add a fine-grained token with Contents read/write on your repo" };
  try {
    const res = await gh(`/repos/${githubRepo()}`);
    if (!res.ok) return { ok: false, detail: `GitHub rejected token or repo (${res.status}) — check GITHUB_TOKEN and GITHUB_STATE_REPO` };
    const data = await res.json();
    return { ok: true, detail: `Connected to ${data.full_name} (${data.private ? "private" : "public"}) — state will be committed there` };
  } catch (e: any) {
    return { ok: false, detail: e.message };
  }
}
