"use client";

import { useEffect, useState } from "react";

type LiveClockProps = {
  utcOffsetHours: number;
};

function formatTimeWithSeconds(utcOffsetHours: number): string {
  const now = new Date();
  const shifted = new Date(now.getTime() + utcOffsetHours * 3600_000);
  const h = String(shifted.getUTCHours()).padStart(2, "0");
  const m = String(shifted.getUTCMinutes()).padStart(2, "0");
  const s = String(shifted.getUTCSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function LiveClock({ utcOffsetHours }: LiveClockProps) {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    function tick() {
      setTime(formatTimeWithSeconds(utcOffsetHours));
    }
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [utcOffsetHours]);

  return (
    <span className="font-mono text-3xl font-semibold leading-none tabular-nums text-stone-900 md:text-4xl">
      {time ?? "--:--:--"}
    </span>
  );
}
