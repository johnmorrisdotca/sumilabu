/* eslint-disable @typescript-eslint/no-explicit-any -- these tests push invalid values into a copy of a typed document on purpose */
import { describe, expect, it } from "vitest";

import sample from "./fixtures/sample.json";
import { overallByItem, parseScorecard } from "./contract";

const clone = () => structuredClone(sample) as Record<string, any>;

describe("parseScorecard", () => {
  it("accepts the sample run and keeps every item", () => {
    const parsed = parseScorecard(sample);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.doc.items).toHaveLength(10);
      expect(parsed.doc.items[0].grades.overall).toBe(8);
      expect(parsed.doc.rankings.overall.best[0]).toBe("koyomi-calendars");
    }
  });

  it("fills what a minimal item leaves out, so the page never meets undefined", () => {
    const parsed = parseScorecard({
      schemaVersion: 1,
      generatedAt: "2026-11-02T23:00:00Z",
      generator: { name: "t", version: "1" },
      items: [{ id: "a", kind: "app", owner: "spxis", name: "a", grades: { overall: 5 } }],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const item = parsed.doc.items[0];
      expect(item.links).toEqual({});
      expect(item.facts).toEqual([]);
      expect(item.popularity.stars).toBeNull();
      expect(item.dependencies.runtime).toEqual([]);
      expect(parsed.doc.rankings).toEqual({});
    }
  });

  it("drops fields the contract does not name instead of storing them", () => {
    const doc = clone();
    doc.items[0].secretNote = "should not survive";
    doc.extra = 1;
    const parsed = parseScorecard(doc);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.doc.items[0]).not.toHaveProperty("secretNote");
      expect(parsed.doc).not.toHaveProperty("extra");
    }
  });

  it.each([
    ["a schema version it does not know", (d: any) => (d.schemaVersion = 2), "schemaVersion"],
    ["a date that is not ISO", (d: any) => (d.generatedAt = "yesterday"), "generatedAt"],
    ["an unknown kind", (d: any) => (d.items[0].kind = "service"), "items.0.kind"],
    ["a grade of 11", (d: any) => (d.items[1].grades.docs = 11), "items.1.grades.docs"],
    ["a grade of 0", (d: any) => (d.items[1].grades.docs = 0), "items.1.grades.docs"],
    ["a grade that is text", (d: any) => (d.items[1].grades.docs = "9"), "items.1.grades.docs"],
    ["a javascript: link", (d: any) => (d.items[0].links.repo = "javascript:alert(1)"), "items.0.links.repo"],
    ["an http link", (d: any) => (d.items[0].links.site = "http://example.com"), "items.0.links.site"],
    ["an item id with a space", (d: any) => (d.items[0].id = "bad id"), "items.0.id"],
    ["a duplicate item id", (d: any) => (d.items[1].id = d.items[0].id), "items"],
    ["a fact over 600 characters", (d: any) => (d.items[0].facts[0] = "x".repeat(601)), "items.0.facts.0"],
    ["a missing grades object", (d: any) => delete d.items[2].grades, "items.2.grades"],
    ["items that are not a list", (d: any) => (d.items = {}), "items"],
  ])("refuses %s, and names where", (_name, mutate, where) => {
    const doc = clone();
    mutate(doc);
    const parsed = parseScorecard(doc);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.problems.some((p) => p.startsWith(where))).toBe(true);
  });

  it("refuses more than 200 items", () => {
    const doc = clone();
    doc.items = Array.from({ length: 201 }, (_, i) => ({ ...doc.items[0], id: `item-${i}` }));
    expect(parseScorecard(doc).ok).toBe(false);
  });

  it("reports at most ten problems, however broken the document is", () => {
    const doc = clone();
    for (const i of doc.items) i.kind = "nope";
    doc.items.push(...doc.items.map((i: any) => ({ ...i, id: `${i.id}-2` })));
    const parsed = parseScorecard(doc);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.problems.length).toBeLessThanOrEqual(10);
  });
});

describe("overallByItem", () => {
  it("maps each item id to its overall grade, null when it has none", () => {
    const doc = clone();
    delete doc.items[0].grades.overall;
    const parsed = parseScorecard(doc);
    if (!parsed.ok) throw new Error("sample should parse");
    const overall = overallByItem(parsed.doc);
    expect(overall["kazoku-ui"]).toBeNull();
    expect(overall["chizu"]).toBe(7.5);
  });
});
