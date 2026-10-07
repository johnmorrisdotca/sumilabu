import { describe, expect, it } from "vitest";

import { reviveDates } from "./dashboard-data";

describe("dates that crossed the data cache", () => {
  it("turns the named text fields back into Dates and leaves null and the rest alone", () => {
    const at = new Date("2026-10-07T08:32:12.000Z");
    const cached = JSON.parse(JSON.stringify({ id: "a", lastSeenAt: at, createdAt: null, name: "x" }));
    const row = reviveDates(cached, ["lastSeenAt", "createdAt"]);
    expect(row.lastSeenAt).toEqual(at);
    expect(row.createdAt).toBeNull();
    expect(row.name).toBe("x");
  });
});
