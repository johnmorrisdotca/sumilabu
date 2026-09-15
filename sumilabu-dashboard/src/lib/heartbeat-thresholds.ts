/**
 * How long a device may be silent before the dashboard calls it offline.
 *
 * A device that reports its heartbeat interval is judged by it: expected is
 * that interval, and stale is three of them, never less than the global stale
 * window. A device that reports nothing is judged by the global
 * EXPECTED_HEARTBEAT_SECONDS / STALE_AFTER_SECONDS.
 *
 * Per device, because the fleet no longer shares one cadence: InkyFrames
 * flashed before 2026-09-15 beat every 5 minutes, re-flashed ones and Onibako
 * hosts every 30. One window marks some of them offline between beats, and
 * production's STALE_AFTER_SECONDS is a Sensitive variable nobody can read.
 *
 * Never less than the global window, because a device reporting a tiny
 * interval must not be called offline faster than the site-wide rule allows.
 */

export const STALE_AFTER_HEARTBEATS = 3;

/** A reported interval longer than a day is not a heartbeat; it is ignored. */
export const MAX_REPORTED_INTERVAL_SECONDS = 24 * 60 * 60;

export const DEFAULT_EXPECTED_HEARTBEAT_SECONDS = 1800;
export const DEFAULT_STALE_AFTER_SECONDS = 5400;

export type GlobalHeartbeat = { expectedSeconds: number; staleAfterSeconds: number };

export type HeartbeatThresholds = GlobalHeartbeat & {
  /** True when these came from the device's own report, false for the global fallback. */
  reported: boolean;
};

/** The interval a device reported, or null when there is none or it is not a usable number of seconds. */
export function reportedIntervalSeconds(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const seconds = Math.floor(value);
  return seconds >= 1 && seconds <= MAX_REPORTED_INTERVAL_SECONDS ? seconds : null;
}

/* An unset, empty or unreadable value falls back to the default. Reading it
   as Number() alone would give NaN or 0, and every device would be offline. */
function positiveSeconds(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function globalHeartbeat(env: Record<string, string | undefined>): GlobalHeartbeat {
  return {
    expectedSeconds: positiveSeconds(env.EXPECTED_HEARTBEAT_SECONDS, DEFAULT_EXPECTED_HEARTBEAT_SECONDS),
    staleAfterSeconds: positiveSeconds(env.STALE_AFTER_SECONDS, DEFAULT_STALE_AFTER_SECONDS),
  };
}

export function heartbeatThresholds(reported: unknown, global: GlobalHeartbeat): HeartbeatThresholds {
  const interval = reportedIntervalSeconds(reported);
  if (interval === null) return { ...global, reported: false };
  return {
    expectedSeconds: interval,
    staleAfterSeconds: Math.max(interval * STALE_AFTER_HEARTBEATS, global.staleAfterSeconds),
    reported: true,
  };
}

/** Seen within the stale window. A device never seen is not fresh. */
export function isFresh(lastSeenAt: Date | null | undefined, nowMs: number, thresholds: Pick<GlobalHeartbeat, "staleAfterSeconds">): boolean {
  if (!lastSeenAt) return false;
  return nowMs - lastSeenAt.getTime() <= thresholds.staleAfterSeconds * 1000;
}
