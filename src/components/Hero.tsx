"use client";

import { motion } from "framer-motion";
import { ArrowRight, Play, Scissors, Captions, Type, Image, CalendarClock, Send, Database, HardDrive } from "lucide-react";

const CHAIN = [
  { icon: Play, label: "PICK UNUSED VIDEO" },
  { icon: Scissors, label: "CLIP 10 BEST PARTS" },
  { icon: Captions, label: "BOTTOM CAPTIONS" },
  { icon: Type, label: "TITLES + DESCRIPTIONS" },
  { icon: Image, label: "THUMBNAILS" },
  { icon: CalendarClock, label: "SCHEDULE 10 / DAY" },
  { icon: Send, label: "TELEGRAM REPORT" },
  { icon: Database, label: "MEMORY.MD LOGGED" },
];

export default function Hero({ onRun, running, nextWindow, channel }: { onRun: () => void; running: boolean; nextWindow: string; channel: string }) {
  return (
    <section className="relative overflow-hidden pt-28">
      <div className="pointer-events-none absolute -top-40 right-[-10%] h-[560px] w-[560px] rounded-full bg-[#d4ff3f]/10 blur-[140px]" />
      <div className="pointer-events-none absolute top-40 left-[-15%] h-[420px] w-[420px] rounded-full bg-[#4db8ff]/8 blur-[120px]" />

      <div className="bg-blueprint absolute inset-0 [mask-image:radial-gradient(70%_60%_at_50%_30%,black,transparent)]" />

      <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-10">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <div className="mono mb-6 inline-flex items-center gap-2 rounded-full border border-[#2a3044] bg-[#101218] px-4 py-2 text-[11px] tracking-[0.3em] text-[#8b93a7]">
            <span className="blink h-2 w-2 rounded-full bg-[#d4ff3f]" />
            SOURCE: {channel.toUpperCase()} — AUTO-DEDUPE VIA MEMORY.MD
          </div>
        </motion.div>

        <h1 className="max-w-5xl text-[13.5vw] font-bold leading-[0.88] tracking-tight sm:text-[76px] lg:text-[104px]">
          <motion.span className="block" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.05 }}>
            10 SHORTS.
          </motion.span>
          <motion.span className="text-outline-volt block" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.18 }}>
            ONE RUN.
          </motion.span>
          <motion.span className="text-outline block" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.3 }}>
            EVERY DAY.
          </motion.span>
        </h1>

        <motion.p
          className="mt-8 max-w-xl text-[15px] leading-relaxed text-[#9aa2b8]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45, duration: 0.7 }}
        >
          One click scans the channel for a video you&apos;ve never used, cuts the ten best moments, burns captions at the bottom,
          writes titles and descriptions, designs thumbnails, locks a full day of upload slots — then ships the whole batch report
          with attachments to Telegram.
        </motion.p>

        <motion.div className="mt-10 flex flex-wrap items-center gap-4" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
          <button
            onClick={onRun}
            disabled={running}
            className={`group flex items-center gap-3 rounded-xl px-7 py-4 text-[15px] font-bold tracking-wide transition-all ${
              running
                ? "cursor-wait bg-[#1c2130] text-[#8b93a7]"
                : "pulse-ring glow-volt bg-[#d4ff3f] text-black hover:translate-y-[-2px]"
            }`}
          >
            {running ? "PIPELINE RUNNING…" : "RUN TODAY'S BATCH"}
            <ArrowRight size={18} className={running ? "" : "transition-transform group-hover:translate-x-1"} />
          </button>
          <div className="mono text-[11px] tracking-[0.18em] text-[#8b93a7]">
            NEXT WINDOW<br />
            <span className="text-[13px] font-bold text-[#e8eaf0]">{nextWindow}</span>
          </div>
        </motion.div>
      </div>

      <div className="relative border-y border-[#1e2230] bg-[#0c0e13] py-3.5">
        <div className="marquee-track">
          {[0, 1].map((rep) => (
            <div key={rep} className="flex shrink-0 items-center">
              {CHAIN.map(({ icon: Icon, label }) => (
                <span key={`${rep}-${label}`} className="mono flex items-center gap-2.5 px-7 text-[11px] font-bold tracking-[0.24em] text-[#6d7690]">
                  <Icon size={14} className="text-[#d4ff3f]" />
                  {label}
                  <span className="ml-5 text-[#2a3044]">///</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
