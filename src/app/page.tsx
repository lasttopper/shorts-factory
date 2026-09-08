"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import RunConsole from "@/components/RunConsole";
import IntegrationStrip from "@/components/IntegrationStrip";
import AuthScreen from "@/components/AuthScreen";
import { LibraryTable, MemoryPanel, RecentRuns, StatsBar } from "@/components/DashboardSections";
import { usePoll } from "@/components/ui";
import { ArrowRight, Send, Video } from "lucide-react";

export default function Dashboard() {
  const { data: status, error: statusError, refresh: refreshStatus } = usePoll<any>("/api/status", 5000);
  const user = status?.user;
  const authed = !!user;

  // Poll faster (2000ms) during active runs so the 10 steps update smoothly
  const { data: runsData, refresh: refreshRuns } = usePoll<any>(authed ? "/api/runs" : null, 2500);
  const { data: library, refresh: refreshLibrary } = usePoll<any>(authed ? "/api/library" : null, 6000);
  const [memory, setMemory] = useState<any>(null);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [booting, setBooting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  const runs: any[] = runsData?.runs ?? [];
  const runningRun = runs.find((r) => r.status === "running");
  const shownRunId = activeRunId ?? runningRun?.id ?? runs[0]?.id ?? null;

  const loadMemory = async () => {
    if (!authed) return;
    try {
      const res = await fetch("/api/memory", { cache: "no-store" });
      if (res.ok) setMemory(await res.json());
    } catch {}
  };

  useEffect(() => {
    loadMemory();
    const t = setInterval(loadMemory, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  useEffect(() => {
    if (!runningRun) {
      refreshStatus();
      refreshRuns();
      refreshLibrary();
      loadMemory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningRun?.id]);

  const startRun = async () => {
    if (booting || runningRun) return;
    setBooting(true);
    setRunError(null);

    // Scroll directly to the run console so user immediately sees activity
    setTimeout(() => {
      consoleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);

    try {
      const res = await fetch("/api/pipeline/run", { method: "POST" });
      const data = await res.json().catch(() => ({ ok: false, error: `Server error (HTTP ${res.status})` }));
      if (data.ok && data.runId) {
        setActiveRunId(data.runId);
        refreshRuns();
      } else {
        setRunError(data.error || "Failed to start pipeline run.");
      }
    } catch (err: any) {
      setRunError(err?.message || "Network error. Please try again.");
    } finally {
      setBooting(false);
    }
  };

  if (status === null) {
    if (statusError) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-5">
          <p className="mono text-[12px] tracking-[0.3em] text-[#ff8f8f]">STATUS SERVICE UNAVAILABLE</p>
          <div className="card max-w-lg px-6 py-5 text-center">
            <p className="text-[14px] font-semibold text-[#e8eaf0]">The dashboard can&apos;t reach the application status service.</p>
            <p className="mono mt-2 break-words text-[11px] leading-relaxed text-[#8b93a7]">
              {statusError} — if you just deployed, open <a className="text-[#d4ff3f] underline underline-offset-2" href="/api/health" target="_blank">/api/health</a> for the database diagnosis
              (usually DATABASE_URL or AUTH_SECRET is missing or mistyped in the host&apos;s environment variables).
            </p>
            <button
              type="button"
              onClick={() => { refreshStatus(); }}
              className="glow-volt mt-4 rounded-xl bg-[#d4ff3f] px-6 py-3 text-[13px] font-bold text-black"
            >
              RETRY NOW
            </button>
          </div>
        </main>
      );
    }
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="mono animate-pulse text-[12px] tracking-[0.3em] text-[#576080]">BOOTING FACTORY…</p>
      </main>
    );
  }

  if (!authed) {
    return <AuthScreen onAuth={refreshStatus} />;
  }

  const nextWindow = status?.config?.nextWindow
    ? new Date(status.config.nextWindow).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "…";

  const needsOnboarding =
    !status.config?.telegramConnected ||
    !status.config?.youtubeConnected ||
    !status.config?.sourceRightsConfirmed;

  return (
    <main className="min-h-screen">
      <Nav user={user} />
      <Hero
        onRun={startRun}
        running={!!runningRun}
        booting={booting}
        error={runError}
        nextWindow={nextWindow}
        channel={status?.config?.sourceChannel ?? "@NotYourType"}
      />

      <div className="mx-auto flex max-w-7xl flex-col gap-12 px-5 py-14">
        {needsOnboarding && (
          <section className="card glow-volt flex flex-wrap items-center justify-between gap-5 border-[#d4ff3f]/30 px-6 py-5">
            <div>
              <p className="text-[15px] font-bold">Welcome, {user.name.split(" ")[0]} — finish zero-touch automation setup</p>
              <p className="mono mt-1 text-[11px] tracking-[0.06em] text-[#8b93a7]">
                {!status.config?.youtubeConnected && "CONNECT YOUTUBE  •  "}
                {!status.config?.telegramConnected && "CONNECT TELEGRAM  •  "}
                {!status.config?.sourceRightsConfirmed && "CONFIRM SOURCE RIGHTS"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {!status.config?.youtubeConnected && (
                <a
                  href={status.config?.youtubeOAuthReady ? "/api/oauth/youtube/start" : "/settings?youtube=admin_setup_required"}
                  className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-[13px] font-bold text-black transition-transform hover:-translate-y-0.5"
                >
                  <span className="text-[#ff0000]">▶</span>
                  CONNECT WITH YOUTUBE
                </a>
              )}
              {!status.config?.telegramConnected && (
                <Link href="/settings#telegram" className="flex items-center gap-2 rounded-xl border border-[#39405a] px-5 py-3 text-[13px] font-bold text-[#e8eaf0] hover:border-[#d4ff3f] hover:text-[#d4ff3f]">
                  <Send size={14} /> CONNECT TELEGRAM <ArrowRight size={14} />
                </Link>
              )}
              {!status.config?.sourceRightsConfirmed && (
                <Link href="/settings" className="flex items-center gap-2 rounded-xl border border-amber-400/40 px-5 py-3 text-[13px] font-bold text-amber-200 hover:bg-amber-400/10">
                  CONFIRM RIGHTS <ArrowRight size={14} />
                </Link>
              )}
            </div>
          </section>
        )}

        <section>
          <SectionHead index="01" title="MY INTEGRATION CIRCUIT" sub="LIVE = your real connections. SIM = simulation until you connect them on the Connections page." />
          <IntegrationStrip integrations={status?.integrations ?? []} />
        </section>

        <section>
          <SectionHead index="02" title="MY FACTORY FLOOR" sub="Your personal pipeline output — every user has their own runs, library and memory." />
          <StatsBar stats={status?.stats} />
        </section>

        <section ref={consoleRef} id="run-console" className="scroll-mt-28">
          <SectionHead index="03" title="LIVE RUN CONSOLE" sub="The 10-step pipeline executing in real time — watch each stage flip to done." />
          <RunConsole runId={shownRunId} />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div>
            <SectionHead index="04" title="MY RUNS" sub="" />
            <RecentRuns runs={runs.slice(0, 10)} />
          </div>
          <div>
            <SectionHead index="05" title="MY MEMORY" sub="" />
            <MemoryPanel memory={memory} />
          </div>
        </section>

        <section>
          <SectionHead index="06" title="MY SOURCE LIBRARY" sub="Videos pulled from YOUR source channel. Locked entries exist in your database memory and will never be picked again." />
          <LibraryTable videos={library?.videos ?? []} usedIds={library?.usedIds ?? []} />
        </section>

        <footer className="mono flex flex-wrap items-center justify-between gap-3 border-t border-[#1e2230] pt-8 pb-6 text-[10.5px] tracking-[0.22em] text-[#576080]">
          <span className="flex items-center gap-2"><Video size={12} className="text-[#d4ff3f]" /> {user.name.toUpperCase()}&apos;S PIPELINE</span>
          <span className="flex items-center gap-2"><Send size={12} className="text-[#d4ff3f]" /> {status.config?.telegramConnected ? "TELEGRAM CONNECTED" : "TELEGRAM NOT CONNECTED"}</span>
        </footer>
      </div>
    </main>
  );
}

function SectionHead({ index, title, sub }: { index: string; title: string; sub: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="flex items-baseline gap-3">
        <span className="mono text-[12px] font-bold text-[#d4ff3f]">{index}</span>
        <h2 className="text-xl font-bold tracking-[0.08em]">{title}</h2>
      </div>
      {sub && <p className="mono hidden max-w-md text-right text-[10.5px] leading-relaxed tracking-[0.08em] text-[#576080] md:block">{sub}</p>}
    </div>
  );
}
