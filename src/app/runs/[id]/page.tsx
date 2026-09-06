"use client";

import { use } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CalendarClock, Captions, FileText, Hash, Send, Type } from "lucide-react";
import { LiveBadge, StatusChip, StepIcon, fmtClock, fmtSlot, usePoll } from "@/components/ui";

export default function RunDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data } = usePoll<{ run: any; clips: any[]; error?: string }>(`/api/runs/${id}`, 2000);
  const run = data?.run;
  const clips = data?.clips ?? [];
  const steps: any[] = run?.steps ?? [];

  return (
    <main className="min-h-screen">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#1e2230] bg-[#0a0b0e]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2 text-[13px] font-semibold text-[#aab1c5] hover:text-white">
            <ArrowLeft size={16} /> Control Room
          </Link>
          <span className="mono text-[11px] tracking-[0.3em] text-[#8b93a7]">BATCH BOARD — RUN #{id}</span>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-5 pb-20 pt-24">
        {!run && data?.error && (
          <div className="flex flex-col items-center gap-4 py-24">
            <p className="mono text-[12px] tracking-[0.25em] text-[#576080]">
              {data.error === "unauthorized" ? "LOG IN TO VIEW YOUR RUNS" : "RUN NOT FOUND (IT MAY BELONG TO ANOTHER USER)"}
            </p>
            <Link href="/" className="rounded-xl bg-[#d4ff3f] px-6 py-3 text-[13px] font-bold text-black">GO TO CONTROL ROOM</Link>
          </div>
        )}
        {!run && !data?.error && <p className="mono py-24 text-center text-[12px] tracking-[0.25em] text-[#576080]">LOADING RUN…</p>}

        {run && (
          <>
            <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">RUN #{run.id}</h1>
                <StatusChip status={run.status} />
                {run.mode && <span className="mono rounded-full border border-[#2a3044] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[#8b93a7]">{run.mode} mode</span>}
              </div>
              <p className="mt-3 max-w-2xl text-[15px] text-[#9aa2b8]">
                Source: <span className="font-semibold text-[#e8eaf0]">{run.sourceVideoTitle || "selecting…"}</span>
                {run.sourceVideoId && <span className="mono ml-2 text-[11px] text-[#576080]">youtube.com/watch?v={run.sourceVideoId}</span>}
              </p>
              <div className="mono mt-5 flex flex-wrap gap-x-8 gap-y-2 text-[11px] tracking-[0.14em] text-[#8b93a7]">
                <span className="flex items-center gap-2"><CalendarClock size={13} className="text-[#d4ff3f]" /> {run.shortsScheduled}/{run.shortsPlanned} SHORTS SCHEDULED</span>
                <span className="flex items-center gap-2"><Send size={13} className="text-[#d4ff3f]" /> TELEGRAM: {(run.telegramStatus || "pending").toUpperCase()}</span>
                {run.reportPath && (
                  <a href={`/api${run.reportPath}`} target="_blank" className="flex items-center gap-2 text-[#d4ff3f] underline-offset-4 hover:underline">
                    <FileText size={13} /> DOWNLOAD FULL REPORT.MD
                  </a>
                )}
              </div>
            </motion.header>

            {/* Pipeline steps compact */}
            <div className="card mb-10 grid grid-cols-2 gap-px overflow-hidden bg-[#161a26] sm:grid-cols-5 lg:grid-cols-10">
              {steps.map((s) => (
                <div key={s.key} className="flex flex-col gap-2 bg-[#0d0f15] px-3 py-3.5" title={s.detail}>
                  <StepIcon status={s.status} />
                  <span className="mono text-[9.5px] font-bold leading-tight tracking-[0.08em] text-[#aab1c5]">{s.label.toUpperCase()}</span>
                  {s.mode && <LiveBadge live={s.mode === "live"} />}
                </div>
              ))}
            </div>

            {run.error && (
              <div className="mb-8 rounded-xl border border-[#ff4d4d]/50 bg-[#ff4d4d]/10 px-5 py-4">
                <p className="mono text-[12px] text-[#ff9d9d]">{run.error}</p>
              </div>
            )}

            {/* Schedule timeline strip */}
            {clips.some((c) => c.publishAt) && (
              <div className="card mb-10 overflow-x-auto px-6 py-5">
                <p className="mono mb-4 text-[10px] tracking-[0.26em] text-[#6d7690]">PUBLISH TIMELINE — 10 SLOTS LOCKED IN ONE RUN</p>
                <div className="flex min-w-max items-center gap-0">
                  {clips.map((c, i) => (
                    <div key={c.id} className="flex items-center">
                      <div className="flex flex-col items-center">
                        <span className="glow-volt flex h-9 w-9 items-center justify-center rounded-full bg-[#d4ff3f] text-[12px] font-bold text-black">{c.idx}</span>
                        <span className="mono mt-2 text-[9.5px] text-[#8b93a7]">{fmtSlot(c.publishAt)}</span>
                      </div>
                      {i < clips.length - 1 && <div className="mx-2 mb-5 h-px w-10 bg-gradient-to-r from-[#d4ff3f]/60 to-[#2a3044]" />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Clip cards */}
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence>
                {clips.map((c, i) => (
                  <motion.article
                    key={c.id}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="card group overflow-hidden"
                  >
                    <div className="relative aspect-video overflow-hidden bg-[#0b0d12]">
                      {c.thumbnailPath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api${c.thumbnailPath}`} alt={c.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                      ) : (
                        <div className="mono flex h-full items-center justify-center text-[11px] tracking-[0.2em] text-[#3a4159]">THUMBNAIL PENDING…</div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 border-t-2 border-[#d4ff3f] bg-black/60 px-3 py-2 backdrop-blur-sm">
                        <p className="text-center text-[12px] font-bold tracking-wide text-[#d4ff3f]">&quot;{(c.hook || "…").toUpperCase()}&quot;</p>
                      </div>
                      <span className="mono absolute left-3 top-3 rounded-md bg-black/70 px-2 py-1 text-[10px] font-bold text-white">
                        {fmtClock(c.startSec)} – {fmtClock(c.endSec)}
                      </span>
                    </div>
                    <div className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-[15px] font-bold leading-snug">{c.title || `Clip ${c.idx} — writing title…`}</h3>
                        <span className="mono shrink-0 text-[11px] font-bold text-[#576080]">#{String(c.idx).padStart(2, "0")}</span>
                      </div>
                      {c.description && <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-[#8b93a7]">{c.description}</p>}
                      <div className="mono mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] tracking-[0.1em] text-[#6d7690]">
                        {c.hashtags && (
                          <span className="flex items-center gap-1"><Hash size={11} className="text-[#d4ff3f]" />{c.hashtags.split(" ").slice(0, 3).join(" ")}</span>
                        )}
                        <span className="flex items-center gap-1"><Captions size={11} className="text-[#d4ff3f]" />{(c.captions ?? []).length} CAPTION LINES · BOTTOM</span>
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-[#1a1f2d] pt-3">
                        <span className="mono flex items-center gap-1.5 text-[10.5px] text-[#aab1c5]">
                          <CalendarClock size={12} className="text-[#d4ff3f]" />
                          {c.publishAt ? fmtSlot(c.publishAt) : "unscheduled"}
                        </span>
                        <StatusChip status={c.publishAt ? "scheduled" : c.status} />
                      </div>
                      {c.assPath && (
                        <div className="mt-2 flex items-center justify-between">
                          <a href={`/api${c.assPath}`} target="_blank" className="mono flex items-center gap-1 text-[10px] text-[#576080] hover:text-[#d4ff3f]">
                            <Type size={11} /> captions.ass
                          </a>
                          {c.youtubeVideoId && <span className="mono text-[10px] text-[#576080]">yt:{c.youtubeVideoId}</span>}
                        </div>
                      )}
                    </div>
                  </motion.article>
                ))}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
