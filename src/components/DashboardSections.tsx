"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Clapperboard, Database, History, Layers, Lock, LockOpen, RefreshCw } from "lucide-react";
import { StatusChip, fmtClock } from "./ui";

export function StatsBar({ stats }: { stats: any }) {
  const items = [
    { icon: History, label: "TOTAL RUNS", value: stats?.totalRuns ?? 0 },
    { icon: Clapperboard, label: "SHORTS SCHEDULED", value: stats?.clipsScheduled ?? 0 },
    { icon: Lock, label: "SOURCES USED", value: stats?.videosUsed ?? 0 },
    { icon: Database, label: "MEMORY LOGS", value: stats?.memoryRuns ?? 0 },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ icon: Icon, label, value }, i) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.06 }}
          className="card px-5 py-5"
        >
          <Icon size={16} className="text-[#d4ff3f]" />
          <div className="mt-3 text-4xl font-bold tracking-tight">{value}</div>
          <div className="mono mt-1 text-[10px] tracking-[0.24em] text-[#6d7690]">{label}</div>
        </motion.div>
      ))}
    </div>
  );
}

export function RecentRuns({ runs }: { runs: any[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-[#1e2230] px-6 py-4">
        <span className="text-[15px] font-bold tracking-wide">RUN HISTORY</span>
      </div>
      {runs.length === 0 && <p className="mono px-6 py-8 text-[12px] text-[#576080]">NO RUNS YET — THE FACTORY IS IDLE.</p>}
      <div className="divide-y divide-[#131722]">
        {runs.map((r) => (
          <a key={r.id} href={`/runs/${r.id}`} className="flex flex-wrap items-center gap-x-5 gap-y-1 px-6 py-3.5 transition-colors hover:bg-[#12151f]">
            <span className="mono text-[12px] font-bold text-[#d4ff3f]">#{r.id}</span>
            <StatusChip status={r.status} />
            <span className="min-w-0 flex-1 truncate text-[13px] text-[#c4cadb]">{r.sourceVideoTitle || "—"}</span>
            <span className="mono text-[11px] text-[#6d7690]">{r.shortsScheduled}/{r.shortsPlanned} shorts</span>
            <span className="mono text-[11px] text-[#576080]">{new Date(r.startedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            <span className="mono text-[10px] uppercase tracking-[0.14em] text-[#576080]">{r.mode}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export function LibraryTable({ videos, usedIds }: { videos: any[]; usedIds: string[] }) {
  const usedSet = new Set([...usedIds, ...videos.filter((v) => v.status === "used").map((v) => v.videoId)]);
  const fresh = videos.filter((v) => !usedSet.has(v.videoId)).length;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#1e2230] px-6 py-4">
        <span className="text-[15px] font-bold tracking-wide">SOURCE LIBRARY</span>
        <span className="mono flex items-center gap-2 text-[11px] text-[#8b93a7]">
          <Layers size={13} className="text-[#d4ff3f]" /> {fresh} FRESH / {videos.length} TOTAL
        </span>
      </div>
      <div className="divide-y divide-[#131722]">
        {videos.map((v) => {
          const used = usedSet.has(v.videoId);
          return (
            <div key={v.id} className={`flex items-center gap-4 px-6 py-3 ${used ? "opacity-45" : ""}`}>
              {used ? <Lock size={15} className="shrink-0 text-[#ff8f8f]" /> : <LockOpen size={15} className="shrink-0 text-emerald-400" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-[#e8eaf0]">{v.title}</p>
                <p className="mono mt-0.5 text-[10.5px] text-[#576080]">{v.videoId} • {fmtClock(v.durationSec)}</p>
              </div>
              <StatusChip status={used ? "used" : "new"} />
            </div>
          );
        })}
        {videos.length === 0 && <p className="mono px-6 py-8 text-[12px] text-[#576080]">LIBRARY EMPTY — FIRST RUN WILL SCAN THE CHANNEL.</p>}
      </div>
    </div>
  );
}

export function MemoryPanel({ memory }: { memory: any }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between border-b border-[#1e2230] px-6 py-4 text-left">
        <span className="flex items-center gap-2.5 text-[15px] font-bold tracking-wide">
          <Database size={15} className="text-[#d4ff3f]" /> MEMORY.MD — NEVER REPEAT A SOURCE
        </span>
        <span className="mono flex items-center gap-2 text-[11px] text-[#8b93a7]">
          {memory?.usedVideoIds?.length ?? 0} LOCKED <RefreshCw size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open ? (
        <pre className="md-view mono max-h-[380px] overflow-auto bg-[#0b0d12] px-6 py-5 text-[11.5px] leading-relaxed text-[#9aa2b8]">
          {memory?.content ?? "loading…"}
        </pre>
      ) : (
        <div className="flex flex-wrap gap-2 px-6 py-4">
          {(memory?.usedVideoIds ?? []).map((id: string) => (
            <span key={id} className="mono rounded-md border border-[#2a3044] bg-[#10131c] px-2.5 py-1 text-[10.5px] text-[#8b93a7]">{id}</span>
          ))}
          {(memory?.usedVideoIds ?? []).length === 0 && <span className="mono text-[11px] text-[#576080]">NOTHING LOCKED YET — CLICK TO VIEW FILE</span>}
        </div>
      )}
    </div>
  );
}
