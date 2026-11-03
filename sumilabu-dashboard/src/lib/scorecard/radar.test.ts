import { describe, expect, it } from "vitest";

import { familyMedian, median, radarColumns, radarGeometry, shapePaths, spokeAngle } from "./radar";
import type { GradeColumn } from "./view";

const cols: GradeColumn[] = ["a", "b", "c", "d"].map((id) => ({ id, label: id.toUpperCase(), long: id })).concat([{ id: "overall", label: "Overall", long: "Overall" }]);

describe("the radar's geometry", () => {
  it("has a spoke per grade, overall left out, the first straight up and the rest clockwise", () => {
    expect(radarColumns(cols).map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
    expect(spokeAngle(0, 4)).toBeCloseTo(-Math.PI / 2);
    expect(spokeAngle(1, 4)).toBeCloseTo(0);
  });

  it("puts a grade of 10 on the rim and a 5 halfway", () => {
    const g = radarGeometry({ grades: { a: 10, b: 5, c: 10, d: 10 } }, cols, 200, {}, 0);
    expect(g.points[0]).toMatchObject({ x: 100, y: 100 - g.radius });
    expect(g.points[1].x).toBeCloseTo(100 + g.radius / 2, 1);
    expect(g.points[1].y).toBeCloseTo(100, 1);
  });

  it("draws rings at 2, 4, 6, 8 and 10", () => {
    const g = radarGeometry({ grades: { a: 1, b: 1, c: 1, d: 1 } }, cols, 200);
    expect(g.rings.map((r) => r.value)).toEqual([2, 4, 6, 8, 10]);
    expect(g.rings[4].path.startsWith("M")).toBe(true);
    expect(g.rings[4].path.endsWith("Z")).toBe(true);
  });

  it("is one closed shape when every grade was judged", () => {
    expect(shapePaths([5, 5, 5, 5], 100, 80)).toHaveLength(1);
  });

  it("leaves a gap for a grade nobody could judge: the point at the centre and the shape cut there, never a zero", () => {
    const g = radarGeometry({ grades: { a: 8, b: null, c: 6, d: 7 } }, cols, 200, {}, 0);
    expect(g.points[1]).toMatchObject({ value: null, x: 100, y: 100 });
    expect(g.shape).toHaveLength(1);
    expect(g.shape[0].startsWith("M100,100")).toBe(true);
    expect(shapePaths([8, null, 6, null], 100, 80)).toHaveLength(2);
    expect(shapePaths([null, null, null, null], 100, 80)).toEqual([]);
  });

  it("anchors the labels away from the chart", () => {
    const g = radarGeometry({ grades: {} }, cols, 200);
    expect(g.points.map((p) => p.anchor)).toEqual(["middle", "start", "middle", "end"]);
  });
});

describe("the family median", () => {
  it("is the middle value, or the mean of the two middle ones", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("compares a package with its own family, and skips grades nobody judged", () => {
    const item = (id: string, group: string | null, kind: "package" | "site", a: number | null) => ({ id, group, kind, grades: { a } }) as never;
    const all = [item("x", "games", "package", 4), item("y", "games", "package", 8), item("z", "maps", "package", 1), item("w", "games", "package", null), item("s", null, "site", 2)];
    expect(familyMedian(all[0], all, cols).a).toBe(6);
    expect(familyMedian(all[4], all, cols).a).toBe(2);
  });
});
