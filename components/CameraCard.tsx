"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Maximize2,
  Minimize2,
  RotateCw,
  Star,
  Volume1,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Channel } from "@/lib/channels";
import { installFilters, loadShaka } from "@/lib/player";
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
  onQualityChange: (quality: Quality) => void;
};

const MAX_AUTO_RETRIES = 6;

const qualityLabel = (quality: Quality): string =>
  quality === "1080p" ? "1080p FHD" : quality === "720p" ? "720p HD" : "AUTO";

export default function CameraCard({
  channel,
  isSoundOn,
  onToggleSound,
  isFeatured,
  onSetFeatured,
  canFeature,
  fitMode,
  isSingleView,
  isIdle,
  qualityPreference,
  onQualityChange,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<any>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRetries = useRef(0);

  const [status, setStatus] = useState<"loading" | "live" | "error">("loading");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [proxyMode, setProxyMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [volume, setVolume] = useState(1);
  const [trackLabel, setTrackLabel] = useState(qualityLabel(qualityPreference));

  const soundRef = useRef(isSoundOn);
  const volumeRef = useRef(volume);
  const qualityRef = useRef(qualityPreference);
  const proxyRef = useRef(proxyMode);

  soundRef.current = isSoundOn;
  volumeRef.current = volume;
  qualityRef.current = qualityPreference;
  proxyRef.current = proxyMode;

  const scheduleRetry = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);

    if (autoRetries.current >= MAX_AUTO_RETRIES) {
      setStatus("error");
      setMessage("Feed unavailable. Tap retry.");
      return;
    }

    const delay = Math.min(10000, 700 * Math.pow(1.9, autoRetries.current));
    autoRetries.current += 1;
    setStatus("loading");
    setMessage(`Reconnecting (${autoRetries.current}/${MAX_AUTO_RETRIES})…`);

    retryTimer.current = setTimeout(() => setAttempt((value) => value + 1), delay);
  }, []);

  useEffect(() => {
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, []);

  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    try {
      const stored = parseFloat(localStorage.getItem(`pbb-player-volume-${channel.id}`) || "1");
      if (!Number.isNaN(stored) && stored >= 0 && stored <= 1) setVolume(stored);
    } catch {
      /* ignore */
    }
  }, [channel.id]);

  useEffect(() => {
    let disposed = false;
    let player: any = null;
    let watchdog: ReturnType<typeof setInterval> | null = null;
    let lastProgress = Date.now();

    const boot = async () => {
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

        player.addEventListener("error", (event: any) => {
          if (disposed) return;

          const detail = event?.detail;
          if (detail?.severity && detail.severity !== 2) return;

          const code = detail?.code;
          const httpStatus = detail?.data?.[1];

          if ((code === 1001 || code === 1002) && (httpStatus === 403 || httpStatus === 401)) {
            if (!proxyRef.current) {
              setProxyMode(true);
              return;
            }
            scheduleRetry();
            return;
          }

          if (code === 4012 || code === 3015) {
            scheduleRetry();
            return;
          }

          scheduleRetry();
        });

        const markLive = () => {
          if (disposed) return;
          autoRetries.current = 0;
          setStatus("live");
        };

        video.onplaying = markLive;
        video.onloadeddata = markLive;
        video.ontimeupdate = () => {
          lastProgress = Date.now();
          if (video.currentTime > 0) markLive();
        };

        const res = await fetch(
          `/api/stream?channel=${encodeURIComponent(channel.id)}&proxy=${proxyRef.current ? 1 : 0}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`API ${res.status}`);

        const info: any = await res.json();
        if (disposed) return;

        const clearKeys = info?.clearKeys;
        const drm =
          info?.requiresDrm && clearKeys && Object.keys(clearKeys).length > 0 ? { clearKeys } : {};

        const quality = qualityRef.current;

        player.configure({
          drm,
          abr: {
            enabled: quality === "auto",
            defaultBandwidthEstimate: quality === "1080p" ? 16e6 : quality === "720p" ? 8e6 : 12e6,
            switchInterval: 4,
            restrictions: { maxHeight: quality === "720p" ? 720 : 1080, minHeight: 0 },
          },
          streaming: {
            bufferingGoal: 18,
            rebufferingGoal: 2,
            bufferBehind: 10,
            lowLatencyMode: false,
            retryParameters: { maxAttempts: 8, baseDelay: 400, backoffFactor: 2, timeout: 20000 },
            stallEnabled: true,
            stallThreshold: 1,
            safeSeekOffset: 12,
            inaccurateManifestTolerance: 0,
            jumpLargeGaps: true,
          },
          manifest: {
            dash: { autoCorrectDrift: true, defaultPresentationDelay: 12, ignoreMinBufferTime: true },
            retryParameters: { maxAttempts: 8, baseDelay: 400, backoffFactor: 2 },
          },
        });

        installFilters(player, shaka, info);

        const applyTrack = () => {
          try {
            const tracks = player
              .getVariantTracks()
              .filter((track: any) => track.type === "video" || track.height);
            if (!tracks.length) return;

            const cap = qualityRef.current === "720p" ? 720 : 1080;
            const chosen = tracks
              .filter((track: any) => !track.height || track.height <= cap)
              .sort(
                (a: any, b: any) =>
                  (b.height || 0) - (a.height || 0) || (b.bandwidth || 0) - (a.bandwidth || 0)
              )[0];
            if (!chosen) return;

            player.selectVariantTrack(chosen, false);
            if (chosen.height) {
              setTrackLabel(
                chosen.height >= 1080 ? "1080p FHD" : chosen.height >= 720 ? "720p HD" : `${chosen.height}p`
              );
            }
          } catch {
            /* ignore */
          }
        };

        let loaded = false;
        const candidates = Array.from(
          new Set([info?.manifestUri, info?.proxiedManifestUri].filter(Boolean))
        );

        for (const uri of candidates) {
          for (let i = 0; i < 2 && !loaded; i++) {
            try {
              await player.load(uri as string);
              loaded = true;
            } catch {
              if (disposed) return;
              await new Promise((r) => setTimeout(r, 700));
            }
          }
          if (loaded) break;
        }

        if (!loaded) throw new Error("Connection interrupted");
        if (disposed) return;

        applyTrack();
        player.addEventListener("variantchanged", applyTrack);

        const seekLive = () => {
          try {
            const range = player.seekRange();
            if (!range || !isFinite(range.end)) return;
            if (video.currentTime < range.end - 12 || video.currentTime > range.end) {
              video.currentTime = Math.max(range.start, range.end - 4);
            }
          } catch {
            /* ignore */
          }
        };

        if (video) {
          video.muted = !soundRef.current;
          if (soundRef.current) video.volume = volumeRef.current > 0 ? volumeRef.current : 1;
          try {
            await video.play();
          } catch {
            video.muted = true;
            await video.play().catch(() => undefined);
          }
        }

        setTimeout(seekLive, 1200);
        lastProgress = Date.now();

        watchdog = setInterval(() => {
          if (disposed || !video || document.visibilityState !== "visible") return;

          try {
            const range = player.seekRange?.();
            if (range && isFinite(range.end) && range.end - video.currentTime > 20) {
              video.currentTime = Math.max(range.start, range.end - 4);
              lastProgress = Date.now();
            }
          } catch {
            /* ignore */
          }

          if (video.paused) video.play().catch(() => undefined);

          // Nothing buffered for 12s -> rebuild the pipeline.
          if (Date.now() - lastProgress > 12000) {
            lastProgress = Date.now();
            scheduleRetry();
          }
        }, 8000);

        setStatus("live");
      } catch (error: any) {
        if (disposed) return;
        if (error?.message) setMessage(error.message);
        scheduleRetry();
      }
    };

    boot();

    return () => {
      disposed = true;
      if (watchdog) clearInterval(watchdog);
      try {
        player?.destroy?.();
      } catch {
        /* ignore */
      }
    };
  }, [channel.id, proxyMode, attempt, scheduleRetry]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const apply = () => {
      video.muted = !isSoundOn;
      if (isSoundOn) {
        video.volume = volume > 0 ? volume : 1;
        video.play().catch(() => undefined);
      }
    };

    apply();
    video.addEventListener("canplay", apply);
    video.addEventListener("playing", apply);
    return () => {
      video.removeEventListener("canplay", apply);
      video.removeEventListener("playing", apply);
    };
  }, [isSoundOn, volume, status]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    try {
      const tracks = player
        .getVariantTracks()
        .filter((track: any) => track.type === "video" || track.height);
      if (!tracks.length) return;

      if (qualityPreference === "auto") {
        player.configure({ abr: { enabled: true, restrictions: { maxHeight: 1080, minHeight: 0 } } });
        return;
      }

      const cap = qualityPreference === "720p" ? 720 : 1080;
      const chosen = tracks
        .filter((track: any) => !track.height || track.height <= cap)
        .sort((a: any, b: any) => (b.height || 0) - (a.height || 0))[0];

      if (chosen) {
        player.selectVariantTrack(chosen, false);
        player.configure({ abr: { enabled: false, restrictions: { maxHeight: cap, minHeight: 0 } } });
      }
    } catch {
      /* ignore */
    }
  }, [qualityPreference]);

  const applyVolume = (value: number) => {
    const next = Math.max(0, Math.min(1, value));
    setVolume(next);

    try {
      localStorage.setItem(`pbb-player-volume-${channel.id}`, String(next));
      localStorage.setItem("pbb-player-volume", String(next));
    } catch {
      /* ignore */
    }

    const video = videoRef.current;
    if (!video) return;

    video.volume = next;
    if (next > 0) {
      video.muted = false;
      if (!isSoundOn) onToggleSound(channel.id);
    } else {
      video.muted = true;
      if (isSoundOn) onToggleSound(channel.id);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;

    if (isSoundOn && volume > 0) {
      if (video) video.muted = true;
      onToggleSound(channel.id);
      return;
    }

    const next = volume > 0 ? volume : 1;
    setVolume(next);
    if (video) {
      video.muted = false;
      video.volume = next;
      video.play().catch(() => undefined);
    }
    if (!isSoundOn) onToggleSound(channel.id);
  };

  const manualRetry = () => {
    autoRetries.current = 0;
    setMessage("");
    setStatus("loading");
    try {
      playerRef.current?.destroy?.();
    } catch {
      /* ignore */
    }
    setAttempt((value) => value + 1);
  };

  const toggleFullscreen = async () => {
    const node = wrapRef.current;
    if (!node) return;

    if (document.fullscreenElement === node) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }

    try {
      await node.requestFullscreen();
    } catch {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      await node.requestFullscreen().catch(() => undefined);
    }
  };

  const clampOffset = (nextScale: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const maxX = (rect.width * (nextScale - 1)) / 2;
    const maxY = (rect.height * (nextScale - 1)) / 2;
    setOffset((current) => ({
      x: Math.max(-maxX, Math.min(maxX, current.x)),
      y: Math.max(-maxY, Math.min(maxY, current.y)),
    }));
  };

  const onWheel = (event: React.WheelEvent<HTMLVideoElement>) => {
    event.preventDefault();
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;

    const px = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const py = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const next = Math.min(4, Math.max(1, Number((scale + (event.deltaY < 0 ? 0.35 : -0.35)).toFixed(2))));

    if (next === 1) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      return;
    }

    setScale(next);
    setOffset({ x: (0.5 - px) * rect.width * (next - 1), y: (0.5 - py) * rect.height * (next - 1) });
    clampOffset(next);
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLVideoElement>) => {
    if ((event.target as HTMLElement).closest('button, input, [role="button"]')) return;
    event.preventDefault();

    if (scale > 1) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      return;
    }

    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;

    const px = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const py = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));

    setScale(2.2);
    setOffset({ x: (0.5 - px) * rect.width * 1.2, y: (0.5 - py) * rect.height * 1.2 });
  };

  const dragStart = useRef({ x: 0, y: 0 });
  const dragOrigin = useRef({ x: 0, y: 0 });

  const onPointerDown = (event: React.PointerEvent<HTMLVideoElement>) => {
    if (scale <= 1) return;
    if ((event.target as HTMLElement).closest('button, input, [role="button"]')) return;

    setDragging(true);
    dragStart.current = { x: event.clientX, y: event.clientY };
    dragOrigin.current = { ...offset };

    const node = event.currentTarget as HTMLElement;
    if (node.setPointerCapture) node.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLVideoElement>) => {
    if (!dragging || scale <= 1) return;

    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;

    const maxX = (rect.width * (scale - 1)) / 2;
    const maxY = (rect.height * (scale - 1)) / 2;

    setOffset({
      x: Math.max(-maxX, Math.min(maxX, dragOrigin.current.x + (event.clientX - dragStart.current.x))),
      y: Math.max(-maxY, Math.min(maxY, dragOrigin.current.y + (event.clientY - dragStart.current.y))),
    });
  };

  const endDrag = () => setDragging(false);

  const hidden = Boolean(isIdle) && !volumeOpen;

  return (
    <div
      ref={wrapRef}
      className={`relative w-full h-full bg-black overflow-hidden group select-none flex items-center justify-center ${
        hidden ? "cursor-none" : ""
      }`}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
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
        className={`w-full h-full ${
          scale > 1 ? (dragging ? "cursor-grabbing touch-none" : "cursor-grab touch-none") : ""
        } ${fitMode === "contain" ? "object-contain" : "object-cover"}`}
      />

      <div
        className={`absolute top-0 left-0 right-0 p-1.5 sm:p-2 flex items-center justify-between pointer-events-none bg-gradient-to-b from-black/80 via-black/30 to-transparent z-10 transition-all duration-500 ${
          hidden ? "opacity-0 -translate-y-4" : "opacity-100 translate-y-0"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              status === "live" ? "bg-emerald-400 animate-pulse" : "bg-white animate-pulse"
            }`}
          />
          <span className="text-[10px] sm:text-xs font-medium tracking-wider text-white uppercase">
            {channel.name}
          </span>
          <span className="text-[9px] text-zinc-500 hidden sm:inline">{channel.code}</span>
          {status === "live" ? (
            <span className="text-[8px] font-bold tracking-widest text-emerald-400 border border-emerald-500/40 rounded px-1 py-px hidden sm:inline">
              LIVE
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 pointer-events-auto">
          {canFeature && !isFeatured && onSetFeatured ? (
            <button
              type="button"
              onClick={() => onSetFeatured(channel.id)}
              className="px-1.5 py-0.5 rounded text-[9px] bg-black/70 hover:bg-black text-zinc-300 hover:text-white flex items-center gap-1 transition-colors border border-zinc-800"
              title="Focus this camera as Main"
            >
              <Star className="w-2.5 h-2.5" />
              <span className="hidden sm:inline">Main</span>
            </button>
          ) : null}

          <div
            className={`flex items-center rounded-full transition-all duration-200 border ${
              isSoundOn && volume > 0
                ? "bg-black/90 border-zinc-700 text-white shadow-lg"
                : "bg-black/75 border-zinc-800 text-zinc-400"
            } backdrop-blur-md px-1.5 py-0.5 gap-1.5`}
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                toggleMute();
              }}
              className="p-1 rounded-full text-zinc-300 hover:text-white transition-colors flex items-center justify-center shrink-0 active:scale-95"
              title={isSoundOn ? "Mute" : "Unmute"}
            >
              {isSoundOn && volume > 0 ? (
                volume <= 0.5 ? (
                  <Volume1 className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-white" />
                )
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-zinc-400" />
              )}
            </button>

            <div
              className={`flex items-center gap-2 transition-all duration-200 overflow-hidden ${
                volumeOpen ? "max-w-[150px] opacity-100 pr-1" : "max-w-0 opacity-0"
              }`}
            >
              <div className="relative w-18 sm:w-22 h-5 flex items-center">
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden relative border border-zinc-700/60">
                  <div
                    className={`h-full rounded-full ${
                      !isSoundOn || volume === 0 ? "bg-zinc-600" : volume <= 0.5 ? "bg-amber-400" : "bg-white"
                    }`}
                    style={{ width: `${Math.round((isSoundOn ? volume : 0) * 100)}%` }}
                  />
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isSoundOn ? volume : 0}
                  onChange={(event) => applyVolume(parseFloat(event.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  aria-label="Volume Slider"
                />
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  applyVolume(volume >= 1 ? 0.5 : 1);
                }}
                className="text-[9px] text-zinc-300 hover:text-white tabular-nums min-w-[26px] text-right font-medium cursor-pointer"
              >
                {Math.round((isSoundOn ? volume : 0) * 100)}%
              </button>
            </div>
          </div>

          {isSingleView ? (
            <div className="flex items-center gap-0.5 bg-black/75 backdrop-blur-sm border border-zinc-800 p-0.5 rounded text-[10px]">
              <button
                type="button"
                onClick={() => {
                  const next = Math.max(1, scale - 0.5);
                  setScale(next);
                  clampOffset(next);
                }}
                disabled={scale <= 1}
                className={`p-1 rounded ${scale <= 1 ? "text-zinc-600" : "text-zinc-300 hover:text-white hover:bg-zinc-800"}`}
                title="Zoom Out"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = Math.min(4, scale + 0.5);
                  setScale(next);
                  clampOffset(next);
                }}
                disabled={scale >= 4}
                className={`p-1 rounded ${scale >= 4 ? "text-zinc-600" : "text-zinc-300 hover:text-white hover:bg-zinc-800"}`}
                title="Zoom In"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1 rounded bg-black/70 hover:bg-black text-zinc-300 hover:text-white transition-colors border border-zinc-800"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-2.5 h-2.5" /> : <Maximize2 className="w-2.5 h-2.5" />}
          </button>
        </div>
      </div>

      <div
        className={`absolute bottom-0 left-0 right-0 p-1 sm:p-1.5 flex items-center justify-between pointer-events-none text-[9px] text-zinc-400 bg-gradient-to-t from-black/80 via-black/20 to-transparent z-10 transition-all duration-500 ${
          hidden ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
        }`}
      >
        <LiveClock />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onQualityChange(
              qualityPreference === "1080p" ? "720p" : qualityPreference === "720p" ? "auto" : "1080p"
            );
          }}
          className="pointer-events-auto px-1.5 py-0.5 rounded bg-black/75 hover:bg-black/95 text-zinc-300 hover:text-white border border-zinc-800 transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-sm"
          title="Quality: cycle 1080p FHD / 720p HD / Auto"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              qualityPreference === "1080p"
                ? "bg-emerald-400"
                : qualityPreference === "720p"
                  ? "bg-cyan-400"
                  : "bg-amber-400 animate-pulse"
            }`}
          />
          <span className="font-semibold text-white tracking-wider">{trackLabel}</span>
          <span className="text-[8px] text-zinc-400 font-bold uppercase">
            {qualityPreference === "1080p" ? "MAX" : qualityPreference === "720p" ? "HD" : "AUTO"}
          </span>
        </button>
      </div>

      {status !== "live" ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 bg-black/95 text-center">
          {status === "loading" ? (
            <div className="space-y-1.5">
              <span className="w-4 h-4 border border-zinc-400 border-t-transparent rounded-full animate-spin inline-block" />
              <p className="text-[10px] text-zinc-400 tracking-wider">{message || "CONNECTING FEED…"}</p>
            </div>
          ) : (
            <div className="max-w-xs space-y-2">
              <p className="text-[10px] text-zinc-300 leading-relaxed">{message || "SIGNAL INTERRUPTED"}</p>
              <button
                type="button"
                onClick={manualRetry}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[10px] transition-colors border border-zinc-800"
              >
                <RotateCw className="w-2.5 h-2.5" />
                <span>Retry</span>
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
