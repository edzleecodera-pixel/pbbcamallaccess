"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Armchair,
  Columns2,
  Grid2x2,
  LayoutGrid,
  LayoutTemplate,
  Rows3,
  Tv,
  Utensils,
} from "lucide-react";
import { CHANNELS } from "@/lib/channels";
import AnnouncementBanner from "./AnnouncementBanner";
import CameraCard from "./CameraCard";
import Header from "./Header";
import LiveClock from "./LiveClock";
import SupportModal from "./SupportModal";

type Layout = "featured-top" | "featured-side" | "equal-cols" | "grid-4" | "single";
type Quality = "1080p" | "720p" | "auto";

const LAYOUTS = [
  { id: "featured-top" as Layout, title: "Top Main (1 Large + 2 Below)", icon: LayoutTemplate },
  { id: "featured-side" as Layout, title: "Side Split (1 Left + 2 Right)", icon: Columns2 },
  { id: "equal-cols" as Layout, title: "3-Stack (3 Rows)", icon: Rows3 },
  { id: "grid-4" as Layout, title: "4-Grid (2x2 Quad View)", icon: Grid2x2 },
];

const CAMERA_ICONS = [
  { id: CHANNELS[0].id, title: "Main Stream (CAM 01)", icon: Tv },
  { id: CHANNELS[1].id, title: "Dining Area (CAM 02)", icon: Utensils },
  { id: CHANNELS[2].id, title: "External Den (CAM 03)", icon: Armchair },
];

export default function CctvDashboard() {
  const [layout, setLayout] = useState<Layout>("featured-top");
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const [unmuted, setUnmuted] = useState<string[]>([]);
  const [supportOpen, setSupportOpen] = useState(false);
  const [idle, setIdle] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quality, setQuality] = useState<Quality>("1080p");
  const [featured, setFeatured] = useState(CHANNELS[0].id);
  const [topSplit, setTopSplit] = useState(62);
  const [bottomSplit, setBottomSplit] = useState(50);
  const [sideWidth, setSideWidth] = useState(66);
  const [sideStack, setSideStack] = useState(50);
  const [wide, setWide] = useState(true);
  const [moving, setMoving] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      if (!supportOpen) timer = setTimeout(() => setIdle(true), 5000);
    };

    if (supportOpen) setIdle(false);
    else timer = setTimeout(() => setIdle(true), 5000);

    const events = ["pointermove", "pointerdown", "keydown", "touchstart", "wheel"];
    events.forEach((name) => window.addEventListener(name, wake, { passive: true }));

    return () => {
      clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, wake));
    };
  }, [supportOpen]);

  useEffect(() => {
    if (
      window.innerWidth < 768 ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    ) {
      setFit("contain");
    } else {
      const storedFit = localStorage.getItem("pbb-cctv-fit");
      if (storedFit === "cover" || storedFit === "contain") setFit(storedFit);
    }

    const storedLayout = localStorage.getItem("pbb-cctv-layout");
    if (
      storedLayout &&
      ["featured-top", "featured-side", "equal-cols", "grid-4", "single"].includes(
        storedLayout
      )
    ) {
      setLayout(storedLayout as Layout);
    }

    const storedQuality = localStorage.getItem("pbb_stream_quality");
    if (
      storedQuality === "1080p" ||
      storedQuality === "720p" ||
      storedQuality === "auto"
    ) {
      setQuality(storedQuality);
    }

    const timer = setTimeout(() => {
      const top = Number(localStorage.getItem("pbb-split-top"));
      if (top >= 15 && top <= 85) setTopSplit(top);

      const bottom = Number(localStorage.getItem("pbb-split-bottom"));
      if (bottom >= 15 && bottom <= 85) setBottomSplit(bottom);

      const side = Number(localStorage.getItem("pbb-split-side"));
      if (side >= 20 && side <= 85) setSideWidth(side);

      const stack = Number(localStorage.getItem("pbb-split-side-stacked"));
      if (stack >= 15 && stack <= 85) setSideStack(stack);
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 768);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const saveLayout = (next: Layout) => {
    setLayout(next);
    localStorage.setItem("pbb-cctv-layout", next);
  };

  const startDrag =
    (axis: "y" | "x" | "sideWidth" | "sideStack") =>
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      setMoving(true);

      const node = event.currentTarget;
      if (node.setPointerCapture) node.setPointerCapture(event.pointerId);

      let frame: number | null = null;

      const move = (moveEvent: PointerEvent) => {
        if (frame !== null) return;
        frame = requestAnimationFrame(() => {
          frame = null;
          const rect = boxRef.current?.getBoundingClientRect();
          if (!rect) return;

          if (axis === "y") {
            setTopSplit(
              Math.min(85, Math.max(15, ((moveEvent.clientY - rect.top) / rect.height) * 100))
            );
          } else if (axis === "x") {
            setBottomSplit(
              Math.min(85, Math.max(15, ((moveEvent.clientX - rect.left) / rect.width) * 100))
            );
          } else if (axis === "sideWidth") {
            setSideWidth(
              Math.min(85, Math.max(20, ((moveEvent.clientX - rect.left) / rect.width) * 100))
            );
          } else {
            setSideStack(
              Math.min(85, Math.max(15, ((moveEvent.clientY - rect.top) / rect.height) * 100))
            );
          }
        });
      };

      const up = (upEvent: PointerEvent) => {
        if (frame !== null) cancelAnimationFrame(frame);
        setMoving(false);
        if (node.releasePointerCapture) node.releasePointerCapture(upEvent.pointerId);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);

        const rect = boxRef.current?.getBoundingClientRect();
        if (!rect) return;

        if (axis === "y") {
          localStorage.setItem(
            "pbb-split-top",
            String(Math.round(((upEvent.clientY - rect.top) / rect.height) * 100))
          );
        } else if (axis === "x") {
          localStorage.setItem(
            "pbb-split-bottom",
            String(Math.round(((upEvent.clientX - rect.left) / rect.width) * 100))
          );
        } else if (axis === "sideWidth") {
          localStorage.setItem(
            "pbb-split-side",
            String(Math.round(((upEvent.clientX - rect.left) / rect.width) * 100))
          );
        } else {
          localStorage.setItem(
            "pbb-split-side-stacked",
            String(Math.round(((upEvent.clientY - rect.top) / rect.height) * 100))
          );
        }
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };

  const resetSplits = () => {
    setTopSplit(62);
    setBottomSplit(50);
    setSideWidth(66);
    setSideStack(50);
    [
      "pbb-split-top",
      "pbb-split-bottom",
      "pbb-split-side",
      "pbb-split-side-stacked",
    ].forEach((key) => localStorage.removeItem(key));
  };

  const toggleSound = useCallback((id: string) => {
    setUnmuted((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }, []);

  const changeQuality = (next: Quality) => {
    setQuality(next);
    localStorage.setItem("pbb_stream_quality", next);
  };

  const lead = CHANNELS.find((channel) => channel.id === featured) || CHANNELS[0];
  const rest = CHANNELS.filter((channel) => channel.id !== lead.id);

  const styleFor = (id: string): React.CSSProperties => {
    const isLead = id === lead.id;
    const restIndex = rest.findIndex((channel) => channel.id === id);
    const transition = moving ? "none" : "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)";

    if (layout === "single") {
      return isLead
        ? { position: "absolute", inset: 0, zIndex: 10, transition: "opacity 0.2s ease-in-out" }
        : {
            position: "absolute",
            inset: 0,
            zIndex: 0,
            opacity: 0,
            visibility: "hidden",
            pointerEvents: "none",
            transition: "opacity 0.2s ease-in-out",
          };
    }

    if (layout === "featured-top") {
      if (isLead) {
        return {
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: `${topSplit}%`,
          zIndex: 2,
          transition,
        };
      }

      const y = `calc(${topSplit}% + 6px)`;
      const height = `calc(${100 - topSplit}% - 6px)`;

      return restIndex === 0
        ? { position: "absolute", top: y, left: 0, width: `${bottomSplit}%`, height, zIndex: 2, transition }
        : {
            position: "absolute",
            top: y,
            left: `calc(${bottomSplit}% + 6px)`,
            width: `calc(${100 - bottomSplit}% - 6px)`,
            height,
            zIndex: 2,
            transition,
          };
    }

    if (layout === "featured-side") {
      if (isLead) {
        return {
          position: "absolute",
          top: 0,
          left: 0,
          width: `${sideWidth}%`,
          height: "100%",
          zIndex: 2,
          transition,
        };
      }

      const x = `calc(${sideWidth}% + 6px)`;
      const width = `calc(${100 - sideWidth}% - 6px)`;

      return restIndex === 0
        ? { position: "absolute", top: 0, left: x, width, height: `${sideStack}%`, zIndex: 2, transition }
        : {
            position: "absolute",
            top: `calc(${sideStack}% + 6px)`,
            left: x,
            width,
            height: `calc(${100 - sideStack}% - 6px)`,
            zIndex: 2,
            transition,
          };
    }

    if (layout === "grid-4") {
      const index = CHANNELS.findIndex((channel) => channel.id === id);
      return {
        position: "absolute",
        top: index < 2 ? 0 : "calc(50% + 2px)",
        left: index % 2 === 0 ? 0 : "calc(50% + 2px)",
        width: "calc(50% - 2px)",
        height: "calc(50% - 2px)",
        zIndex: 2,
        transition,
      };
    }

    const index = CHANNELS.findIndex((channel) => channel.id === id);

    return wide
      ? {
          position: "absolute",
          top: 0,
          left:
            index === 0 ? "0%" : index === 1 ? "calc(33.333% + 1px)" : "calc(66.666% + 2px)",
          width: index === 2 ? "calc(33.334% - 2px)" : "calc(33.333% - 1px)",
          height: "100%",
          zIndex: 2,
          transition,
        }
      : {
          position: "absolute",
          top:
            index === 0 ? "0%" : index === 1 ? "calc(33.333% + 1px)" : "calc(66.666% + 2px)",
          left: 0,
          width: "100%",
          height: index === 2 ? "calc(33.334% - 2px)" : "calc(33.333% - 1px)",
          zIndex: 2,
          transition,
        };
  };

  return (
    <div
      className={`w-full h-[100dvh] bg-black text-zinc-100 flex flex-col overflow-hidden transition-all duration-300 ${
        idle ? "cursor-none" : ""
      }`}
    >
      <div
        className={`sticky top-0 z-40 bg-black transition-all duration-500 ease-in-out shrink-0 overflow-hidden ${
          idle ? "max-h-0 opacity-0 pointer-events-none -translate-y-full" : "max-h-32 opacity-100 translate-y-0"
        }`}
      >
        <Header
          fitMode={fit}
          onToggleFit={() => {
            const next = fit === "cover" ? "contain" : "cover";
            setFit(next);
            localStorage.setItem("pbb-cctv-fit", next);
          }}
          unmutedCount={unmuted.length}
          onToggleAllAudio={() =>
            setUnmuted(unmuted.length > 0 ? [] : CHANNELS.map((channel) => channel.id))
          }
          onOpenSupport={() => setSupportOpen(true)}
        />
        <AnnouncementBanner />
      </div>

      <main className="w-full flex-1 min-h-0 overflow-hidden relative">
        <div ref={boxRef} className="w-full h-full relative overflow-hidden">
          {CHANNELS.map((channel) => (
            <div key={channel.id} style={styleFor(channel.id)} className="overflow-hidden">
              <CameraCard
                channel={channel}
                isSoundOn={unmuted.includes(channel.id)}
                onToggleSound={toggleSound}
                isFeatured={channel.id === lead.id}
                onSetFeatured={(id) => {
                  setFeatured(id);
                  saveLayout("single");
                }}
                canFeature
                fitMode={fit}
                isSingleView={layout === "single" && channel.id === lead.id}
                isIdle={idle && layout !== "single"}
                qualityPreference={quality}
                onQualityChange={changeQuality}
              />
            </div>
          ))}

          {layout === "grid-4" ? (
            <div
              style={{
                position: "absolute",
                top: "calc(50% + 2px)",
                left: "calc(50% + 2px)",
                width: "calc(50% - 2px)",
                height: "calc(50% - 2px)",
                zIndex: 2,
              }}
              className="overflow-hidden bg-zinc-950/90 border border-zinc-900/80 flex flex-col items-center justify-center relative"
            >
              <div className="absolute top-2 left-2.5 flex items-center gap-1.5 text-[9px] text-zinc-500">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-700 animate-pulse" />
                <span>CAM 04</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 text-zinc-600">
                <div className="w-8 h-8 rounded-full border border-zinc-800 flex items-center justify-center bg-zinc-900/40">
                  <Tv className="w-3.5 h-3.5" />
                </div>
                <span className="text-[9px] tracking-wider text-zinc-500 font-semibold">
                  NO SIGNAL
                </span>
                <span className="text-[8px] text-zinc-600 tracking-wide">
                  FEED RESERVED
                </span>
              </div>
              <div className="absolute bottom-0 inset-x-0 p-1.5 flex items-center justify-between text-[9px] text-zinc-600 bg-gradient-to-t from-black/80 to-transparent">
                <LiveClock />
                <span>OFFLINE</span>
              </div>
            </div>
          ) : null}

          {layout === "featured-top" ? (
            <>
              <div
                onPointerDown={startDrag("y")}
                onDoubleClick={resetSplits}
                style={{
                  position: "absolute",
                  top: `${topSplit}%`,
                  left: 0,
                  width: "100%",
                  height: 6,
                  zIndex: 20,
                }}
                className={`bg-zinc-950 hover:bg-zinc-700 cursor-row-resize flex items-center justify-center group touch-none ${
                  idle ? "opacity-0" : ""
                }`}
                title="Drag up/down to resize top feed (Double-click to reset)"
              >
                <div className="w-12 h-0.5 rounded-full bg-zinc-800 group-hover:bg-zinc-400" />
              </div>

              <div
                onPointerDown={startDrag("x")}
                onDoubleClick={resetSplits}
                style={{
                  position: "absolute",
                  top: `calc(${topSplit}% + 6px)`,
                  left: `${bottomSplit}%`,
                  width: 6,
                  height: `calc(${100 - topSplit}% - 6px)`,
                  zIndex: 20,
                }}
                className={`bg-zinc-950 hover:bg-zinc-700 cursor-col-resize flex items-center justify-center group touch-none ${
                  idle ? "opacity-0" : ""
                }`}
                title="Drag left/right to resize bottom feeds (Double-click to reset)"
              >
                <div className="w-0.5 h-12 rounded-full bg-zinc-800 group-hover:bg-zinc-400" />
              </div>
            </>
          ) : null}

          {layout === "featured-side" ? (
            <>
              <div
                onPointerDown={startDrag("sideWidth")}
                onDoubleClick={resetSplits}
                style={{
                  position: "absolute",
                  top: 0,
                  left: `${sideWidth}%`,
                  width: 6,
                  height: "100%",
                  zIndex: 20,
                }}
                className={`bg-zinc-950 hover:bg-zinc-700 cursor-col-resize flex items-center justify-center group touch-none ${
                  idle ? "opacity-0" : ""
                }`}
                title="Drag to resize main feed width (Double-click to reset)"
              >
                <div className="w-0.5 h-12 rounded-full bg-zinc-800 group-hover:bg-zinc-400" />
              </div>

              <div
                onPointerDown={startDrag("sideStack")}
                onDoubleClick={resetSplits}
                style={{
                  position: "absolute",
                  top: `${sideStack}%`,
                  left: `calc(${sideWidth}% + 6px)`,
                  width: `calc(${100 - sideWidth}% - 6px)`,
                  height: 6,
                  zIndex: 20,
                }}
                className={`bg-zinc-950 hover:bg-zinc-700 cursor-row-resize flex items-center justify-center group touch-none ${
                  idle ? "opacity-0" : ""
                }`}
                title="Drag to resize right side feeds (Double-click to reset)"
              >
                <div className="w-10 h-0.5 rounded-full bg-zinc-800 group-hover:bg-zinc-400" />
              </div>
            </>
          ) : null}
        </div>
      </main>

      <div
        className={`fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-1.5 pointer-events-none transition-all duration-500 ${
          idle ? "opacity-0 translate-y-12" : "opacity-100 translate-y-0"
        }`}
      >
        {layout !== "single" && pickerOpen ? (
          <div className="flex items-center gap-1 bg-black/90 backdrop-blur-md p-1 rounded-full border border-zinc-800 shadow-xl pointer-events-auto">
            {LAYOUTS.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    saveLayout(option.id);
                    setPickerOpen(false);
                  }}
                  title={option.title}
                  className={`p-2 rounded-full ${
                    layout === option.id
                      ? "bg-white text-black"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex items-center gap-1 bg-black/90 backdrop-blur-md p-1 sm:p-1.5 rounded-full border border-zinc-800 shadow-2xl pointer-events-auto">
          {CAMERA_ICONS.map((camera) => {
            const Icon = camera.icon;
            const active = layout === "single" && lead.id === camera.id;
            return (
              <button
                key={camera.id}
                type="button"
                onClick={() => {
                  setPickerOpen(false);
                  setFeatured(camera.id);
                  saveLayout("single");
                }}
                title={camera.title}
                className={`p-2 sm:p-2.5 rounded-full ${
                  active
                    ? "bg-white text-black shadow-md"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              if (layout === "single") {
                setLayout("featured-top");
                setPickerOpen(true);
              } else {
                setPickerOpen((value) => !value);
              }
            }}
            title="All Cameras (Click to change layout)"
            className={`relative p-2 sm:p-2.5 rounded-full ${
              layout !== "single"
                ? "bg-white text-black shadow-md"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            {layout !== "single" ? (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
            ) : null}
          </button>
        </div>
      </div>

      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  );
}
