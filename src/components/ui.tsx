"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, MinusCircle, XCircle, Zap, Radio } from "lucide-react";

export function usePoll<T = any>(url: string | null, intervalMs = 4000): { data: T | null; error: string | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    let timer: any;
    const load = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!alive) return;
        if (res.ok) {
          setData(await res.json());
          setError(null);
        } else setError(`HTTP ${res.status}`);
      } catch (e: any) {
        if (alive) setError(e.message ?? "fetch failed");
      }
      timer = setTimeout(load, intervalMs);
    };
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [url, intervalMs, tick]);
  return { data, error, refresh: () => setTick((t) => t + 1) };
}

export function LiveBadge({ live }: { live: boolean }) {
  return live ? (
    <span className="mono inline-flex items-center gap-1.5 rounded-full border border-[#d4ff3f]/50 bg-[#d4ff3f]/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.18em] text-[#d4ff3f]">
      <Radio size={11} /> LIVE
    </span>
  ) : (
    <span className="mono inline-flex items-center gap-1.5 rounded-full border border-[#39405a] bg-[#171b27] px-2.5 py-1 text-[10px] font-bold tracking-[0.18em] text-[#8b93a7]">
      <Zap size={11} /> SIM
    </span>
  );
}

export function StepIcon({ status }: { status: string }) {
  if (status === "done") return <CheckCircle2 size={17} className="text-[#d4ff3f]" />;
  if (status === "running") return <Loader2 size={17} className="animate-spin text-[#d4ff3f]" />;
  if (status === "error") return <XCircle size={17} className="text-[#ff4d4d]" />;
  return <MinusCircle size={17} className="text-[#3a4159]" />;
}

export function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "border-[#d4ff3f]/60 text-[#d4ff3f]",
    success: "border-emerald-400/50 text-emerald-300",
    failed: "border-[#ff4d4d]/60 text-[#ff4d4d]",
    scheduled: "border-[#4db8ff]/60 text-[#4db8ff]",
    used: "border-[#ff4d4d]/50 text-[#ff8f8f]",
    new: "border-emerald-400/40 text-emerald-300",
  };
  return (
    <span className={`mono rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] ${map[status] ?? "border-[#39405a] text-[#8b93a7]"}`}>
      {status}
    </span>
  );
}

export function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtSlot(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
