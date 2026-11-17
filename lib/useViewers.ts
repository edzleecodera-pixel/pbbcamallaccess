"use client";

import { useEffect, useState } from "react";

export function useViewers(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let stored = "";
    try {
      stored = sessionStorage.getItem("pbb_viewer_sid") || "";
    } catch {
      stored = "";
    }

    if (!stored) {
      stored = globalThis.crypto?.randomUUID?.() || `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try {
        sessionStorage.setItem("pbb_viewer_sid", stored);
      } catch {
        /* ignore */
      }
    }

    let alive = true;

    const beat = () => {
      fetch("/api/viewers/heartbeat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sid: stored }),
        cache: "no-store",
        keepalive: true,
      }).catch(() => undefined);
    };

    const poll = async () => {
      try {
        const res = await fetch("/api/viewers", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (alive && typeof data?.count === "number") setCount(data.count);
      } catch {
        /* ignore */
      }
    };

    beat();
    poll();

    const beatTimer = setInterval(beat, 20000);
    const pollTimer = setInterval(poll, 15000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        beat();
        poll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      clearInterval(beatTimer);
      clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return count;
}
