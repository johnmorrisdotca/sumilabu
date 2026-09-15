"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  DEFAULT_REFRESH_MS,
  IDLE_STOP_MS,
  MINUTE_MS,
  REFRESH_OPTIONS_MS,
  createRefreshScheduler,
  refreshLabel,
  safeRefreshMs,
  type RefreshScheduler,
  type RefreshState,
} from "@/lib/auto-refresh";

/* What counts as somebody being here. The tab being shown is listened for
   separately; pointer movement is not, since a cursor resting on a
   wall-mounted screen is not a reader. */
const WAKE_EVENTS = ["click", "keydown", "wheel", "focus"] as const;

type AutoRefreshControlProps = {
  defaultMs?: number;
};

function stateLabel(state: RefreshState, refreshMs: number): string {
  if (state === "off") return "auto refresh off";
  if (state === "hidden") return "paused while hidden";
  if (state === "idle") return `paused after ${IDLE_STOP_MS / MINUTE_MS}m idle - click to resume`;
  return `every ${refreshLabel(refreshMs)}`;
}

export function AutoRefreshControl({ defaultMs = DEFAULT_REFRESH_MS }: AutoRefreshControlProps) {
  const router = useRouter();
  const [refreshMs, setRefreshMs] = useState<number>(() => safeRefreshMs(defaultMs));
  const [state, setState] = useState<RefreshState>(refreshMs > 0 ? "running" : "off");
  const schedulerRef = useRef<RefreshScheduler | null>(null);

  useEffect(() => {
    const scheduler = createRefreshScheduler({
      intervalMs: refreshMs,
      refresh: () => router.refresh(),
      now: () => Date.now(),
      isVisible: () => document.visibilityState === "visible",
      setTimer: (run, ms) => window.setTimeout(run, ms),
      clearTimer: (handle) => window.clearTimeout(handle as number),
      onState: setState,
    });
    const wake = () => scheduler.wake();
    const visibilityChanged = () => scheduler.visibilityChanged();

    for (const name of WAKE_EVENTS) window.addEventListener(name, wake, { passive: true });
    document.addEventListener("visibilitychange", visibilityChanged);
    schedulerRef.current = scheduler;
    scheduler.start();

    return () => {
      for (const name of WAKE_EVENTS) window.removeEventListener(name, wake);
      document.removeEventListener("visibilitychange", visibilityChanged);
      scheduler.stop();
      schedulerRef.current = null;
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
            setRefreshMs(safeRefreshMs(Number(event.target.value)));
          }}
        >
          {REFRESH_OPTIONS_MS.map((value) => (
            <option key={value} value={value}>
              {refreshLabel(value)}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="rounded-full border border-stone-300 px-2.5 py-1.5 text-xs text-stone-700 transition hover:border-stone-500 hover:bg-white"
        onClick={() => {
          if (schedulerRef.current) schedulerRef.current.refreshByHand();
          else router.refresh();
        }}
      >
        Refresh now
      </button>

      <span className="font-mono text-[11px] text-stone-500">{stateLabel(state, refreshMs)}</span>
    </div>
  );
}
