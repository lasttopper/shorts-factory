import { getEnv } from "./env";
import type { CaptionLine } from "@/db/schema";

export type ClipMeta = {
  hook: string;
  title: string;
  description: string;
  hashtags: string;
};

const HOOK_BANK = [
  "Nobody talks about this",
  "You're doing this wrong",
  "This changes everything",
  "Stop scrolling",
  "The secret is simple",
  "Watch till the end",
  "Most people miss this",
  "This is your sign",
  "Here's the truth",
  "Save this for later",
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

function topicFromTitle(sourceTitle: string): string {
  return sourceTitle.replace(/[—\-|:].*$/, "").replace(/^\d+\s+/, "").trim();
}

/** Call OpenAI chat completions with a JSON response. Returns null when unconfigured or on failure. */
async function openaiJson<T>(system: string, user: string, keyOverride?: string, modelOverride?: string): Promise<T | null> {
  const key = keyOverride || getEnv("OPENAI_API_KEY");
  if (!key) return null;
  const model = modelOverride || getEnv("OPENAI_MODEL", "gpt-4o-mini");
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.9,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function generateClipMeta(
  sourceTitle: string,
  idx: number,
  channelName: string,
  keyOverride?: string,
  modelOverride?: string
): Promise<{ meta: ClipMeta; live: boolean }> {
  const ai = await openaiJson<{ hook: string; title: string; description: string; hashtags: string }>(
    "You write viral YouTube Shorts metadata for a fashion/style channel. Strict JSON. No emojis. Titles under 70 chars, punchy, no clickbait lies.",
    `Source video: "${sourceTitle}" by ${channelName}. This is clip ${idx} of 10 cut from the best moments. Return {"hook","title","description","hashtags"}. hook = 3-6 word on-screen caption opener. description = 2 short lines + CTA to watch the full video. hashtags = 5 space-separated including #shorts.`,
    keyOverride,
    modelOverride
  );
  if (ai?.title && ai?.description) {
    return {
      meta: {
        hook: ai.hook || HOOK_BANK[idx % HOOK_BANK.length],
        title: ai.title.slice(0, 90),
        description: ai.description,
        hashtags: ai.hashtags || "#shorts #fashion #style",
      },
      live: true,
    };
  }
  // Template fallback
  const h = hashStr(sourceTitle) + idx;
  const topic = topicFromTitle(sourceTitle);
  const hook = HOOK_BANK[h % HOOK_BANK.length];
  const patterns = [
    `${hook} — ${topic}`,
    `${topic} (Part ${idx})`,
    `The Part Everyone Replays — ${topic}`,
    `${topic} in 60 Seconds`,
    `POV: ${topic}`,
  ];
  const title = patterns[h % patterns.length].slice(0, 90);
  const description = `${titleCase(topic)} — best moment #${idx} from "${sourceTitle}".\nWatch the full video on the ${channelName} channel. New shorts daily.`;
  return {
    meta: { hook, title, description, hashtags: "#shorts #fashion #style #ootd #streetwear" },
    live: false,
  };
}

export async function generateCaptions(
  sourceTitle: string,
  hook: string,
  clipLenSec: number,
  keyOverride?: string,
  modelOverride?: string
): Promise<{ captions: CaptionLine[]; live: boolean }> {
  const ai = await openaiJson<{ lines: string[] }>(
    'You write word-by-word style captions for YouTube Shorts. Strict JSON {"lines": [...]} of 8 to 12 entries, each 2-6 words, conversational, no emojis.',
    `Write captions for a ${clipLenSec}s short cut from "${sourceTitle}". First line must be the hook: "${hook}". End with a follow CTA.`,
    keyOverride,
    modelOverride
  );
  if (ai?.lines && ai.lines.length >= 4) {
    return { captions: spreadLines(ai.lines.slice(0, 12), clipLenSec), live: true };
  }
  const topic = topicFromTitle(sourceTitle);
  const lines = [
    hook,
    topic,
    "here's what nobody tells you",
    "it takes less than a minute",
    "the difference is insane",
    "this is the part that matters",
    "most people skip this step",
    "and that's exactly the point",
    "try it this week",
    "follow for part two",
  ];
  return { captions: spreadLines(lines, clipLenSec), live: false };
}

function spreadLines(lines: string[], clipLenSec: number): CaptionLine[] {
  const usable = Math.max(8, clipLenSec - 2);
  const per = usable / lines.length;
  return lines.map((text, i) => ({
    t0: +(1 + i * per).toFixed(2),
    t1: +(1 + (i + 1) * per - 0.15).toFixed(2),
    text,
  }));
}

/** Transcribes one rendered clip's source audio into real timed caption phrases. */
export async function transcribeClipAudio(
  audioPath: string,
  apiKey: string
): Promise<CaptionLine[] | null> {
  if (!apiKey) return null;
  try {
    const fs = await import("fs");
    const bytes = fs.readFileSync(audioPath);
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }), "speech.mp3");
    form.set("model", "whisper-1");
    form.set("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`transcription failed (${res.status})`);
    const data = await res.json();
    const segments: { start: number; end: number; text: string }[] = data?.segments || [];
    const captions: CaptionLine[] = [];
    for (const segment of segments) {
      const words = String(segment.text || "").trim().split(/\s+/).filter(Boolean);
      if (!words.length) continue;
      const chunks: string[][] = [];
      for (let i = 0; i < words.length; i += 6) chunks.push(words.slice(i, i + 6));
      const duration = Math.max(0.8, segment.end - segment.start);
      const per = duration / chunks.length;
      chunks.forEach((chunk, i) => {
        captions.push({
          t0: +(segment.start + i * per).toFixed(2),
          t1: +(segment.start + (i + 1) * per - 0.05).toFixed(2),
          text: chunk.join(" "),
        });
      });
    }
    return captions.length ? captions : null;
  } catch (err: any) {
    console.error("Speech transcription fallback:", err?.message || err);
    return null;
  }
}
