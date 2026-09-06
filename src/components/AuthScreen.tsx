"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Clapperboard, Loader2, LogIn, Send, UserPlus, Video } from "lucide-react";

const YTIcon = Video;

export default function AuthScreen({ onAuth }: { onAuth: () => void }) {
  const [tab, setTab] = useState<"login" | "register">("register");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/auth/${tab}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Something went wrong");
        if (tab === "register" && res.status === 409) setTab("login");
      } else {
        onAuth();
      }
    } catch (e: any) {
      setError(e.message ?? "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5">
      <div className="bg-blueprint absolute inset-0 [mask-image:radial-gradient(70%_70%_at_50%_40%,black,transparent)]" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-[#d4ff3f]/10 blur-[140px]" />

      <div className="relative grid w-full max-w-5xl gap-10 lg:grid-cols-2 lg:gap-16">
        {/* Left: brand pitch */}
        <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} className="flex flex-col justify-center">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#d4ff3f] text-black">
              <Clapperboard size={22} strokeWidth={2.4} />
            </span>
            <span className="mono text-[11px] tracking-[0.3em] text-[#8b93a7]">SHORTS FACTORY</span>
          </div>
          <h1 className="text-5xl font-bold leading-[0.95] tracking-tight sm:text-6xl">
            YOUR TEAM&apos;S<br />
            <span className="text-outline-volt">SHORTS</span><br />
            <span className="text-outline">MACHINE.</span>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-[#9aa2b8]">
            Every account gets a private pipeline: pick any source channel (like Not Your Type), connect your own YouTube for
            uploads, and your own Telegram for daily reports. memory.md keeps your history — never the same video twice.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            {[
              { icon: YTIcon, text: "Connect YOUR channel — 10 shorts auto-scheduled daily" },
              { icon: Send, text: "Your Telegram chat ID — batch reports with attachments" },
              { icon: Video, text: "Any source channel — per-user memory.md dedupe" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#232839] bg-[#10131c] text-[#d4ff3f]">
                  <Icon size={14} />
                </span>
                <span className="text-[13px] text-[#aab1c5]">{text}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Right: auth card */}
        <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="card flex flex-col justify-center p-8 sm:p-10">
          <div className="mb-8 grid grid-cols-2 gap-1 rounded-xl border border-[#232839] bg-[#0b0d13] p-1">
            {(["register", "login"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(""); }}
                className={`rounded-lg px-4 py-2.5 text-[13px] font-bold tracking-wide transition-colors ${
                  tab === t ? "bg-[#d4ff3f] text-black" : "text-[#8b93a7] hover:text-white"
                }`}
              >
                {t === "register" ? "CREATE ACCOUNT" : "LOG IN"}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-4">
            {tab === "register" && (
              <label className="flex flex-col gap-1.5">
                <span className="mono text-[10.5px] tracking-[0.18em] text-[#8b93a7]">YOUR NAME / TEAM</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Rahul — Clips Team"
                  className="mono rounded-lg border border-[#232839] bg-[#0b0d13] px-4 py-3 text-[13px] text-[#e8eaf0] outline-none placeholder:text-[#454d63] focus:border-[#d4ff3f]"
                />
              </label>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="mono text-[10.5px] tracking-[0.18em] text-[#8b93a7]">EMAIL</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="you@team.com"
                className="mono rounded-lg border border-[#232839] bg-[#0b0d13] px-4 py-3 text-[13px] text-[#e8eaf0] outline-none placeholder:text-[#454d63] focus:border-[#d4ff3f]"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="mono text-[10.5px] tracking-[0.18em] text-[#8b93a7]">PASSWORD</span>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="4+ characters"
                className="mono rounded-lg border border-[#232839] bg-[#0b0d13] px-4 py-3 text-[13px] text-[#e8eaf0] outline-none placeholder:text-[#454d63] focus:border-[#d4ff3f]"
              />
            </label>

            {error && <p className="mono rounded-lg border border-[#ff4d4d]/40 bg-[#ff4d4d]/10 px-4 py-2.5 text-[11.5px] text-[#ff9d9d]">{error}</p>}

            <button
              onClick={submit}
              disabled={busy}
              className="glow-volt mt-2 flex items-center justify-center gap-2.5 rounded-xl bg-[#d4ff3f] px-6 py-4 text-[15px] font-bold text-black transition-transform hover:translate-y-[-1px] disabled:opacity-60"
            >
              {busy ? <Loader2 size={17} className="animate-spin" /> : tab === "register" ? <UserPlus size={17} /> : <LogIn size={17} />}
              {tab === "register" ? "CREATE MY PIPELINE" : "ENTER THE FACTORY"}
            </button>

            <p className="mono text-center text-[10px] leading-relaxed tracking-[0.08em] text-[#576080]">
              WORKS INSTANTLY IN SIMULATION — CONNECT YOUR CHANNEL + TELEGRAM LATER IN SETTINGS
            </p>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
