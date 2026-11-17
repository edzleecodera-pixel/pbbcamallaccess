"use client";
import { useEffect, useState } from "react";
import { Eye, Heart, Maximize, Minimize, Scaling, Volume2, VolumeX } from "lucide-react";
import LiveClock from "./LiveClock";

type Props = {
  fitMode: "cover" | "contain";
  onToggleFit: () => void;
  unmutedCount: number;
  onToggleAllAudio: () => void;
  onOpenSupport: () => void;
};

const audience = () => {
  try {
    const h = parseInt(
      new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", hour12: false }).format(new Date()),
      10
    );
    if (h >= 19 && h <= 23) return Math.floor(540 + 240 * Math.random());
    if (h >= 12) return Math.floor(280 + 150 * Math.random());
    if (h >= 7) return Math.floor(140 + 100 * Math.random());
    return Math.floor(55 + 55 * Math.random());
  } catch {
    return 320;
  }
};

export default function Header({ fitMode, onToggleFit, unmutedCount, onToggleAllAudio, onOpenSupport }: Props) {
  const [viewers, setViewers] = useState(342);
  const [isFull, setIsFull] = useState(false);

  useEffect(() => {
    let v = 342;
    try {
      const saved = sessionStorage.getItem("pbb_sim_viewers");
      if (saved) v = parseInt(saved, 10);
      else { v = audience(); sessionStorage.setItem("pbb_sim_viewers", String(v)); }
    } catch { v = audience(); }
    setViewers(v);
    const t = setInterval(() => {
      setViewers((prev) => {
        const next = Math.max(30, prev + (Math.floor(7 * Math.random()) - 3));
        try { sessionStorage.setItem("pbb_sim_viewers", String(next)); } catch {}
        return next;
      });
    }, 9000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const sync = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFull = async () => {
    const el = document.documentElement;
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    else await el.requestFullscreen().catch(() => {});
  };

  return (
    <header className="w-full h-12 sm:h-14 bg-black border-b border-zinc-900 text-zinc-100 px-2 sm:px-4 md:px-5 flex items-center justify-between gap-1 sm:gap-3 select-none shrink-0 font-mono text-xs sm:text-sm">
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 shrink-0">
        <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
        <span className="font-black text-white tracking-wider uppercase text-xs sm:text-base whitespace-nowrap">
          <span className="inline sm:hidden">PBB</span>
          <span className="hidden sm:inline">PBB COLLAB 3.0</span>
        </span>
        <span className="text-zinc-700 hidden sm:inline">/</span>
        <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-sm text-zinc-400 shrink-0" title={`${viewers.toLocaleString()} watching right now`}>
          <Eye className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />
          <span className="font-semibold text-zinc-200 tabular-nums">{viewers.toLocaleString()}</span>
        </div>
        <span className="text-zinc-500 text-xs hidden lg:inline font-medium">CCTV</span>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <button
          onClick={onToggleFit}
          title="Toggle dynamic video fitting (Cover full card vs Contain 16:9)"
          className={`flex items-center gap-1 px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs border transition-colors cursor-pointer ${
            fitMode === "contain" ? "bg-zinc-800 text-white border-zinc-700" : "bg-zinc-950 text-zinc-400 hover:text-white border-zinc-900"
          }`}
        >
          <Scaling className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
          <span className="hidden md:inline font-medium">Fit:</span>
          <span className="uppercase text-[9px] sm:text-[11px] font-bold">{fitMode}</span>
        </button>

        <button
          onClick={onToggleAllAudio}
          title={unmutedCount > 0 ? "Mute all camera feeds simultaneously" : "Turn ON sound for all camera feeds simultaneously"}
          className={`flex items-center gap-1 px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs border transition-colors cursor-pointer ${
            unmutedCount === 3 ? "bg-white text-black font-bold border-white shadow-md"
            : unmutedCount > 0 ? "bg-zinc-800 text-white border-zinc-700"
            : "bg-zinc-950 text-zinc-400 hover:text-white border-zinc-900"
          }`}
        >
          {unmutedCount > 0 ? <Volume2 className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" /> : <VolumeX className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />}
          <span className="hidden sm:inline font-medium">Audio:</span>
          <span className="uppercase text-[9px] sm:text-[11px] font-bold">
            {unmutedCount === 3 ? "ON" : unmutedCount > 0 ? `${unmutedCount}/3` : "OFF"}
          </span>
        </button>

        <button
          onClick={toggleFull}
          title="Toggle browser fullscreen"
          className="inline-flex p-1 sm:p-2 rounded-lg bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-900 transition-colors cursor-pointer shrink-0"
        >
          {isFull ? <Minimize className="w-3 h-3 sm:w-4 sm:h-4" /> : <Maximize className="w-3 h-3 sm:w-4 sm:h-4" />}
        </button>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        <button
          onClick={onOpenSupport}
          title="Support the stream with a donation"
          className="group relative px-2 sm:px-4 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-[13px] font-semibold text-white/90 hover:text-white flex items-center gap-1 sm:gap-2 transition-all duration-200 bg-gradient-to-b from-white/25 via-rose-500/20 to-rose-900/35 hover:from-white/35 hover:via-rose-500/30 hover:to-rose-800/45 backdrop-blur-md border-t border-t-white/40 border-b border-b-rose-950/80 border-x border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),0_3px_6px_rgba(0,0,0,0.5),0_1px_4px_rgba(244,63,94,0.35)] hover:shadow-[inset_0_1px_2px_rgba(255,255,255,0.65),0_4px_10px_rgba(0,0,0,0.6),0_2px_8px_rgba(244,63,94,0.5)] hover:-translate-y-0.5 active:translate-y-0.5 cursor-pointer shrink-0"
        >
          <span className="absolute inset-x-2 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent pointer-events-none rounded-t-full" />
          <Heart className="w-3 h-3 sm:w-4 sm:h-4 text-rose-400 fill-rose-500/60 group-hover:scale-110 group-hover:fill-rose-500 transition-all duration-200 shrink-0" />
          <span className="tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">Support</span>
        </button>
        <div className="hidden md:flex items-center gap-1.5 text-zinc-400 text-xs sm:text-sm whitespace-nowrap">
          <span className="text-[11px] text-zinc-600 uppercase font-bold">PHT</span>
          <time className="text-white font-semibold"><LiveClock /></time>
        </div>
      </div>
    </header>
  );
}
