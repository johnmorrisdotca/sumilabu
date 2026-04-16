"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const OPTIONS_MS = [
  0,
  30000,
  60000,
  120000,
  300000,
] as const;

function labelFor(ms: number): string {
  if (ms <= 0) {
    return "Off";
  }
  if (ms < 60000) {
    return `${ms / 1000}s`;
  }
  return `${ms / 60000}m`;
}

type AutoRefreshControlProps = {
  defaultMs?: number;
};

export function AutoRefreshControl({ defaultMs = 60000 }: AutoRefreshControlProps) {
  const router = useRouter();
  const safeDefaultMs = OPTIONS_MS.includes(defaultMs as (typeof OPTIONS_MS)[number]) ? defaultMs : 60000;

  const [refreshMs, setRefreshMs] = useState<number>(safeDefaultMs);

  useEffect(() => {
    if (refreshMs <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      router.refresh();
    }, refreshMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [refreshMs, router]);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
      <label className="flex items-center gap-2">
        <span className="uppercase tracking-[0.12em] text-stone-500">Auto refresh</span>
        <select
          aria-label="Auto refresh interval"
          className="rounded-full border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-800 outline-none transition focus:border-stone-500"
          value={refreshMs}
          onChange={(event) => {
            const next = Number(event.target.value);
            setRefreshMs(next);
          }}
        >
          {OPTIONS_MS.map((value) => (
            <option key={value} value={value}>
              {labelFor(value)}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="rounded-full border border-stone-300 px-2.5 py-1.5 text-xs text-stone-700 transition hover:border-stone-500 hover:bg-white"
        onClick={() => {
          router.refresh();
        }}
      >
        Refresh now
      </button>

      <span className="font-mono text-[11px] text-stone-500">interval: {labelFor(refreshMs)}</span>
    </div>
  );
}
