import fs from "fs";
import path from "path";
import { getEnv } from "./env";

export type TelegramResult = {
  mode: "live" | "simulated";
  sent: string[];
  preview: string;
  error?: string;
};

export type TgCreds = { botToken?: string; chatId?: string };

async function tgApi(method: string, form: FormData, botToken: string): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, { method: "POST", body: form });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

function fileForm(chatId: string, field: string, filePath: string, extra: Record<string, string>): FormData {
  const form = new FormData();
  form.set("chat_id", chatId);
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  const buf = fs.readFileSync(filePath);
  form.set(field, new Blob([buf]), path.basename(filePath));
  return form;
}

/** Sends the run report to Telegram: summary message + thumbnail photo + full .md report document. */
export async function sendRunReport(opts: {
  runId: number;
  summary: string;
  photoPath?: string;
  reportPath: string;
  creds?: TgCreds;
}): Promise<TelegramResult> {
  const token = opts.creds?.botToken || getEnv("TELEGRAM_BOT_TOKEN");
  const chatId = opts.creds?.chatId || getEnv("TELEGRAM_CHAT_ID");
  const preview = `[TELEGRAM ${opts.runId}]\n${opts.summary}\nAttachments: ${[opts.photoPath, opts.reportPath].filter(Boolean).map((p) => path.basename(p!)).join(", ")}`;

  if (!token || !chatId) {
    return { mode: "simulated", sent: [], preview };
  }
  try {
    const sent: string[] = [];
    if (opts.photoPath && fs.existsSync(opts.photoPath)) {
      await tgApi("sendPhoto", fileForm(chatId, "photo", opts.photoPath, {
        caption: opts.summary.slice(0, 1000),
        parse_mode: "HTML",
      }), token);
      sent.push("photo");
      if (fs.existsSync(opts.reportPath)) {
        await tgApi("sendDocument", fileForm(chatId, "document", opts.reportPath, {
          caption: `Full batch report — run #${opts.runId}`,
        }), token);
        sent.push("document");
      }
    } else {
      const form = new FormData();
      form.set("chat_id", chatId);
      form.set("text", opts.summary.slice(0, 4000));
      form.set("parse_mode", "HTML");
      await tgApi("sendMessage", form, token);
      sent.push("message");
      if (fs.existsSync(opts.reportPath)) {
        await tgApi("sendDocument", fileForm(chatId, "document", opts.reportPath, {
          caption: `Full batch report — run #${opts.runId}`,
        }), token);
        sent.push("document");
      }
    }
    return { mode: "live", sent, preview };
  } catch (e: any) {
    return { mode: "live", sent: [], preview, error: e.message };
  }
}

export async function testTelegram(creds: TgCreds = {}): Promise<{ ok: boolean; detail: string }> {
  const token = creds.botToken || getEnv("TELEGRAM_BOT_TOKEN");
  const chatId = creds.chatId || getEnv("TELEGRAM_CHAT_ID");
  if (!token) return { ok: false, detail: "No bot token configured (system TELEGRAM_BOT_TOKEN missing)" };
  if (!chatId) return { ok: false, detail: "Enter your Telegram chat ID in My Connections first" };
  try {
    const form = new FormData();
    form.set("chat_id", chatId);
    form.set("text", "Shorts Factory connected. Your daily batch reports will land here.");
    await tgApi("sendMessage", form, token);
    return { ok: true, detail: "Test message delivered to your chat" };
  } catch (e: any) {
    return { ok: false, detail: e.message };
  }
}
