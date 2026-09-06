"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Video,
  XCircle,
} from "lucide-react";

export default function YoutubeConnectCard({
  profile,
  isAdmin,
  onRefresh,
}: {
  profile: any;
  isAdmin: boolean;
  onRefresh: () => void;
}) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const cfg = profile?.config ?? {};
  const oauth = profile?.youtubeOAuth ?? {};
  const connected = !!oauth.connected;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("youtube");
    const detail = params.get("detail");
    if (!status) return;
    if (status === "connected") {
      setMessage({ ok: true, text: `${detail || "YouTube channel"} connected successfully. Upload access is active.` });
      onRefresh();
    } else if (status === "admin_setup_required") {
      setMessage({ ok: false, text: "The administrator must configure the shared Google OAuth client first." });
    } else if (status === "denied") {
      setMessage({ ok: false, text: detail || "You cancelled YouTube access." });
    } else {
      setMessage({ ok: false, text: detail || "YouTube connection failed. Please try again." });
    }
    window.history.replaceState({}, "", window.location.pathname);
  }, [onRefresh]);

  const disconnect = async () => {
    if (!window.confirm(`Disconnect ${cfg.ytChannelTitle || "this YouTube channel"}? Automated uploads will stop.`)) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/oauth/youtube/disconnect", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setMessage({ ok: true, text: "YouTube disconnected. Google access was revoked." });
        onRefresh();
      } else {
        setMessage({ ok: false, text: data.error || "Could not disconnect YouTube." });
      }
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="border-b border-[#1e2230] px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2.5 text-[15px] font-bold tracking-[0.08em]">
            <Video size={15} className="text-[#d4ff3f]" /> YOUR YOUTUBE CHANNEL — WHERE SHORTS UPLOAD
          </h2>
          <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-[#6d7690]">
            Choose the Google account that owns your YouTube channel. We request only channel read access and permission to upload videos.
            Your Google password is never shared with this app.
          </p>
        </div>
        {connected && (
          <span className="mono inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-bold tracking-[0.16em] text-emerald-300">
            <CheckCircle2 size={12} /> CONNECTED
          </span>
        )}
      </div>

      {message && (
        <div className={`mt-4 flex items-start gap-2.5 rounded-xl border px-4 py-3 ${message.ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-[#ff4d4d]/40 bg-[#ff4d4d]/5"}`}>
          {message.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" /> : <XCircle size={15} className="mt-0.5 shrink-0 text-[#ff8f8f]" />}
          <p className="text-[12.5px] text-[#c4cadb]">{message.text}</p>
        </div>
      )}

      {connected ? (
        <div className="mt-5 rounded-2xl border border-[#2a3044] bg-[#0b0d13] p-5">
          <div className="flex flex-wrap items-center gap-4">
            {cfg.ytChannelThumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cfg.ytChannelThumbnail} alt="" className="h-14 w-14 rounded-full border border-[#39405a] object-cover" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ff3333] text-white"><Video size={22} /></span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[18px] font-bold text-white">{cfg.ytChannelTitle || "Connected YouTube channel"}</p>
              <p className="mono mt-1 text-[10.5px] tracking-[0.1em] text-[#6d7690]">
                {cfg.ytChannelHandle ? `${cfg.ytChannelHandle} • ` : ""}CHANNEL ID: {cfg.ytChannelId}
              </p>
              <p className="mono mt-1 flex items-center gap-1.5 text-[10px] text-emerald-400">
                <ShieldCheck size={11} /> UPLOAD + SCHEDULING AUTHORIZED
                {cfg.ytConnectedAt && ` • ${new Date(cfg.ytConnectedAt).toLocaleDateString()}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="/api/oauth/youtube/start"
                className="mono flex items-center gap-2 rounded-lg border border-[#39405a] px-3.5 py-2.5 text-[11px] font-bold tracking-[0.1em] text-[#c4cadb] hover:border-[#d4ff3f] hover:text-[#d4ff3f]"
              >
                <RefreshCw size={13} /> SWITCH / RECONNECT
              </a>
              <button
                onClick={disconnect}
                disabled={disconnecting}
                className="mono flex items-center gap-2 rounded-lg border border-[#ff4d4d]/30 px-3.5 py-2.5 text-[11px] font-bold tracking-[0.1em] text-[#ff8f8f] hover:bg-[#ff4d4d]/10"
              >
                {disconnecting ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
                DISCONNECT
              </button>
            </div>
          </div>
        </div>
      ) : oauth.ready ? (
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <a
            href="/api/oauth/youtube/start"
            className="group inline-flex items-center gap-3 rounded-xl bg-white px-6 py-3.5 text-[14px] font-bold text-[#171717] shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ff0000] text-[12px] font-black text-white">▶</span>
            CONNECT WITH YOUTUBE
            <ExternalLink size={15} className="text-[#666] transition-transform group-hover:translate-x-0.5" />
          </a>
          <p className="mono max-w-md text-[10.5px] leading-relaxed text-[#6d7690]">
            GOOGLE CONSENT → SELECT CHANNEL ACCOUNT → ALLOW → RETURN HERE AUTOMATICALLY
          </p>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-200">
            <Link2 size={14} /> Google OAuth is waiting for administrator setup
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-[#9aa2b8]">
            {isAdmin
              ? "Add APP_URL, YT_CLIENT_ID and YT_CLIENT_SECRET in the host environment. Then add the exact callback below to your Google Cloud Web OAuth client."
              : "Ask the factory administrator to configure the shared Google OAuth client. Once done, the Connect with YouTube button appears for every user."}
          </p>
          {isAdmin && oauth.redirectUri && (
            <div className="mono mt-3 rounded-lg border border-[#2a3044] bg-[#080a0f] px-3.5 py-2.5 text-[11px] text-[#d4ff3f]">
              AUTHORIZED REDIRECT URI: {oauth.redirectUri}
            </div>
          )}
        </div>
      )}

      <div className="mono mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[10px] tracking-[0.08em] text-[#576080]">
        <span>✓ ONE SHARED OAUTH APP</span>
        <span>✓ PRIVATE TOKEN PER USER</span>
        <span>✓ TOKEN ENCRYPTED IN POSTGRES</span>
        <span>✓ DISCONNECT ANY TIME</span>
      </div>
    </div>
  );
}
