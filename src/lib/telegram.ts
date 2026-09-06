import { getEnv } from "./env";

export type TelegramResult = {
  mode: "live" | "simulated";
  sent: string[];
  preview: string;
  error?: string;
};

export type TgCreds = { botToken?: string; chatId?: string };
export type Attachment = { name: string; data: Buffer; kind: "photo" | "document" };

async function tgApi(method: string, form: FormData, botToken: string): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, { method: "POST", body: form });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

function bufferForm(chatId: string, field: string, file: Attachment, extra: Record<string, string>): FormData {
  const form = new FormData();
  form.set("chat_id", chatId);
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  form.set(field, new Blob([new Uint8Array(file.data)]), file.name);
  return form;
}

/** Sends the run report to Telegram: summary + thumbnail photo + full .md report document. */
export async function sendRunReport(opts: {
  runId: number;
  summary: string;
  photo?: Attachment;
  report?: Attachment;
  creds?: TgCreds;
}): Promise<TelegramResult> {
  const token = opts.creds?.botToken || getEnv("TELEGRAM_BOT_TOKEN");
  const chatId = opts.creds?.chatId || getEnv("TELEGRAM_CHAT_ID");
  const names = [opts.photo?.name, opts.report?.name].filter(Boolean).join(", ");
  const preview = `[TELEGRAM ${opts.runId}]\n${opts.summary}\nAttachments: ${names || "none"}`;

  if (!token || !chatId) {
    return { mode: "simulated", sent: [], preview };
  }
  try {
    const sent: string[] = [];
    if (opts.photo) {
      await tgApi("sendPhoto", bufferForm(chatId, "photo", opts.photo, {
        caption: opts.summary.slice(0, 1000),
        parse_mode: "HTML",
      }), token);
      sent.push("photo");
    } else {
      const form = new FormData();
      form.set("chat_id", chatId);
      form.set("text", opts.summary.slice(0, 4000));
      form.set("parse_mode", "HTML");
      await tgApi("sendMessage", form, token);
      sent.push("message");
    }
    if (opts.report) {
      await tgApi("sendDocument", bufferForm(chatId, "document", opts.report, {
        caption: `Full batch report — run #${opts.runId}`,
      }), token);
      sent.push("document");
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
