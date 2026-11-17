"use client";

import { useEffect, useState } from "react";
import { Download, Heart, Sparkles, X, ZoomIn } from "lucide-react";

const QR_SRC = process.env.NEXT_PUBLIC_GCASH_QR_URL || "/gcash-qr.png";

function Qr({ large = false }: { large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const size = large ? "w-60 h-60 sm:w-64 sm:h-64" : "w-40 h-40";

  if (failed) {
    return (
      <div className={`${size} bg-zinc-200 text-zinc-600 rounded flex flex-col items-center justify-center text-center gap-1 px-3`}>
        <span className="text-[10px] font-bold uppercase tracking-wider">GCash QR</span>
        <span className="text-[10px] leading-tight">
          Add your QR at
          <br />
          <code className="text-[9px]">public/gcash-qr.png</code>
        </span>
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={QR_SRC}
      alt="GCash QR Code"
      onError={() => setFailed(true)}
      className={`${size} object-contain rounded`}
    />
  );
}

export default function SupportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (zoomed) setZoomed(false);
      else onClose();
    };

    if (open) {
      window.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "unset";
    };
  }, [open, onClose, zoomed]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-sm bg-zinc-950/95 border border-zinc-800 rounded-2xl shadow-2xl p-5 text-zinc-100 flex flex-col gap-4 animate-in zoom-in-95 duration-150"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-rose-500 fill-rose-500 shrink-0" />
              <h2 className="text-xs font-bold tracking-wider uppercase text-white">Support the Stream</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              title="Close (Esc)"
              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3.5 rounded-xl bg-gradient-to-br from-rose-950/30 via-zinc-900/60 to-purple-950/20 border border-rose-500/25 space-y-1.5">
            <div className="flex items-center gap-2 text-rose-300 font-semibold text-xs">
              <Sparkles className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>Help Keep the Website Running</span>
            </div>
            <p className="text-zinc-200 text-xs leading-relaxed font-sans">
              If you enjoy watching the live cameras together on one screen, feel free to donate to help cover server hosting and bandwidth costs!
            </p>
            <p className="text-zinc-400 text-[11px] font-sans">
              Any amount is greatly appreciated and directly keeps the streams live for everyone. Maraming salamat!
            </p>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-zinc-600 uppercase">
            <div className="flex-1 h-px bg-zinc-800" />
            <span>Scan to donate via GCash</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          <div className="flex flex-col items-center gap-2.5 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <div
              onClick={() => setZoomed(true)}
              className="relative p-2 bg-white rounded-lg shadow-md cursor-zoom-in group transition-transform hover:scale-[1.02] active:scale-[0.98]"
              title="Click to enlarge QR"
            >
              <Qr />
              <div className="absolute inset-0 bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-[11px] font-semibold">
                <ZoomIn className="w-4 h-4" />
                <span>Enlarge</span>
              </div>
            </div>

            <div className="flex items-center justify-between w-full text-[11px] text-zinc-400 px-1">
              <button
                type="button"
                onClick={() => setZoomed(true)}
                className="text-[10px] uppercase hover:text-white transition-colors cursor-pointer flex items-center gap-1"
              >
                <ZoomIn className="w-3 h-3" />
                <span>Tap to enlarge</span>
              </button>
              <a
                href={QR_SRC}
                download="gcash-qr.png"
                className="inline-flex items-center gap-1 text-zinc-300 hover:text-white transition-colors"
              >
                <Download className="w-3 h-3" />
                <span>Save QR</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {zoomed && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
          onClick={() => setZoomed(false)}
        >
          <div
            className="relative bg-zinc-950 border border-zinc-800 p-5 rounded-2xl shadow-2xl flex flex-col items-center gap-3 max-w-xs sm:max-w-sm w-full text-center"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-2 border-b border-zinc-800">
              <span className="text-white text-xs font-bold uppercase tracking-wider">GCash QR Code</span>
              <button
                type="button"
                onClick={() => setZoomed(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-white rounded-xl shadow-lg">
              <Qr large />
            </div>

            <p className="text-zinc-400 text-xs font-sans">Scan with your GCash app to send your support.</p>

            <div className="flex items-center gap-2 w-full pt-1">
              <a
                href={QR_SRC}
                download="gcash-qr.png"
                className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-blue-600/30"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save Image</span>
              </a>
              <button
                type="button"
                onClick={() => setZoomed(false)}
                className="flex-1 py-2 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs border border-zinc-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
