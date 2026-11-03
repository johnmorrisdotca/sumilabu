import { describe, expect, it } from "vitest";

import { safeCallback } from "./callback";

describe("safeCallback", () => {
  it("keeps a path on this site, query included", () => {
    expect(safeCallback("/packages")).toBe("/packages");
    expect(safeCallback("/?project=onibako")).toBe("/?project=onibako");
    expect(safeCallback(["/packages", "/"])).toBe("/packages");
  });

  it("sends anything else home", () => {
    for (const value of [undefined, "", "https://evil.example/", "//evil.example", "/\\evil.example", "javascript:alert(1)", "packages", "/a\nb", `/${"x".repeat(600)}`]) {
      expect(safeCallback(value)).toBe("/");
    }
  });
});
