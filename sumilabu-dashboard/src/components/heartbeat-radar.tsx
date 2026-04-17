"use client";

import { useState } from "react";

type HeartbeatSlot = {
  count: number;
  label: string;
  hasPing: boolean;
  fromTime: string;
  toTime: string;
  events: string[];
  memFreeMin: number | null;
  memFreeMax: number | null;
};

type HeartbeatRadarProps = {
  deviceId: string;
  status: "healthy" | "warning" | "offline";
  timeline: HeartbeatSlot[];
};

function eventSummary(events: string[]): string {
  const counts = new Map<string, number>();
  for (const e of events) {
    counts.set(e, (counts.get(e) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name} ×${count}`)
    .join(", ");
}

export function HeartbeatRadar({ deviceId, status, timeline }: HeartbeatRadarProps) {
  const lastIndex = timeline.length - 1;
  const [pinned, setPinned] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const active = hovered ?? pinned ?? lastIndex;
  const activeSlot = timeline[active] ?? timeline.at(-1) ?? null;

  return (
    <div>
      <div className="relative flex gap-0.5">
        {timeline.map((slot, slotIndex) => (
          <div
            key={`${deviceId}-${slotIndex}`}
            className={`h-5 flex-1 min-w-[4px] rounded-full border cursor-pointer transition-opacity ${slot.hasPing ? "border-emerald-300 bg-emerald-500" : status === "offline" ? "border-red-200 bg-red-300" : "border-amber-200 bg-amber-300"} ${slotIndex !== active ? "opacity-40" : ""}`}
            onMouseEnter={() => setHovered(slotIndex)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => setPinned(pinned === slotIndex ? null : slotIndex)}
          />
        ))}
      </div>

      <div className="mt-2 flex justify-between text-[11px] uppercase tracking-[0.16em] text-stone-500">
        <span>{timeline[0]?.label || "-"}</span>
        <span>{timeline.at(-1)?.label || "now"}</span>
      </div>

      {activeSlot ? (
        <div className="mt-2 rounded-xl border border-stone-200 bg-white/95 px-3 py-2 text-xs text-stone-700 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-stone-900">{activeSlot.fromTime} – {activeSlot.toTime}</span>
            <span>{activeSlot.count} ping{activeSlot.count === 1 ? "" : "s"}</span>
            {activeSlot.events.length > 0 && (
              <span className="text-stone-500">{eventSummary(activeSlot.events)}</span>
            )}
            {activeSlot.memFreeMin !== null && (
              <span className="font-mono text-stone-500">
                mem {activeSlot.memFreeMin === activeSlot.memFreeMax
                  ? activeSlot.memFreeMin.toLocaleString()
                  : `${activeSlot.memFreeMin.toLocaleString()}–${activeSlot.memFreeMax!.toLocaleString()}`}
              </span>
            )}
            {!activeSlot.hasPing && (
              <span className="font-semibold text-amber-700">No activity in this window</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
