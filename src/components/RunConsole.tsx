"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, ArrowUpRight, FileText } from "lucide-react";
import { LiveBadge, StatusChip, StepIcon, usePoll } from "./ui";

export default function RunConsole({ runId }: { runId: number | null }) {
  const { data } = usePoll<{ run: any; clips: any[] }>(runId ? `/api/runs/${runId}` : null, 1800);
  const run = data?.run;
  const steps: any[] = run?.steps ?? [];

  if (!runId) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
        <Activity size={26} className="text-[#3a4159]" />
        <p className="mono text-[12px] tracking-[0.2em] text-[#6d7690]">NO RUN SELECTED — HIT RUN TODAY&apos;S BATCH ABOVE</p>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="card p-12 text-center">
        <p className="mono animate-pulse text-[12px] tracking-[0.2em] text-[#8b93a7]">CONNECTING TO RUN #{runId}…</p>
      </div>
    );
  }

  const done = steps.filter((s) => s.status === "done").length;
  const pct = Math.round((done / Math.max(1, steps.length)) * 100);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1e2230] px-6 py-4">
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${run.status === "running" ? "blink bg-[#d4ff3f]" : run.status === "failed" ? "bg-[#ff4d4d]" : "bg-emerald-400"}`} />
          <span className="text-[15px] font-bold tracking-wide">
            RUN #{run.id} <span className="text-[#6d7690]">— {run.sourceVideoTitle || "starting…"}</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <StatusChip status={run.status} />
          {run.reportPath && (
            <a href={`/api${run.reportPath}`} target="_blank" className="mono flex items-center gap-1.5 rounded-lg border border-[#2a3044] px-3 py-1.5 text-[11px] text-[#aab1c5] hover:border-[#d4ff3f] hover:text-[#d4ff3f]">
              <FileText size={13} /> REPORT.MD
            </a>
          )}
          <Link href={`/runs/${run.id}`} className="mono flex items-center gap-1.5 rounded-lg bg-[#d4ff3f] px-3 py-1.5 text-[11px] font-bold text-black hover:opacity-90">
            OPEN BATCH <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>

      <div className="h-1 w-full bg-[#141824]">
        <motion.div className="h-full bg-[#d4ff3f]" animate={{ width: `${pct}%` }} transition={{ ease: "easeOut", duration: 0.5 }} />
      </div>

      <div className="grid gap-0 md:grid-cols-2">
        {steps.map((s, i) => (
          <AnimatePresence key={s.key}>
            <motion.div
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.035 }}
              className={`flex items-start gap-3.5 border-b border-r border-[#161a26] px-6 py-4 ${
                s.status === "running" ? "step-running bg-[#d4ff3f]/[0.045]" : s.status === "done" ? "bg-transparent" : "opacity-55"
              }`}
            >
              <div className="mt-0.5 shrink-0"><StepIcon status={s.status} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-semibold text-[#e8eaf0]">
                    <span className="mono mr-2 text-[10px] text-[#576080]">{String(i + 1).padStart(2, "0")}</span>
                    {s.label}
                  </span>
                  {s.mode && <LiveBadge live={s.mode === "live"} />}
                </div>
                {s.detail && <p className="mono mt-1 truncate text-[11px] text-[#7d869e]" title={s.detail}>{s.detail}</p>}
              </div>
            </motion.div>
          </AnimatePresence>
        ))}
      </div>

      {run.error && (
        <div className="border-t border-[#ff4d4d]/40 bg-[#ff4d4d]/10 px-6 py-3">
          <p className="mono text-[12px] text-[#ff9d9d]">ERROR: {run.error}</p>
        </div>
      )}
    </div>
  );
}
