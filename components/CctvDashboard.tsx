"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Armchair, Columns2, Grid2x2, LayoutGrid, LayoutTemplate, Rows3, Tv, Utensils } from "lucide-react";
import { CHANNELS } from "@/lib/channels";
import Header from "./Header";
import AnnouncementBanner from "./AnnouncementBanner";
import CameraCard from "./CameraCard";
import SupportModal from "./SupportModal";
import LiveClock from "./LiveClock";

type Layout = "featured-top" | "featured-side" | "equal-cols" | "grid-4" | "single";
type Quality = "1080p" | "720p" | "auto";

const LAYOUTS: { id: Layout; title: string; icon: any }[] = [
  { id: "featured-top", title: "Top Main (1 Large + 2 Below)", icon: LayoutTemplate },
  { id: "featured-side", title: "Side Split (1 Left + 2 Right)", icon: Columns2 },
  { id: "equal-cols", title: "3-Stack (3 Rows)", icon: Rows3 },
  { id: "grid-4", title: "4-Grid (2x2 Quad View)", icon: Grid2x2 },
];

export default function CctvDashboard() {
  const [layout, setLayout] = useState<Layout>("featured-top");
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const [unmuted, setUnmuted] = useState<string[]>([]);
  const [support, setSupport] = useState(false);
  const [idle, setIdle] = useState(false);
  const [picker, setPicker] = useState(false);
  const [quality, setQuality] = useState<Quality>("1080p");
  const [featured, setFeatured] = useState(CHANNELS[0].id);
  const [top, setTop] = useState(62);
  const [side, setSide] = useState(50);
  const [sideW, setSideW] = useState(66);
  const [sideH, setSideH] = useState(50);
  const [wide, setWide] = useState(true);
  const [moving, setMoving] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  /* idle hide */
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      if (!support) t = setTimeout(() => setIdle(true), 5000);
    };
    if (support) setIdle(false); else t = setTimeout(() => setIdle(true), 5000);
    const evts = ["pointermove", "pointerdown", "keydown", "touchstart", "wheel"];
    evts.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => { clearTimeout(t); evts.forEach((e) => window.removeEventListener(e, wake)); };
  }, [support]);

  /* restore prefs */
  useEffect(() => {
    if (window.innerWidth < 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) setFit("contain");
    else {
      const f = localStorage.getItem("pbb-cctv-fit");
      if (f === "cover" || f === "contain") setFit(f);
    }
    const l = localStorage.getItem("pbb-cctv-layout");
    if (l && ["featured-top", "featured-side", "equal-cols", "grid-4", "single"].includes(l)) setLayout(l as Layout);
    const q = localStorage.getItem("pbb_stream_quality");
    if (q === "1080p" || q === "720p" || q === "auto") setQuality(q);

    const t = setTimeout(() => {
      const a = Number(localStorage.getItem("pbb-split-top"));
      if (a >= 15 && a <= 85) setTop(a);
      const b = Number(localStorage.getItem("pbb-split-bottom"));
      if (b >= 15 && b <= 85) setSide(b);
      const c = Number(localStorage.getItem("pbb-split-side"));
      if (c >= 20 && c <= 85) setSideW(c);
      const d = Number(localStorage.getItem("pbb-split-side-stacked"));
      if (d >= 15 && d <= 85) setSideH(d);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 768);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const saveLayout = (l: Layout) => { setLayout(l); localStorage.setItem("pbb-cctv-layout", l); };

  const drag = (axis: "y" | "x" | "wx" | "wy") => (e: React.PointerEvent) => {
    e.preventDefault();
    setMoving(true);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture?.(e.pointerId);
    let raf: number | null = null;
    const move = (ev: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const r = box.current?.getBoundingClientRect();
        if (!r) return;
        if (axis === "y") setTop(Math.min(85, Math.max(15, ((ev.clientY - r.top) / r.height) * 100)));
        if (axis === "x") setSide(Math.min(85, Math.max(15, ((ev.clientX - r.left) / r.width) * 100)));
        if (axis === "wx") setSideW(Math.min(85, Math.max(20, ((ev.clientX - r.left) / r.width) * 100)));
        if (axis === "wy") setSideH(Math.min(85, Math.max(15, ((ev.clientY - r.top) / r.height) * 100)));
      });
    };
    const up = (ev: PointerEvent) => {
      if (raf) cancelAnimationFrame(raf);
      setMoving(false);
      el.releasePointerCapture?.(ev.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const r = box.current?.getBoundingClientRect();
      if (!r) return;
      if (axis === "y") localStorage.setItem("pbb-split-top", String(Math.round(((ev.clientY - r.top) / r.height) * 100)));
      if (axis === "x") localStorage.setItem("pbb-split-bottom", String(Math.round(((ev.clientX - r.left) / r.width) * 100)));
      if (axis === "wx") localStorage.setItem("pbb-split-side", String(Math.round(((ev.clientX - r.left) / r.width) * 100)));
      if (axis === "wy") localStorage.setItem("pbb-split-side-stacked", String(Math.round(((ev.clientY - r.top) / r.height) * 100)));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const resetSplits = () => {
    setTop(62); setSide(50); setSideW(66); setSideH(50);
    ["pbb-split-top", "pbb-split-bottom", "pbb-split-side", "pbb-split-side-stacked"].forEach((k) => localStorage.removeItem(k));
  };

  const toggleSound = useCallback((id: string) => {
    setUnmuted((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const setQualityPersist = (q: Quality) => { setQuality(q); localStorage.setItem("pbb_stream_quality", q); };

  const lead = CHANNELS.find((c) => c.id === featured) || CHANNELS[0];
  const rest = CHANNELS.filter((c) => c.id !== lead.id);

  const styleFor = (id: string) => {
    const isLead = id === lead.id;
    const idx = rest.findIndex((c) => c.id === id);
    const anim = moving ? "none" : "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)";
    const common = { zIndex: 2, opacity: 1, visibility: "visible", pointerEvents: "auto", transition: anim } as const;

    if (layout === "single") return isLead
      ? { position: "absolute", inset: 0, zIndex: 10, transition: "opacity 0.2s ease-in-out" } as const
      : { position: "absolute", inset: 0, zIndex: 0, opacity: 0, visibility: "hidden", transition: "opacity 0.2s ease-in-out" } as const;

    if (layout === "featured-top") {
      if (isLead) return { ...common, position: "absolute", top: 0, left: 0, width: "100%", height: `${top}%` } as const;
      const y = `calc(${top}% + 6px)`;
      const h = `calc(${100 - top}% - 6px)`;
      return idx === 0
        ? { ...common, position: "absolute", top: y, left: 0, width: `${side}%`, height: h } as const
        : { ...common, position: "absolute", top: y, left: `calc(${side}% + 6px)`, width: `calc(${100 - side}% - 6px)`, height: h } as const;
    }

    if (layout === "featured-side") {
      if (isLead) return { ...common, position: "absolute", top: 0, left: 0, width: `${sideW}%`, height: "100%" } as const;
      const x = `calc(${sideW}% + 6px)`;
      const w = `calc(${100 - sideW}% - 6px)`;
      return idx === 0
        ? { ...common, position: "absolute", top: 0, left: x, width: w, height: `${sideH}%` } as const
        : { ...common, position: "absolute", top: `calc(${sideH}% + 6px)`, left: x, width: w, height: `calc(${100 - sideH}% - 6px)` } as const;
    }

    if (layout === "grid-4") {
      const i = CHANNELS.findIndex((c) => c.id === id);
      return { ...common, position: "absolute", top: i < 2 ? 0 : "calc(50% + 2px)", left: i % 2 === 0 ? 0 : "calc(50% + 2px)", width: "calc(50% - 2px)", height: "calc(50% - 2px)" } as const;
    }

    const i = CHANNELS.findIndex((c) => c.id === id);
    return wide
      ? { ...common, position: "absolute", top: 0, left: i === 0 ? "0%" : i === 1 ? "calc(33.333% + 1px)" : "calc(66.666% + 2px)", width: i === 2 ? "calc(33.334% - 2px)" : "calc(33.333% - 1px)", height: "100%" } as const
      : { ...common, position: "absolute", top: i === 0 ? "0%" : i === 1 ? "calc(33.333% + 1px)" : "calc(66.666% + 2px)", left: 0, width: "100%", height: i === 2 ? "calc(33.334% - 2px)" : "calc(33.333% - 1px)" } as const;
  };

  return (
    <div className={`w-full h-[100dvh] bg-black text-zinc-100 flex flex-col overflow-hidden transition-all duration-300 ${idle ? "cursor-none" : ""}`}>
      <div className={`sticky top-0 z-40 bg-black transition-all duration-500 ease-in-out shrink-0 overflow-hidden ${idle ? "max-h-0 opacity-0 pointer-events-none -translate-y-full" : "max-h-32 opacity-100 translate-y-0"}`}>
        <Header
          fitMode={fit}
          onToggleFit={() => { const f = fit === "cover" ? "contain" : "cover"; setFit(f); localStorage.setItem("pbb-cctv-fit", f); }}
          unmutedCount={unmuted.length}
          onToggleAllAudio={() => setUnmuted(unmuted.length > 0 ? [] : CHANNELS.map((c) => c.id))}
          onOpenSupport={() => setSupport(true)}
        />
        <AnnouncementBanner />
      </div>

      <main className="w-full flex-1 min-h-0 overflow-hidden relative">
        <div ref={box} className="w-full h-full relative overflow-hidden">
          {CHANNELS.map((ch) => (
            <div key={ch.id} style={styleFor(ch.id) as any} className="overflow-hidden">
              <CameraCard
                channel={ch}
                isSoundOn={unmuted.includes(ch.id)}
                onToggleSound={toggleSound}
                isFeatured={ch.id === lead.id}
                onSetFeatured={(id) => { setFeatured(id); saveLayout("single"); }}
                canFeature
                fitMode={fit}
                isSingleView={layout === "single" && ch.id === lead.id}
                isIdle={idle && layout !== "single"}
                qualityPreference={quality}
                onQualityChange={setQualityPersist}
              />
            </div>
          ))}

          {layout === "grid-4" && (
            <div style={{ position: "absolute", top: "calc(50% + 2px)", left: "calc(50% + 2px)", width: "calc(50% - 2px)", height: "calc(50% - 2px)" }} className="overflow-hidden bg-zinc-950/90 border border-zinc-900/80 flex flex-col items-center justify-center relative">
              <div className="absolute top-2 left-2.5 flex items-center gap-1.5 text-[9px] text-zinc-500">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-700 animate-pulse" />
                <span>CAM 04</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 text-zinc-600">
                <div className="w-8 h-8 rounded-full border border-zinc-800 flex items-center justify-center bg-zinc-900/40"><Tv className="w-3.5 h-3.5" /></div>
                <span className="text-[9px] tracking-wider text-zinc-500 font-semibold">NO SIGNAL</span>
                <span className="text-[8px] text-zinc-600 tracking-wide">FEED RESERVED</span>
              </div>
              <div className="absolute bottom-0 inset-x-0 p-1.5 flex items-center justify-between text-[9px] text-zinc-600 bg-gradient-to-t from-black/80 to-transparent">
                <LiveClock />
                <span>OFFLINE</span>
              </div>
            </div>
          )}

          {layout === "featured-top" && (
            <>
              <div onPointerDown={drag("y")} onDoubleClick={resetSplits} style={{ position: "absolute", top: `${top}%`, left: 0, width: "100%", height: 6, zIndex: 20 }} className={`bg-zinc-950 hover:bg-zinc-700 cursor-row-resize flex items-center justify-center group touch-none ${idle ? "opacity-0" : ""}`} title="Drag up/down to resize top feed (Double-click to reset)">
                <div className="w-12 h-0.5 rounded-full bg-zinc-800 group-hover:bg-zinc-400" />
              </div>
              <div onPointerDown={drag("x")} onDoubleClick={resetSplits} style={{ position: "absolute", top: `calc(${top}% + 6px)`, left: `${side}%`, width: 6, height: `calc(${100 - top}% - 6px)`, zIndex: 20 }} className={`bg-zinc-950 hover:bg-zinc-700 cursor-col-resize flex items-center justify-center group touch-none ${idle ? "opacity-0" : ""}`} title="Drag left/right to resize bottom feeds (Double-click to reset)">
                <div className="w-0.5 h-12 rounded-full bg-zinc-800 group-hover:bg-zinc-400" />
              </div>
            </>
          )}

          {layout === "featured-side" && (
            <>
              <div onPointerDown={drag("wx")} onDoubleClick={resetSplits} style={{ position: "absolute", top: 0, left: `${sideW}%`, width: 6, height: "100%", zIndex: 20 }} className={`bg-zinc-950 hover:bg-zinc-700 cursor-col-resize flex items-center justify-center group touch-none ${idle ? "opacity-0" : ""}`} title="Drag to resize main feed width (Double-click to reset)">
                <div className="w-0.5 h-12 rounded-full bg-zinc-800 group-hover:bg-zinc-400" />
              </div>
              <div onPointerDown={drag("wy")} onDoubleClick={resetSplits} style={{ position: "absolute", top: `${sideH}%`, left: `calc(${sideW}% + 6px)`, width: `calc(${100 - sideW}% - 6px)`, height: 6, zIndex: 20 }} className={`bg-zinc-950 hover:bg-zinc-700 cursor-row-resize flex items-center justify-center group touch-none ${idle ? "opacity-0" : ""}`} title="Drag to resize right side feeds (Double-click to reset)">
                <div className="w-10 h-0.5 rounded-full bg-zinc-800 group-hover:bg-zinc-400" />
              </div>
            </>
          )}
        </div>
      </main>

      <div className={`fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-1.5 pointer-events-none transition-all duration-500 ${idle ? "opacity-0 translate-y-12" : "opacity-100 translate-y-0"}`}>
        {layout !== "single" && picker && (
          <div className="flex items-center gap-1 bg-black/90 backdrop-blur-md p-1 rounded-full border border-zinc-800 shadow-xl pointer-events-auto">
            {LAYOUTS.map((l) => {
              const Icon = l.icon;
              return (
                <button key={l.id} onClick={() => { setLayout(l.id); localStorage.setItem("pbb-cctv-layout", l.id); setPicker(false); }} title={l.title} className={`p-2 rounded-full ${layout === l.id ? "bg-white text-black" : "text-zinc-400 hover:text-white hover:bg-zinc-800"}`}>
                  <Icon className="w-3.5 h-3.5" />
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-1 bg-black/90 backdrop-blur-md p-1 sm:p-1.5 rounded-full border border-zinc-800 shadow-2xl pointer-events-auto">
          {[{ id: CHANNELS[0].id, title: "Main Stream (CAM 01)", icon: Tv }, { id: CHANNELS[1].id, title: "Dining Area (CAM 02)", icon: Utensils }, { id: CHANNELS[2].id, title: "External Den (CAM 03)", icon: Armchair }].map((c) => {
            const Icon = c.icon;
            const active = layout === "single" && lead.id === c.id;
            return (
              <button key={c.id} onClick={() => { setPicker(false); setFeatured(c.id); saveLayout("single"); }} title={c.title} className={`p-2 sm:p-2.5 rounded-full ${active ? "bg-white text-black shadow-md" : "text-zinc-400 hover:text-white hover:bg-zinc-800"}`}>
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
          <button onClick={() => (layout === "single" ? (setLayout("featured-top"), setPicker(true)) : setPicker((v) => !v))} title="All Cameras (Click to change layout)" className={`relative p-2 sm:p-2.5 rounded-full ${layout !== "single" ? "bg-white text-black shadow-md" : "text-zinc-400 hover:text-white hover:bg-zinc-800"}`}>
            <LayoutGrid className="w-4 h-4" />
            {layout !== "single" && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />}
          </button>
        </div>
      </div>

      <SupportModal open={support} onClose={() => setSupport(false)} />
    </div>
  );
}
