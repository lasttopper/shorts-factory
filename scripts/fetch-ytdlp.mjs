import fs from "node:fs/promises";
import path from "node:path";

const url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";
const dir = path.join(process.cwd(), "bin");
const target = path.join(dir, "yt-dlp");

await fs.mkdir(dir, { recursive: true });
try {
  await fs.access(target);
  console.log("yt-dlp already present");
} catch {
  console.log("Downloading yt-dlp standalone binary…");
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`yt-dlp download failed (${res.status})`);
  await fs.writeFile(target, Buffer.from(await res.arrayBuffer()), { mode: 0o755 });
}
await fs.chmod(target, 0o755);
console.log("yt-dlp ready at bin/yt-dlp");
