"use client";

import { useState } from "react";
import { ChevronUp, Megaphone } from "lucide-react";

const TEXT =
  "Next Update of this project, I will put a Global Live Chat where everyone can have a conversations each other. To support this project you are free to donate hehehe";

export default function AnnouncementBanner() {
  const [open, setOpen] = useState(true);

  return (
    <div className="shrink-0 border-b border-amber-500/20 bg-gradient-to-r from-amber-950/50 via-zinc-950 to-amber-950/40">
      <div className="flex items-center gap-2 px-2 sm:px-4 py-1.5">
        <Megaphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest text-amber-400 shrink-0">
          Announcement
        </span>

        <div className="relative flex-1 min-w-0 overflow-hidden">
          {open ? (
            <div className="overflow-hidden whitespace-nowrap">
              <div className="marquee inline-flex gap-20 sm:gap-0">
                <span className="text-[11px] sm:text-xs text-amber-100/90">{TEXT}</span>
                <span className="text-[11px] sm:text-xs text-amber-100/90 sm:hidden">{TEXT}</span>
              </div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title={open ? "Collapse announcement" : "Show announcement"}
          className="p-1 rounded text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/10 transition-colors shrink-0 cursor-pointer"
        >
          <ChevronUp className={`w-3 h-3 transition-transform ${open ? "" : "rotate-180"}`} />
        </button>
      </div>
    </div>
  );
}
