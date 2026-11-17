"use client";
import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, RotateCw, Star, Volume1, Volume2, VolumeX, ZoomIn, ZoomOut } from "lucide-react";
import type { Channel } from "@/lib/channels";
import { installFilters, loadShaka, patchInitSegment, patchMediaSegment, toU8 } from "@/lib/player";
import { patchManifest } from "@/lib/dash";
import LiveClock from "./LiveClock";

type Quality = "1080p" | "720p" | "auto";

type Props = {
  channel: Channel;
  isSoundOn: boolean;
  onToggleSound: (id: string) => void;
  isFeatured?: boolean;
  onSetFeatured?: (id: string) => void;
  canFeature?: boolean;
  fitMode: "cover" | "contain";
  isSingleView?: boolean;
  isIdle?: boolean;
  qualityPreference: Quality;
  onQualityChange: (q: Quality) => void;
};

const label = (q: Quality) => (q === "1080p" ? "1080p FHD" : q === "720p" ? "720p HD" : "AUTO");

export default function CameraCard({
  channel, isSoundOn, onToggleSound, isFeatured, onSetFeatured, canFeature,
  fitMode, isSingleView, isIdle, qualityPreference, onQualityChange,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "live" | "error">("loading");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [proxy, setProxy] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [volOpen, setVolOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [qualityLabel, setQualityLabel] = useState(label(qualityPreference));
  const [volume, setVolume] = useState(1);

  const soundRef = useRef(isSoundOn);
  const volRef = useRef(volume);
  const qualityRef = useRef(qualityPreference);
  soundRef.current = isSoundOn;
  volRef.current = volume;
  qualityRef.current = qualityPreference;

  useEffect(() => {
    const onFs = () => setIsFull(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    try {
      const saved = parseFloat(localStorage.getItem(`pbb-player-volume-${channel.id}`) || "1");
      if (!Number.isNaN(saved) && saved >= 0 && saved <= 1) setVolume(saved);
    } catch {}
  }, [channel.id]);

  /* ---------------- player ---------------- */
  useEffect(() => {
    let disposed = false;
    let player: any = null;

    (async () => {
      try {
        const shaka = await loadShaka();
        const video = videoRef.current;
        if (!video || disposed) return;
        if (!shaka.Player.isBrowserSupported()) {
          setStatus("error");
          setMessage("Browser does not support MSE");
          return;
        }

        player = new shaka.Player();
        await player.attach(video);
        playerRef.current = player;

        player.addEventListener("error", (e: any) => {
          if (disposed) return;
          const d = e?.detail;
          if (d?.severity && d.severity !== 2) return;
          if (video && !video.paused && video.currentTime > 0 && d?.severity !== 2) return;
          const code = d?.code;
          const http = d?.data?.[1];

          if ((code === 1001 || code === 1002) && (http === 403 || http === 401)) {
            if (!proxy) { setProxy(true); return; }          // retry through our proxy
            setStatus("error");
            setMessage("Source access restricted (HTTP 403).");
            return;
          }
          if (code === 4012) return void (setStatus("error"), setMessage("DRM key mismatch (4012)."));
          if (code === 3015) return void (setStatus("error"), setMessage("Decryption failed (3015)."));
          setStatus("error");
          setMessage(d?.message || `Feed error (${code || "unknown"})`);
        });

        video.onplaying = () => !disposed && setStatus("live");
        video.onloadeddata = () => !disposed && setStatus("live");
        video.ontimeupdate = () => { if (video.currentTime > 0) setStatus("live"); };

        const res = await fetch(`/api/stream?channel=${encodeURIComponent(channel.id)}&proxy=${proxy ? 1 : 0}`);
        if (!res.ok) throw new Error(`API ${res.status}`);
        const info = await res.json();
        if (disposed) return;

        const drm = info.requiresDrm && info.clearKeys && Object.keys(info.clearKeys).length
          ? { clearKeys: info.clearKeys }
          : {};

        const q = qualityRef.current;
        player.configure({
          drm,
          abr: {
            enabled: q === "auto",
            defaultBandwidthEstimate: q === "1080p" ? 16e6 : q === "720p" ? 8e6 : 12e6,
            switchInterval: 4,
            restrictions: { maxHeight: q === "720p" ? 720 : 1080, minHeight: 0 },
          },
          streaming: {
            bufferingGoal: 12, rebufferingGoal: 1.5, bufferBehind: 10,
            retryParameters: { maxAttempts: 5, baseDelay: 300 },
            stallEnabled: false, safeSeekOffset: 12, inaccurateManifestTolerance: 0,
          },
          manifest: { dash: { autoCorrectDrift: true, defaultPresentationDelay: 12 } },
        });

        installFilters(player, shaka, info);

        const applyTrack = () => {
          try {
            const tracks = player.getVariantTracks().filter((t: any) => t.type === "video" || t.height);
            if (!tracks.length) return;
            const cap = q === "720p" ? 720 : 1080;
            const pick = tracks
              .filter((t: any) => !t.height || t.height <= cap)
              .sort((a: any, b: any) => (b.height || 0) - (a.height || 0) || (b.bandwidth || 0) - (a.bandwidth || 0))[0];
            if (pick) {
              player.selectVariantTrack(pick, false);
              if (pick.height) setQualityLabel(pick.height >= 1080 ? "1080p FHD" : pick.height >= 720 ? "720p HD" : `${pick.height}p`);
            }
          } catch {}
        };

        // manifest with one automatic retry against the proxy fallback
        let loaded = false;
        for (const uri of [info.manifestUri, info.proxiedManifestUri].filter(Boolean)) {
          for (let i = 0; i < 2 && !loaded; i++) {
            try { await player.load(uri); loaded = true; }
            catch { if (disposed) return; await new Promise((r) => setTimeout(r, 500)); }
          }
          if (loaded) break;
        }
        if (!loaded) throw new Error("Connection interrupted");
        if (disposed) return;

        applyTrack();
        player.addEventListener("variantchanged", applyTrack);

        if (video) {
          video.muted = !soundRef.current;
          if (soundRef.current) video.volume = volRef.current > 0 ? volRef.current : 1;
          try { await video.play(); }
          catch { video.muted = true; await video.play().catch(() => {}); }
        }
        setStatus("live");
      } catch (err: any) {
        if (disposed) return;
        setStatus("error");
        setMessage(err?.message || "Connection interrupted");
      }
    })();

    return () => {
      disposed = true;
      player?.destroy?.().catch?.(() => {});
    };
  }, [channel.id, proxy, attempt]);

  /* audio */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const apply = () => {
      v.muted = !isSoundOn;
      if (isSoundOn) { v.volume = volume > 0 ? volume : 1; v.play().catch(() => {}); }
    };
    apply();
    v.addEventListener("canplay", apply);
    v.addEventListener("playing", apply);
    return () => { v.removeEventListener("canplay", apply); v.removeEventListener("playing", apply); };
  }, [isSoundOn, volume, status]);

  /* quality changes */
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      const tracks = p.getVariantTracks().filter((t: any) => t.type === "video" || t.height);
      if (!tracks.length) return;
      if (qualityPreference === "auto") {
        p.configure({ abr: { enabled: true, restrictions: { maxHeight: 1080, minHeight: 0 } } });
      } else {
        const cap = qualityPreference === "720p" ? 720 : 1080;
        const pick = tracks
          .filter((t: any) => !t.height || t.height <= cap)
          .sort((a: any, b: any) => (b.height || 0) - (a.height || 0))[0];
        if (pick) { p.selectVariantTrack(pick, false); p.configure({ abr: { enabled: false, restrictions: { maxHeight: cap, minHeight: 0 } } }); }
      }
    } catch {}
  }, [qualityPreference]);

  const setVol = (v: number) => {
    const n = Math.max(0, Math.min(1, v));
    setVolume(n);
    try {
      localStorage.setItem(`pbb-player-volume-${channel.id}`, String(n));
      localStorage.setItem("pbb-player-volume", String(n));
    } catch {}
    const video = videoRef.current;
    if (video) {
      video.volume = n;
      if (n > 0) { video.muted = false; if (!isSoundOn) onToggleSound(channel.id); }
      else { video.muted = true; if (isSoundOn) onToggleSound(channel.id); }
    }
  };

  const toggleMute = () => {
    if (isSoundOn && volume > 0) {
      if (videoRef.current) videoRef.current.muted = true;
      onToggleSound(channel.id);
    } else {
      const v = volume > 0 ? volume : 1;
      setVolume(v);
      if (videoRef.current) { videoRef.current.muted = false; videoRef.current.volume = v; videoRef.current.play().catch(() => {}); }
      if (!isSoundOn) onToggleSound(channel.id);
    }
  };

  const retry = () => {
    setStatus("loading");
    setMessage("");
    playerRef.current?.destroy?.().catch?.(() => {});
    setAttempt((a) => a + 1);
  };

  const toggleFull = async () => {
    if (!wrapRef.current) return;
    if (document.fullscreenElement === wrapRef.current) { await document.exitFullscreen().catch(() => {}); return; }
    try { await wrapRef.current.requestFullscreen(); }
    catch { document.fullscreenElement && await document.exitFullscreen().catch(() => {}); await wrapRef.current.requestFullscreen().catch(() => {}); }
  };

  /* zoom / pan */
  const clamp = (s: number) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const mx = (r.width * (s - 1)) / 2;
    const my = (r.height * (s - 1)) / 2;
    setOffset((o) => ({ x: Math.max(-mx, Math.min(mx, o.x)), y: Math.max(-my, Math.min(my, o.y)) }));
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const px = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const py = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    const next = Math.min(4, Math.max(1, Number((scale + (e.deltaY < 0 ? 0.35 : -0.35)).toFixed(2))));
    if (next === 1) { setScale(1); setOffset({ x: 0, y: 0 }); return; }
    setScale(next);
    setOffset({
      x: (0.5 - px) * r.width * (next - 1),
      y: (0.5 - py) * r.height * (next - 1),
    });
    clamp(next);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, [role="button"]')) return;
    e.preventDefault();
    if (scale > 1) { setScale(1); setOffset({ x: 0, y: 0 }); return; }
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const px = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const py = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    setScale(2.2);
    setOffset({ x: (0.5 - px) * r.width * 1.2, y: (0.5 - py) * r.height * 1.2 });
  };

  const start = useRef({ x: 0, y: 0 });
  const origin = useRef({ x: 0, y: 0 });

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1 || (e.target as HTMLElement).closest('button, input, [role="button"]')) return;
    setDragging(true);
    start.current = { x: e.clientX, y: e.clientY };
    origin.current = { ...offset };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || scale <= 1) return;
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const mx = (r.width * (scale - 1)) / 2;
    const my = (r.height * (scale - 1)) / 2;
    setOffset({
      x: Math.max(-mx, Math.min(mx, origin.current.x + (e.clientX - start.current.x))),
      y: Math.max(-my, Math.min(my, origin.current.y + (e.clientY - start.current.y))),
    });
  };
  const endDrag = () => setDragging(false);

  const hidden = isIdle && !volOpen;

  return (
    <div
      ref={wrapRef}
      className={`relative w-full h-full bg-black overflow-hidden group select-none flex items-center justify-center ${hidden ? "cursor-none" : ""}`}
    >
      <video
        ref={videoRef}
        autoPlay muted playsInline
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "center center",
          transition: dragging ? "none" : "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        className={`w-full h-full ${scale > 1 ? (dragging ? "cursor-grabbing touch-none" : "cursor-grab touch-none") : ""} ${fitMode === "contain" ? "object-contain" : "object-cover"}`}
      />

      <div className={`absolute top-0 left-0 right-0 p-1.5 sm:p-2 flex items-center justify-between pointer-events-none bg-gradient-to-b from-black/80 via-black/30 to-transparent z-10 transition-all duration-500 ${hidden ? "opacity-0 -translate-y-4" : "opacity-100 translate-y-0"}`}>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          <span className="text-[10px] sm:text-xs font-medium tracking-wider text-white uppercase">{channel.name}</span>
          <span className="text-[9px] text-zinc-500 hidden sm:inline">{channel.code}</span>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 pointer-events-auto">
          {canFeature && !isFeatured && onSetFeatured && (
            <button onClick={() => onSetFeatured(channel.id)} className="px-1.5 py-0.5 rounded text-[9px] bg-black/70 hover:bg-black text-zinc-300 hover:text-white flex items-center gap-1 transition-colors border border-zinc-800" title="Focus this camera as Main">
              <Star className="w-2.5 h-2.5" />
              <span className="hidden sm:inline">Main</span>
            </button>
          )}

          <div className={`flex items-center rounded-full transition-all duration-200 border ${isSoundOn && volume > 0 ? "bg-black/90 border-zinc-700 text-white shadow-lg" : "bg-black/75 border-zinc-800 text-zinc-400"} backdrop-blur-md px-1.5 py-0.5 gap-1.5`}>
            <button type="button" onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="p-1 rounded-full text-zinc-300 hover:text-white transition-colors flex items-center justify-center shrink-0 active:scale-95" title={isSoundOn ? "Mute" : "Unmute"}>
              {isSoundOn && volume > 0
                ? (volume <= 0.5 ? <Volume1 className="w-3.5 h-3.5 text-amber-400" /> : <Volume2 className="w-3.5 h-3.5 text-white" />)
                : <VolumeX className="w-3.5 h-3.5 text-zinc-400" />}
            </button>
            <div className={`flex items-center gap-2 transition-all duration-200 overflow-hidden ${volOpen ? "max-w-[150px] opacity-100 pr-1" : "max-w-0 opacity-0"}`}>
              <div className="relative w-18 sm:w-22 h-5 flex items-center">
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden relative border border-zinc-700/60">
                  <div className={`h-full rounded-full ${!isSoundOn || volume === 0 ? "bg-zinc-600" : volume <= 0.5 ? "bg-amber-400" : "bg-white"}`} style={{ width: `${Math.round((isSoundOn ? volume : 0) * 100)}%` }} />
                </div>
                <input
                  type="range" min="0" max="1" step="0.01" value={isSoundOn ? volume : 0}
                  onChange={(e) => setVol(parseFloat(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  aria-label="Volume Slider"
                />
              </div>
              <button type="button" onClick={(e) => { e.stopPropagation(); setVol(volume >= 1 ? 0.5 : 1); }} className="text-[9px] text-zinc-300 hover:text-white tabular-nums min-w-[26px] text-right font-medium cursor-pointer">
                {Math.round((isSoundOn ? volume : 0) * 100)}%
              </button>
            </div>
          </div>

          {isSingleView && (
            <div className="flex items-center gap-0.5 bg-black/75 backdrop-blur-sm border border-zinc-800 p-0.5 rounded text-[10px]">
              <button onClick={() => { const n = Math.max(1, scale - 0.5); setScale(n); clamp(n); }} disabled={scale <= 1} className={`p-1 rounded ${scale <= 1 ? "text-zinc-600" : "text-zinc-300 hover:text-white hover:bg-zinc-800"}`} title="Zoom Out"><ZoomOut className="w-3 h-3" /></button>
              <button onClick={() => { const n = Math.min(4, scale + 0.5); setScale(n); clamp(n); }} disabled={scale >= 4} className={`p-1 rounded ${scale >= 4 ? "text-zinc-600" : "text-zinc-300 hover:text-white hover:bg-zinc-800"}`} title="Zoom In"><ZoomIn className="w-3 h-3" /></button>
            </div>
          )}

          <button onClick={toggleFull} className="p-1 rounded bg-black/70 hover:bg-black text-zinc-300 hover:text-white transition-colors border border-zinc-800" title={isFull ? "Exit Fullscreen" : "Fullscreen"}>
            {isFull ? <Minimize2 className="w-2.5 h-2.5" /> : <Maximize2 className="w-2.5 h-2.5" />}
          </button>
        </div>
      </div>

      <div className={`absolute bottom-0 left-0 right-0 p-1 sm:p-1.5 flex items-center justify-between pointer-events-none text-[9px] text-zinc-400 bg-gradient-to-t from-black/80 via-black/20 to-transparent z-10 transition-all duration-500 ${hidden ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}>
        <LiveClock />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQualityChange(qualityPreference === "1080p" ? "720p" : qualityPreference === "720p" ? "auto" : "1080p");
          }}
          className="pointer-events-auto px-1.5 py-0.5 rounded bg-black/75 hover:bg-black/95 text-zinc-300 hover:text-white border border-zinc-800 transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-sm"
          title="Quality: cycle 1080p FHD / 720p HD / Auto"
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${qualityPreference === "1080p" ? "bg-emerald-400" : qualityPreference === "720p" ? "bg-cyan-400" : "bg-amber-400 animate-pulse"}`} />
          <span className="font-semibold text-white tracking-wider">{qualityLabel}</span>
          <span className="text-[8px] text-zinc-400 font-bold uppercase">{qualityPreference === "1080p" ? "MAX" : qualityPreference === "720p" ? "HD" : "AUTO"}</span>
        </button>
      </div>

      {status !== "live" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 bg-black/95 text-center">
          {status === "loading" ? (
            <div className="space-y-1.5">
              <span className="w-4 h-4 border border-zinc-400 border-t-transparent rounded-full animate-spin inline-block" />
              <p className="text-[10px] text-zinc-400 tracking-wider">CONNECTING FEED…</p>
            </div>
          ) : (
            <div className="max-w-xs space-y-2">
              <p className="text-[10px] text-zinc-300 leading-relaxed">{message || "SIGNAL INTERRUPTED"}</p>
              <button onClick={retry} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[10px] transition-colors border border-zinc-800">
                <RotateCw className="w-2.5 h-2.5" />
                <span>Retry</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
