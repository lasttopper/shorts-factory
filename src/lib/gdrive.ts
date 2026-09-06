import fs from "fs";
import { ENV_PATH, getEnv } from "./env";
import { MEMORY_PATH } from "./memory";

export type DriveSyncResult = {
  mode: "live" | "simulated";
  direction: "push" | "pull";
  files: { name: string; action: string; id?: string }[];
  error?: string;
};

async function driveFetch(url: string, init: RequestInit): Promise<Response> {
  const token = getEnv("GOOGLE_DRIVE_TOKEN");
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
  });
  return res;
}

async function findFile(name: string, folderId: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${name}' and '${folderId}' in parents and trashed=false`);
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {});
  if (!res.ok) throw new Error(`Drive list ${res.status}`);
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

async function uploadFile(name: string, absPath: string, folderId: string): Promise<{ id: string; action: string }> {
  const existing = await findFile(name, folderId);
  const content = fs.readFileSync(absPath);
  const boundary = "driveboundary" + Date.now();
  const metadata = existing ? { name } : { name, parents: [folderId] };
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
  const res = await driveFetch(url, {
    method: existing ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload ${name} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { id: data.id, action: existing ? "updated" : "created" };
}

async function downloadFile(name: string, folderId: string): Promise<string | null> {
  const id = await findFile(name, folderId);
  if (!id) return null;
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {});
  if (!res.ok) throw new Error(`Drive download ${res.status}`);
  return res.text();
}

export function driveConfigured(): boolean {
  return !!(getEnv("GDRIVE_FOLDER_ID") && getEnv("GOOGLE_DRIVE_TOKEN"));
}

/** Push .env + memory.md to the shared Drive folder so collaborators run with identical state. */
export async function pushToDrive(): Promise<DriveSyncResult> {
  if (!driveConfigured()) {
    return {
      mode: "simulated",
      direction: "push",
      files: [
        { name: ".env", action: "would upload to shared folder" },
        { name: "memory.md", action: "would upload to shared folder" },
      ],
    };
  }
  const folderId = getEnv("GDRIVE_FOLDER_ID");
  const files: DriveSyncResult["files"] = [];
  try {
    const e = await uploadFile(".env", ENV_PATH, folderId);
    files.push({ name: ".env", action: e.action, id: e.id });
    const m = await uploadFile("memory.md", MEMORY_PATH, folderId);
    files.push({ name: "memory.md", action: m.action, id: m.id });
    return { mode: "live", direction: "push", files };
  } catch (err: any) {
    return { mode: "live", direction: "push", files, error: err.message };
  }
}

/** Pull .env + memory.md from Drive (collab onboarding / state recovery). */
export async function pullFromDrive(): Promise<DriveSyncResult> {
  if (!driveConfigured()) {
    return { mode: "simulated", direction: "pull", files: [{ name: ".env", action: "would download" }, { name: "memory.md", action: "would download" }] };
  }
  const folderId = getEnv("GDRIVE_FOLDER_ID");
  const files: DriveSyncResult["files"] = [];
  try {
    const env = await downloadFile(".env", folderId);
    if (env !== null) {
      fs.writeFileSync(ENV_PATH, env);
      files.push({ name: ".env", action: "downloaded + applied" });
    } else files.push({ name: ".env", action: "not found in folder" });
    const mem = await downloadFile("memory.md", folderId);
    if (mem !== null) {
      fs.writeFileSync(MEMORY_PATH, mem);
      files.push({ name: "memory.md", action: "downloaded + applied" });
    } else files.push({ name: "memory.md", action: "not found in folder" });
    return { mode: "live", direction: "pull", files };
  } catch (err: any) {
    return { mode: "live", direction: "pull", files, error: err.message };
  }
}
