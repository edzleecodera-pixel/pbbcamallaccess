"use client";
import { useEffect, useState } from "react";

export default function LiveClock() {
  const [now, setNow] = useState("--:--:-- PHT");
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    const tick = () => {
      try { setNow(fmt.format(new Date()) + " PHT"); }
      catch { setNow(new Date().toLocaleTimeString() + " PHT"); }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return <span>{now}</span>;
}
