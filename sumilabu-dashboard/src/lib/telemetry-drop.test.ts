import { describe, expect, it } from "vitest";

import { droppedEvents, isDroppedEvent } from "./telemetry-drop";

describe("telemetry events that are acknowledged and not stored", () => {
  it("drops UmaKuma's per-request events by default", () => {
    expect(isDroppedEvent("umakuma", "api_route", {})).toBe(true);
    expect(isDroppedEvent("umakuma", "study_review_history", {})).toBe(true);
    expect(isDroppedEvent("umakuma", "reading_signoffs_get_perf", {})).toBe(true);
  });

  it("keeps the same name from another project, and every other event", () => {
    expect(isDroppedEvent("onibako", "api_route", {})).toBe(false);
    expect(isDroppedEvent("umakuma", "heartbeat", {})).toBe(false);
  });

  it("lets the environment replace the list, or empty it", () => {
    expect(isDroppedEvent("umakuma", "api_route", { TELEMETRY_DROP_EVENTS: "none" })).toBe(false);
    expect(droppedEvents({ TELEMETRY_DROP_EVENTS: "none" })).toEqual([]);
    expect(isDroppedEvent("x", "noisy", { TELEMETRY_DROP_EVENTS: "noisy, umakuma:other" })).toBe(true);
    expect(isDroppedEvent("umakuma", "other", { TELEMETRY_DROP_EVENTS: "noisy, umakuma:other" })).toBe(true);
    expect(isDroppedEvent("umakuma", "api_route", { TELEMETRY_DROP_EVENTS: "noisy" })).toBe(false);
  });
});
