"use client";

import { motion } from "framer-motion";
import { Video, Sparkles, Send, ScanSearch, Timer, GitBranch } from "lucide-react";
import { LiveBadge } from "./ui";

const ICONS: Record<string, any> = {
  youtube_scan: ScanSearch,
  youtube_upload: Video,
  openai: Sparkles,
  telegram: Send,
  github: GitBranch,
  cron: Timer,
};

export default function IntegrationStrip({ integrations }: { integrations: any[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {(integrations ?? []).map((it, i) => {
        const Icon = ICONS[it.id] ?? ScanSearch;
        return (
          <motion.div
            key={it.id}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.04 }}
            className={`card px-4 py-4 ${it.live ? "border-[#d4ff3f]/30" : ""}`}
          >
            <div className="flex items-center justify-between">
              <Icon size={17} className={it.live ? "text-[#d4ff3f]" : "text-[#576080]"} />
              <LiveBadge live={it.live} />
            </div>
            <p className="mt-3 text-[13.5px] font-bold">{it.label}</p>
            <p className="mono mt-1 text-[10px] leading-relaxed text-[#6d7690]">{it.detail}</p>
          </motion.div>
        );
      })}
    </div>
  );
}
