"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft, CalendarClock, CheckCircle2, CloudDownload, CloudUpload, FlaskConical,
  KeyRound, Link2, Loader2, Save, Send, Users, Video, XCircle, Sparkles,
} from "lucide-react";
import { usePoll } from "@/components/ui";
import YoutubeConnectCard from "@/components/YoutubeConnectCard";

type KeyDef = { key: string; label: string; group: string; secret?: boolean; placeholder?: string; help?: string; set: boolean; masked: string };

const GROUP_META: Record<string, { title: string; integration: string | null; blurb: string }> = {
  "Source": { title: "GLOBAL DEFAULTS", integration: null, blurb: "Shared fallback settings for the whole factory — your personal connections above override these." },
  "YouTube": { title: "SYSTEM — YOUTUBE DATA API", integration: "youtube_scan", blurb: "One shared Data API key powers live channel scans for every user." },
  "AI": { title: "SYSTEM — AI FALLBACK", integration: "openai", blurb: "Shared OpenAI key. Your personal key (My Connections) takes priority." },
  "Telegram": { title: "SYSTEM — FACTORY BOT", integration: "telegram", blurb: "One bot (@BotFather) delivers reports. Each user only adds their chat ID above." },
  "Google Drive": { title: "COLLAB VAULT", integration: "gdrive", blurb: ".env and memory.md live in a shared folder so the whole team runs with identical system credentials and state." },
};

function Field({ label, value, onChange, placeholder, secret, help, set: isSet }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; secret?: boolean; help?: string; set?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="mono flex items-center justify-between text-[10.5px] tracking-[0.18em] text-[#8b93a7]">
        {label.toUpperCase()}
        {isSet && <span className="text-[10px] text-emerald-400">SET ✓</span>}
      </span>
      <input
        type={secret ? "password" : "text"}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mono rounded-lg border border-[#232839] bg-[#0b0d13] px-3.5 py-2.5 text-[12.5px] text-[#e8eaf0] outline-none transition-colors placeholder:text-[#454d63] focus:border-[#d4ff3f]"
      />
      {help && <span className="text-[11px] text-[#576080]">{help}</span>}
    </label>
  );
}

export default function SettingsPage() {
  const { data: me, refresh: refreshMe } = usePoll<any>("/api/auth/me", 60000);
  const { data: profile, refresh: refreshProfile } = usePoll<any>(me?.user ? "/api/profile" : null, 60000);
  const { data, refresh } = usePoll<any>(me?.user ? "/api/settings" : null, 60000);

  const [profileValues, setProfileValues] = useState<Record<string, string | boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<"profile" | "system" | null>(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; detail: string } | "loading">>({});
  const [syncResult, setSyncResult] = useState<any>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  const cfg = profile?.config ?? {};
  const setFlags = profile?.set ?? {};

  const flash = (msg: string) => {
    setSavedMsg(msg);
    setTimeout(() => setSavedMsg(""), 3500);
  };

  const saveProfile = async () => {
    setSaving("profile");
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: profileValues }),
      });
      if (res.ok) {
        flash("YOUR CONNECTIONS SAVED");
        setProfileValues({});
        refreshProfile();
        refreshMe();
      }
    } finally {
      setSaving(null);
    }
  };

  const saveSystem = async () => {
    setSaving("system");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const d = await res.json();
      if (d.ok) {
        flash(`SAVED ${d.saved.length} KEY${d.saved.length === 1 ? "" : "S"} TO SHARED .ENV`);
        setValues({});
        refresh();
      }
    } finally {
      setSaving(null);
    }
  };

  const test = async (integration: string) => {
    setTestResults((r) => ({ ...r, [integration]: "loading" }));
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integration }),
      });
      const d = await res.json();
      setTestResults((r) => ({ ...r, [integration]: { ok: d.ok, detail: d.detail } }));
    } catch (e: any) {
      setTestResults((r) => ({ ...r, [integration]: { ok: false, detail: e.message } }));
    }
  };

  const sync = async (direction: "push" | "pull") => {
    setSyncing(direction);
    setSyncResult(null);
    try {
      const res = await fetch("/api/gdrive/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      setSyncResult(await res.json());
    } finally {
      setSyncing(null);
    }
  };

  const pv = (k: string) => (profileValues[k] as string) ?? "";
  const spv = (k: string) => (v: string) => setProfileValues((s) => ({ ...s, [k]: v }));

  if (me && !me.user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="mono text-[12px] tracking-[0.25em] text-[#576080]">LOG IN TO MANAGE CONNECTIONS</p>
        <Link href="/" className="rounded-xl bg-[#d4ff3f] px-6 py-3 text-[13px] font-bold text-black">GO TO LOGIN</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#1e2230] bg-[#0a0b0e]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2 text-[13px] font-semibold text-[#aab1c5] hover:text-white">
            <ArrowLeft size={16} /> Control Room
          </Link>
          <span className="mono text-[11px] tracking-[0.3em] text-[#8b93a7]">CONNECTIONS & KEYS</span>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-5 pb-24 pt-24">
        <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            MY <span className="text-outline-volt">CONNECTIONS</span>
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[#9aa2b8]">
            These are <span className="font-semibold text-[#e8eaf0]">yours alone</span> — your source channel, your upload channel,
            your Telegram. The shared factory keys below only fill gaps you leave open.
          </p>
        </motion.header>

        <div className="flex flex-col gap-8">
          {/* ── MY CONNECTIONS ── */}
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden border-[#d4ff3f]/25">
            {/* Source channel */}
            <div className="border-b border-[#1e2230] px-6 py-6">
              <h2 className="flex items-center gap-2.5 text-[15px] font-bold tracking-[0.08em]">
                <Link2 size={14} className="text-[#d4ff3f]" /> SOURCE CHANNEL — WHERE CLIPS COME FROM
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Source channel handle"
                  value={pv("sourceChannelHandle")}
                  onChange={spv("sourceChannelHandle")}
                  placeholder={cfg.sourceChannelHandle || "@NotYourType"}
                  set={!!setFlags.sourceChannelHandle}
                  help="Any channel — e.g. @NotYourType, @MrBeast. The pipeline picks its oldest-unused video each run."
                />
                <Field
                  label="AI key override (optional)"
                  secret
                  value={pv("openaiApiKey")}
                  onChange={spv("openaiApiKey")}
                  placeholder={setFlags.openaiApiKey ? cfg.openaiApiKey : "sk-… (falls back to factory key)"}
                  set={!!setFlags.openaiApiKey}
                  help="Personal OpenAI key for your titles/captions"
                />
              </div>
            </div>

            {/* Telegram */}
            <div id="telegram" className="scroll-mt-24 border-b border-[#1e2230] px-6 py-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2.5 text-[15px] font-bold tracking-[0.08em]">
                  <Send size={14} className="text-[#d4ff3f]" /> TELEGRAM — WHERE REPORTS GO
                </h2>
                <button onClick={() => test("telegram")} className="mono flex items-center gap-2 rounded-lg border border-[#2a3044] px-3.5 py-2 text-[11px] font-bold tracking-[0.14em] text-[#aab1c5] hover:border-[#d4ff3f] hover:text-[#d4ff3f]">
                  <FlaskConical size={13} /> SEND TEST MESSAGE
                </button>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Your Telegram chat ID"
                  value={pv("telegramChatId")}
                  onChange={spv("telegramChatId")}
                  placeholder={setFlags.telegramChatId ? cfg.telegramChatId : "e.g. 512345678 — ask @userinfobot"}
                  set={!!setFlags.telegramChatId}
                  help="1) Message the factory bot once  2) Get your ID from @userinfobot  3) Paste here"
                />
                <Field
                  label="Personal bot token (optional)"
                  secret
                  value={pv("telegramBotToken")}
                  onChange={spv("telegramBotToken")}
                  placeholder={setFlags.telegramBotToken ? cfg.telegramBotToken : "Uses the shared factory bot if empty"}
                  set={!!setFlags.telegramBotToken}
                  help="From @BotFather — only if you want your own bot"
                />
              </div>
              {testResults.telegram === "loading" && <LoadingLine />}
              {testResults.telegram && testResults.telegram !== "loading" && <TestLine result={testResults.telegram} />}
            </div>

            {/* YouTube destination — real per-user Google OAuth */}
            <YoutubeConnectCard
              profile={profile}
              isAdmin={me?.user?.role === "admin"}
              onRefresh={refreshProfile}
            />

            {/* Cadence */}
            <div className="px-6 py-6">
              <h2 className="flex items-center gap-2.5 text-[15px] font-bold tracking-[0.08em]">
                <CalendarClock size={14} className="text-[#d4ff3f]" /> DAILY CADENCE
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Field label="Shorts per run" value={pv("shortsPerRun")} onChange={spv("shortsPerRun")} placeholder={String(cfg.shortsPerRun ?? 10)} />
                <Field label="First slot hour (0-23)" value={pv("startHour")} onChange={spv("startHour")} placeholder={String(cfg.startHour ?? 9)} />
                <Field label="Minutes between slots" value={pv("intervalMin")} onChange={spv("intervalMin")} placeholder={String(cfg.intervalMin ?? 90)} />
              </div>
            </div>

            <div className="border-t border-[#1e2230] px-6 py-4">
              <button onClick={saveProfile} disabled={saving === "profile"} className="glow-volt flex items-center gap-2.5 rounded-xl bg-[#d4ff3f] px-6 py-3.5 text-[14px] font-bold text-black transition-transform hover:translate-y-[-1px]">
                {saving === "profile" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                SAVE MY CONNECTIONS
              </button>
              {savedMsg && <span className="mono ml-4 text-[11px] font-bold tracking-[0.16em] text-emerald-400">{savedMsg}</span>}
            </div>
          </motion.section>

          {me?.user?.role === "admin" && (
            <>
          {/* ── SYSTEM / SHARED ── */}
          <div className="mono flex items-center gap-3 pt-4 text-[11px] tracking-[0.3em] text-[#576080]">
            <span className="h-px flex-1 bg-[#1e2230]" />
            FACTORY SYSTEM — SHARED TEAM KEYS (.ENV ⇄ DRIVE)
            <span className="h-px flex-1 bg-[#1e2230]" />
          </div>

          {Object.entries(groupBy(data?.keys ?? [])).map(([group, keys], gi) => {
            const meta = GROUP_META[group] ?? { title: group.toUpperCase(), integration: null, blurb: "" };
            return (
              <motion.section key={group} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.05 }} className="card overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1e2230] px-6 py-4">
                  <div>
                    <h2 className="flex items-center gap-2.5 text-[15px] font-bold tracking-[0.08em]">
                      <KeyRound size={14} className="text-[#d4ff3f]" /> {meta.title}
                    </h2>
                    <p className="mt-1 text-[12.5px] text-[#6d7690]">{meta.blurb}</p>
                  </div>
                  {meta.integration && (
                    <button onClick={() => test(meta.integration!)} className="mono flex items-center gap-2 rounded-lg border border-[#2a3044] px-3.5 py-2 text-[11px] font-bold tracking-[0.14em] text-[#aab1c5] transition-colors hover:border-[#d4ff3f] hover:text-[#d4ff3f]">
                      <FlaskConical size={13} /> TEST CONNECTION
                    </button>
                  )}
                </div>
                <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
                  {keys.map((k) => (
                    <Field
                      key={k.key}
                      label={k.label}
                      secret={k.secret}
                      set={k.set}
                      placeholder={k.set ? k.masked || "stored" : k.placeholder ?? k.key}
                      help={k.help}
                      value={values[k.key] ?? ""}
                      onChange={(v) => setValues((s) => ({ ...s, [k.key]: v }))}
                    />
                  ))}
                </div>
                {meta.integration && testResults[meta.integration] === "loading" && <LoadingLine />}
                {meta.integration && testResults[meta.integration] && testResults[meta.integration] !== "loading" && (
                  <TestLine result={testResults[meta.integration] as any} />
                )}
              </motion.section>
            );
          })}

          {/* Actions row */}
          <div className="sticky bottom-5 z-40 flex flex-wrap items-center gap-3 rounded-2xl border border-[#232839] bg-[#0c0e13]/90 p-4 backdrop-blur-md">
            <button onClick={saveSystem} disabled={saving === "system"} className="flex items-center gap-2.5 rounded-xl border border-[#d4ff3f]/60 px-5 py-3.5 text-[13px] font-bold text-[#d4ff3f] transition-colors hover:bg-[#d4ff3f] hover:text-black">
              {saving === "system" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              SAVE SYSTEM KEYS TO .ENV
            </button>
            <button onClick={() => sync("push")} disabled={!!syncing} className="flex items-center gap-2.5 rounded-xl border border-[#2a3044] px-5 py-3.5 text-[13px] font-bold text-[#c4cadb] transition-colors hover:border-[#d4ff3f] hover:text-[#d4ff3f]">
              {syncing === "push" ? <Loader2 size={15} className="animate-spin" /> : <CloudUpload size={15} />}
              PUSH .ENV + MEMORY → DRIVE
            </button>
            <button onClick={() => sync("pull")} disabled={!!syncing} className="flex items-center gap-2.5 rounded-xl border border-[#2a3044] px-5 py-3.5 text-[13px] font-bold text-[#c4cadb] transition-colors hover:border-[#d4ff3f] hover:text-[#d4ff3f]">
              {syncing === "pull" ? <Loader2 size={15} className="animate-spin" /> : <CloudDownload size={15} />}
              PULL FROM DRIVE (COLLAB ONBOARD)
            </button>
            {savedMsg && <span className="mono text-[11px] font-bold tracking-[0.16em] text-emerald-400">{savedMsg}</span>}
          </div>

          {syncResult && (
            <div className={`card border-l-4 px-6 py-4 ${syncResult.error ? "border-l-[#ff4d4d]" : "border-l-[#d4ff3f]"}`}>
              <p className="mono text-[11px] tracking-[0.18em] text-[#8b93a7]">
                DRIVE {syncResult.direction?.toUpperCase()} — {syncResult.mode?.toUpperCase()} {syncResult.error ? `— ERROR: ${syncResult.error}` : ""}
              </p>
              <ul className="mt-2 space-y-1">
                {syncResult.files?.map((f: any) => (
                  <li key={f.name} className="mono text-[12px] text-[#c4cadb]">
                    <span className="text-[#d4ff3f]">{f.name}</span> — {f.action}{f.id ? ` (id ${f.id})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
            </>
          )}

          {/* Collab explainer */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="card px-6 py-6">
              <h3 className="flex items-center gap-2.5 text-[15px] font-bold tracking-[0.08em]">
                <Users size={15} className="text-[#d4ff3f]" /> MULTI-USER WORKFLOW
              </h3>
              <ol className="mt-4 space-y-3 text-[13px] leading-relaxed text-[#9aa2b8]">
                <li><span className="mono mr-2 text-[#d4ff3f]">01</span>Each teammate registers an account — everyone gets a private pipeline.</li>
                <li><span className="mono mr-2 text-[#d4ff3f]">02</span>They set their own source channel, Telegram chat ID and upload channel above.</li>
                <li><span className="mono mr-2 text-[#d4ff3f]">03</span>Shared keys (Data API, factory bot, Drive vault) are configured once in the system section by the first admin.</li>
                <li><span className="mono mr-2 text-[#d4ff3f]">04</span>Each user's memory.md tracks only their history — two people can clip the same channel without clashes.</li>
              </ol>
            </div>
            <div className="card px-6 py-6">
              <h3 className="flex items-center gap-2.5 text-[15px] font-bold tracking-[0.08em]">
                <Sparkles size={15} className="text-[#d4ff3f]" /> AUTOMATE YOUR DAILY RUN
              </h3>
              <p className="mt-4 text-[13px] leading-relaxed text-[#9aa2b8]">
                One run = one full day of shorts. Trigger it daily (cron must include your session cookie, or run from the dashboard):
              </p>
              <pre className="mono mt-3 overflow-auto rounded-lg border border-[#232839] bg-[#0b0d13] px-4 py-3 text-[11.5px] leading-relaxed text-[#c4cadb]">
{`30 7 * * * curl -X POST \\
  -H "Cookie: sf_session=<your-cookie>" \\
  https://<your-app>/api/pipeline/run`}
              </pre>
              <p className="mt-3 text-[13px] leading-relaxed text-[#9aa2b8]">
                Per run: picks your next unused source video, captions + titles + thumbnails for 10 clips, locks your daily slots,
                reports to your Telegram with attachments, then locks the video in your memory.md.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function groupBy(keys: KeyDef[]): Record<string, KeyDef[]> {
  const out: Record<string, KeyDef[]> = {};
  for (const k of keys) (out[k.group] ??= []).push(k);
  return out;
}

function LoadingLine() {
  return (
    <div className="mx-6 mb-4 mt-4 flex items-center gap-2 rounded-lg border border-[#2a3044] px-4 py-2.5">
      <Loader2 size={13} className="animate-spin text-[#d4ff3f]" />
      <span className="mono text-[11px] text-[#8b93a7]">testing…</span>
    </div>
  );
}

function TestLine({ result, label }: { result: { ok: boolean; detail: string }; label?: string }) {
  return (
    <div className={`mx-6 mb-4 mt-4 flex items-start gap-2.5 rounded-lg border px-4 py-2.5 ${result.ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-[#2a3044] bg-[#10131c]"}`}>
      {result.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-400" /> : <XCircle size={14} className="mt-0.5 shrink-0 text-[#ff8f8f]" />}
      <span className="mono text-[11px] leading-relaxed text-[#c4cadb]">
        {label && <span className="mr-2 text-[#d4ff3f]">{label}:</span>}
        {result.detail}
      </span>
    </div>
  );
}
