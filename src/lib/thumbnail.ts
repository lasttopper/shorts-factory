import sharp from "sharp";
import type { CaptionLine } from "@/db/schema";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > perLine && cur) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur += " " + w;
    }
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.slice(0, maxLines);
}

const PALETTES: [string, string, string][] = [
  ["#d4ff3f", "#101308", "#1d2606"],
  ["#7ee8fa", "#081216", "#06222b"],
  ["#ff4d4d", "#160808", "#2b0a0a"],
  ["#c792ff", "#110a18", "#20102e"],
  ["#ffb347", "#171006", "#2e1e05"],
];

export function clipSvg(opts: {
  idx: number;
  total: number;
  title: string;
  hook: string;
  window: string;
  channelTag: string;
}): string {
  const [accent, bg, bg2] = PALETTES[(opts.idx - 1) % PALETTES.length];
  const titleLines = wrap(opts.title, 20, 3);
  const hookLines = wrap(`"${opts.hook.toUpperCase()}"`, 26, 2);
  const W = 1280, H = 720;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg2}"/><stop offset="1" stop-color="${bg}"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#000000" stop-opacity="0.85"/><stop offset="0.45" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.82" cy="0.2" r="0.9">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.28"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
      <path d="M64 0H0V64" fill="none" stroke="#ffffff" stroke-opacity="0.05"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#fade)"/>

  <rect x="64" y="56" width="14" height="14" fill="${accent}"/>
  <text x="92" y="69" font-family="monospace" font-size="20" fill="#ffffff" fill-opacity="0.75" letter-spacing="4">${esc(opts.channelTag.toUpperCase())} • SHORTS</text>

  <text x="1204" y="240" text-anchor="end" font-family="Arial Black, Arial" font-weight="900" font-size="230" fill="none" stroke="${accent}" stroke-width="2.5" fill-opacity="0.1">${String(opts.idx).padStart(2, "0")}</text>
  <text x="1216" y="228" text-anchor="end" font-family="Arial Black, Arial" font-weight="900" font-size="230" fill="${accent}" fill-opacity="0.16">${String(opts.idx).padStart(2, "0")}</text>

  <text x="1216" y="330" text-anchor="end" font-family="monospace" font-size="22" fill="${accent}">CLIP ${String(opts.idx).padStart(2, "0")}/${opts.total}  •  ${esc(opts.window)}</text>

  ${titleLines
    .map(
      (l, i) =>
        `<text x="64" y="${(titleLines.length >= 3 ? 396 : titleLines.length === 2 ? 448 : 496) + i * 70}" font-family="Arial Black, Arial" font-weight="900" font-size="${titleLines.length >= 3 ? 62 : 66}" fill="#ffffff">${esc(l)}</text>`
    )
    .join("")}

  <rect x="0" y="${H - 132}" width="${W}" height="132" fill="#000000" fill-opacity="0.55"/>
  <rect x="0" y="${H - 132}" width="${W}" height="4" fill="${accent}"/>
  ${hookLines
    .map(
      (l, i) =>
        `<text x="${W / 2}" y="${H - 78 + i * 40}" text-anchor="middle" font-family="Arial" font-weight="700" font-size="34" fill="${accent}">${esc(l)}</text>`
    )
    .join("")}
</svg>`;
}

/** Renders SVG -> high-quality JPEG thumbnail buffer (serverless-safe: no disk). */
export async function renderThumbnail(svg: string): Promise<Buffer> {
  try {
    return await sharp(Buffer.from(svg), { density: 150 }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  } catch {
    return Buffer.from(svg);
  }
}

/** Builds an .ass subtitle file with bottom-center styling ready for ffmpeg burn-in. */
export function buildAss(captions: CaptionLine[]): string {
  const fmt = (t: number) => {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    const cs = Math.round((t - Math.floor(t)) * 100);
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  };
  const header = `[Script Info]
Title: Shorts captions (bottom)
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Bottom,DejaVu Sans,58,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,4,1.5,2,48,48,120,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const rows = captions
    .map((c) => `Dialogue: 0,${fmt(c.t0)},${fmt(c.t1)},Bottom,,0,0,0,,${c.text.replace(/\n/g, " ")}`)
    .join("\n");
  return header + rows + "\n";
}

export function ffmpegCommand(srcVideoId: string, startSec: number, durSec: number, assRel: string, outName: string): string {
  return [
    `yt-dlp -f "bv*+ba/b" "https://youtube.com/watch?v=${srcVideoId}" -o source.mp4`,
    `ffmpeg -ss ${startSec} -t ${durSec} -i source.mp4 -vf "crop=iw*9/16:ih,scale=1080:1920,subtitles='${assRel}':force_style='Alignment=2',eq=saturation=1.1" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 128k ${outName}`,
  ].join(" && ");
}
