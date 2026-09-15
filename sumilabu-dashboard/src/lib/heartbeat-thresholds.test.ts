import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXPECTED_HEARTBEAT_SECONDS,
  DEFAULT_STALE_AFTER_SECONDS,
  MAX_REPORTED_INTERVAL_SECONDS,
  globalHeartbeat,
  heartbeatThresholds,
  isFresh,
  reportedIntervalSeconds,
} from "./heartbeat-thresholds";

const NOW = Date.parse("2026-09-15T16:00:00Z");
const MINUTE = 60;
const seenAgo = (seconds: number) => new Date(NOW - seconds * 1000);

const DEFAULTS = globalHeartbeat({});
/* Production's STALE_AFTER_SECONDS is Sensitive and unreadable; the old example set 600. */
const PRODUCTION_MAYBE = globalHeartbeat({ STALE_AFTER_SECONDS: "600", EXPECTED_HEARTBEAT_SECONDS: "300" });

describe("the global fallback", () => {
  it("defaults to a 30-minute heartbeat and a 90-minute stale window", () => {
    expect(DEFAULTS).toEqual({ expectedSeconds: DEFAULT_EXPECTED_HEARTBEAT_SECONDS, staleAfterSeconds: DEFAULT_STALE_AFTER_SECONDS });
    expect(DEFAULTS).toEqual({ expectedSeconds: 1800, staleAfterSeconds: 5400 });
  });

  it("honours values set in the environment", () => {
    expect(PRODUCTION_MAYBE).toEqual({ expectedSeconds: 300, staleAfterSeconds: 600 });
  });

  it("falls back to the default for an unreadable value rather than marking every device offline", () => {
    for (const raw of ["", "  ", "abc", "0", "-5"]) {
      expect(globalHeartbeat({ STALE_AFTER_SECONDS: raw }).staleAfterSeconds).toBe(DEFAULT_STALE_AFTER_SECONDS);
    }
  });
});

describe("a device that reports no interval", () => {
  it("is judged by the global values", () => {
    expect(heartbeatThresholds(null, PRODUCTION_MAYBE)).toEqual({ expectedSeconds: 300, staleAfterSeconds: 600, reported: false });
    expect(heartbeatThresholds(undefined, DEFAULTS)).toEqual({ expectedSeconds: 1800, staleAfterSeconds: 5400, reported: false });
  });

  it("treats a value that is not a usable number of seconds as no report", () => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "1800", MAX_REPORTED_INTERVAL_SECONDS + 1]) {
      expect(reportedIntervalSeconds(value)).toBeNull();
      expect(heartbeatThresholds(value, DEFAULTS).reported).toBe(false);
    }
  });

  it("on a 30-minute cadence against a 600 s window, reads offline between beats: the fault this fixes", () => {
    const thresholds = heartbeatThresholds(null, PRODUCTION_MAYBE);
    expect(isFresh(seenAgo(11 * MINUTE), NOW, thresholds)).toBe(false);
  });
});

describe("a device reporting a 30-minute interval", () => {
  it("expects a beat every 30 minutes and goes stale after three missed", () => {
    expect(heartbeatThresholds(1800, DEFAULTS)).toEqual({ expectedSeconds: 1800, staleAfterSeconds: 5400, reported: true });
  });

  it("keeps its own window even when the global one is 600 s", () => {
    const thresholds = heartbeatThresholds(1800, PRODUCTION_MAYBE);
    expect(thresholds).toEqual({ expectedSeconds: 1800, staleAfterSeconds: 5400, reported: true });
    expect(isFresh(seenAgo(40 * MINUTE), NOW, thresholds)).toBe(true);
    expect(isFresh(seenAgo(90 * MINUTE), NOW, thresholds)).toBe(true);
    expect(isFresh(seenAgo(90 * MINUTE + 1), NOW, thresholds)).toBe(false);
  });

  it("scales for a longer interval, and reads whole seconds", () => {
    expect(heartbeatThresholds(3600, DEFAULTS).staleAfterSeconds).toBe(10_800);
    expect(heartbeatThresholds(1800.9, DEFAULTS).expectedSeconds).toBe(1800);
  });
});

describe("a device reporting a very small interval", () => {
  it("is expected at its own cadence but never goes stale sooner than the global window", () => {
    expect(heartbeatThresholds(5, DEFAULTS)).toEqual({ expectedSeconds: 5, staleAfterSeconds: 5400, reported: true });
    expect(heartbeatThresholds(5, PRODUCTION_MAYBE)).toEqual({ expectedSeconds: 5, staleAfterSeconds: 600, reported: true });
    expect(isFresh(seenAgo(60), NOW, heartbeatThresholds(5, PRODUCTION_MAYBE))).toBe(true);
  });

  it("accepts one second and nothing below it", () => {
    expect(reportedIntervalSeconds(1)).toBe(1);
    expect(reportedIntervalSeconds(0.5)).toBeNull();
  });
});

describe("freshness", () => {
  it("is false for a device never seen", () => {
    expect(isFresh(null, NOW, DEFAULTS)).toBe(false);
    expect(isFresh(undefined, NOW, DEFAULTS)).toBe(false);
  });
});
