import { describe, expect, it } from "vitest";

import {
  FUNCTION_GROWTH_ALLOWED,
  FUNCTION_GROWTH_FLOOR_MB,
  FUNCTION_SIZE_LIMIT_MB,
  judgeFunctionSizes,
  matchBaseline,
  recordBaseline,
} from "./function-size-gate.mjs";

const api = (mb: number, name = "api/app-telemetry") => ({
  name,
  mb,
  routes: [name, "api/device-stats", "api/health", "api/health.rsc"],
});
const pages = (mb: number) => ({ name: "index", mb, routes: ["index", "index.rsc"] });

const baseline = {
  functions: [
    { name: "api/app-telemetry", mb: 90, sample: ["api/app-telemetry", "api/device-stats", "api/health"] },
    { name: "index", mb: 20, sample: ["index"] },
  ],
};

/* John, 2026-09-23: "no more than 20% sounds reasonable." */
describe("the function-size gate", () => {
  it("passes a function within 20% of its recorded size and under the ceiling", () => {
    const [verdict] = judgeFunctionSizes([api(107)], baseline);
    expect(verdict!.failure).toBeNull();
    expect(verdict!.allowedMb).toBeCloseTo(90 * (1 + FUNCTION_GROWTH_ALLOWED), 6);
  });

  it("fails a function that grew more than 20% over its recorded size", () => {
    const [verdict] = judgeFunctionSizes([api(108.5)], baseline);
    expect(verdict!.failure).toContain("21% (18.5 MB) over the 90.0 MB recorded");
  });

  /* A 2 MB function has 0.4 MB of room at 20%, which build noise can use up. */
  it("passes a small function that grew by a megabyte, however large the percentage", () => {
    const small = { functions: [{ name: "_global-error.rsc", mb: 2.1, sample: ["_global-error"] }] };
    const [verdict] = judgeFunctionSizes([{ name: "_global-error.rsc", mb: 3.1, routes: ["_global-error"] }], small);
    expect(verdict!.failure).toBeNull();
    expect(verdict!.allowedMb).toBeCloseTo(2.1 + FUNCTION_GROWTH_FLOOR_MB, 6);
    expect(judgeFunctionSizes([{ name: "_global-error.rsc", mb: 7.2, routes: ["_global-error"] }], small)[0]!.failure).toContain("over the 2.1 MB recorded");
  });

  it("fails a 90 MB function that grew by 19 MB, past both the percentage and the floor", () => {
    const [verdict] = judgeFunctionSizes([api(109)], baseline);
    expect(verdict!.failure).toContain("(19.0 MB) over the 90.0 MB recorded");
  });

  it("fails any function over the ceiling, recorded or not", () => {
    const unknown = { name: "api/new", mb: FUNCTION_SIZE_LIMIT_MB + 1, routes: ["api/new"] };
    expect(judgeFunctionSizes([unknown], baseline)[0]!.failure).toContain(`over the ${FUNCTION_SIZE_LIMIT_MB} MB ceiling`);
    const recordedBig = { functions: [{ name: "api/new", mb: 110, sample: ["api/new"] }] };
    expect(judgeFunctionSizes([{ ...unknown, mb: 125 }], recordedBig)[0]!.failure).toContain("ceiling");
  });

  it("gives a function the baseline does not know the ceiling as its only limit", () => {
    const [verdict] = judgeFunctionSizes([{ name: "api/brand-new", mb: 110, routes: ["api/brand-new"] }], baseline);
    expect(verdict!.baseline).toBeNull();
    expect(verdict!.allowedMb).toBe(FUNCTION_SIZE_LIMIT_MB);
    expect(verdict!.failure).toBeNull();
  });

  it("has only the ceiling when there is no baseline at all", () => {
    expect(judgeFunctionSizes([pages(100)], null)[0]!.failure).toBeNull();
  });

  /*
   * Vercel names a bundle after its first route, so a route called
   * /api/alerts would rename the API bundle from api/app-telemetry. The
   * baseline recognises it by the routes it holds, or the 20% rule would
   * quietly stop applying.
   */
  it("recognises a function renamed by a new route, by the routes it holds", () => {
    const renamed = { ...api(95, "api/alerts"), routes: ["api/alerts", "api/app-telemetry", "api/device-stats", "api/health"] };
    expect(matchBaseline(renamed, baseline.functions)?.name).toBe("api/app-telemetry");
    expect(judgeFunctionSizes([{ ...renamed, mb: 135 }], baseline)[0]!.failure).toContain("ceiling");
    expect(judgeFunctionSizes([{ ...renamed, mb: 110 }], baseline)[0]!.failure).toContain("22% (20.0 MB) over");
    expect(matchBaseline(pages(20), baseline.functions)?.name).toBe("index");
    expect(matchBaseline({ name: "x", mb: 1, routes: ["nothing-shared"] }, baseline.functions)).toBeNull();
  });

  it("records each function's size and a sample of its routes, pages before their .rsc twins", () => {
    const recorded = recordBaseline([pages(20.34), api(20.96)]);
    expect(recorded.functions.map((fn) => [fn.name, fn.mb])).toEqual([
      ["api/app-telemetry", 21],
      ["index", 20.3],
    ]);
    expect(recorded.functions[0]!.sample).toEqual(["api/app-telemetry", "api/device-stats", "api/health"]);
  });
});
