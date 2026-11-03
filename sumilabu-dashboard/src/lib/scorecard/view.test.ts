import { describe, expect, it } from "vitest";

import sample from "./fixtures/sample.json";
import { parseScorecard, type Scorecard } from "./contract";
import {
  NO_FILTERS,
  ageLabel,
  averageOverall,
  filterItems,
  formatCount,
  formatDays,
  formatGrade,
  measureLabel,
  measureOrder,
  orderKeys,
  gradeBand,
  gradeColumns,
  rankingFor,
  rankingIds,
  runIsStale,
  sortItems,
  trendOf,
} from "./view";

const parsed = parseScorecard(sample);
if (!parsed.ok) throw new Error("the sample must parse");
const doc: Scorecard = parsed.doc;

describe("gradeColumns", () => {
  it("puts the known grades in the fixed order with overall last", () => {
    expect(gradeColumns(doc).map((c) => c.id)).toEqual([
      "docs", "dependencies", "robustness", "tests", "bugs", "crashes", "code", "lint", "performance", "usefulness", "freshness", "overall",
    ]);
  });

  it("adds a grade the collector invented, before overall", () => {
    const custom = structuredClone(doc);
    custom.items[0].grades.accessibility = 7;
    const ids = gradeColumns(custom).map((c) => c.id);
    expect(ids.slice(-2)).toEqual(["accessibility", "overall"]);
  });
});

describe("sortItems", () => {
  const byName = (items: Scorecard["items"]) => items.map((i) => i.id);

  it("sorts a grade high to low and puts a missing grade last either way", () => {
    const desc = sortItems(doc.items, "grade:performance", "desc");
    const asc = sortItems(doc.items, "grade:performance", "asc");
    expect(desc[0].grades.performance).toBe(9);
    expect(byName(desc).at(-1)).toBe("onibako");
    expect(byName(asc).at(-1)).toBe("onibako");
    expect(asc[0].grades.performance).toBe(5);
  });

  it("sorts by days since update, nulls last, and by version as numbers not text", () => {
    const days = sortItems(doc.items, "days", "asc");
    expect(days[0].dates.daysSinceCommit).toBe(0);
    expect(days.at(-1)?.id).toBe("onibako");
    const versions = sortItems(doc.items.filter((i) => i.versions.repo), "version", "desc");
    expect(versions[0].versions.repo).toBe("2.14.3");
    expect(versions.map((i) => i.versions.repo).indexOf("0.10.1")).toBeLessThan(versions.map((i) => i.versions.repo).indexOf("0.4.2"));
  });

  it("does not change the array it was given", () => {
    const before = byName(doc.items);
    sortItems(doc.items, "name", "desc");
    expect(byName(doc.items)).toEqual(before);
  });
});

describe("filterItems", () => {
  it("filters by kind, owner, flags and a search over name and summary", () => {
    expect(filterItems(doc.items, { ...NO_FILTERS, kind: "site" }).map((i) => i.id)).toEqual(["itsutsu", "wazadb", "sumilabu-dashboard"]);
    expect(filterItems(doc.items, { ...NO_FILTERS, owner: "spxis" })).toHaveLength(3);
    expect(filterItems(doc.items, { ...NO_FILTERS, flaggedOnly: true }).every((i) => i.flags.length > 0)).toBe(true);
    expect(filterItems(doc.items, { ...NO_FILTERS, query: " JUDO " }).map((i) => i.id)).toEqual(["wazadb"]);
    expect(filterItems(doc.items, { ...NO_FILTERS, kind: "package", owner: "spxis" })).toEqual([]);
  });
});

describe("rankingFor", () => {
  it("uses the collector's ranking and skips ids that match no item", () => {
    const custom = structuredClone(doc);
    custom.rankings.overall = { best: ["chizu", "ghost", "kazoku-ui"], worst: ["onibako"] };
    const r = rankingFor(custom, "overall");
    expect(r.best.map((i) => i.id)).toEqual(["chizu", "kazoku-ui"]);
    expect(r.worst.map((i) => i.id)).toEqual(["onibako"]);
  });

  it("works out a grade the collector did not rank, leaving ungraded items out", () => {
    const custom = structuredClone(doc);
    delete custom.rankings.performance;
    const r = rankingFor(custom, "performance", 3);
    expect(r.best[0].grades.performance).toBe(9);
    expect(r.worst[0].grades.performance).toBe(5);
    expect([...r.best, ...r.worst].some((i) => i.id === "onibako")).toBe(false);
  });

  it("lists a ranking that is not a grade, after the grades", () => {
    expect(rankingIds(doc, gradeColumns(doc)).at(-1)).toBe("npmDownloadsWeek");
  });
});

describe("words and numbers", () => {
  it("bands grades and never colours a missing one", () => {
    expect([null, 2, 4, 6, 8, 9.5].map(gradeBand)).toEqual(["none", "bad", "poor", "fair", "good", "great"]);
  });

  it("formats grades, counts and days", () => {
    expect(formatGrade(null)).toBe("–");
    expect(formatGrade(7.5)).toBe("7.5");
    expect(formatGrade(8)).toBe("8");
    expect([null, 0, 950, 1200, 25000, 3_400_000].map(formatCount)).toEqual(["–", "0", "950", "1.2k", "25k", "3.4M"]);
    expect([null, 0, 31].map(formatDays)).toEqual(["–", "today", "31d"]);
  });

  it("says how old the data is, and when it is too old to trust", () => {
    const g = "2026-11-02T23:00:00Z";
    expect(ageLabel(g, "2026-11-02T23:01:00Z")).toBe("just now");
    expect(ageLabel(g, "2026-11-03T00:30:00Z")).toBe("90 minutes old");
    expect(ageLabel(g, "2026-11-03T02:00:00Z")).toBe("3 hours old");
    expect(ageLabel(g, "2026-11-12T02:00:00Z")).toBe("9 days old");
    expect(runIsStale(g, "2026-11-09T22:00:00Z")).toBe(false);
    expect(runIsStale(g, "2026-11-11T00:00:00Z")).toBe(true);
  });

  it("averages the overall grades that exist", () => {
    expect(averageOverall(doc.items)).toBe(6.9);
    expect(averageOverall([])).toBeNull();
  });

  it("reads one item's overall grade across runs, skipping runs that lacked it", () => {
    expect(trendOf([{ overall: { a: 5 } }, { overall: { a: null } }, { overall: {} }, { overall: { a: 7 } }], "a")).toEqual([5, 7]);
  });
});

describe("keys in a readable order", () => {
  it("puts keys in the preferred order and the rest alphabetically, whatever order Postgres stored them in", () => {
    expect(orderKeys(["e2e", "tests", "zeta", "alpha", "readmeWords"], measureOrder)).toEqual(["readmeWords", "tests", "e2e", "alpha", "zeta"]);
    expect(orderKeys(["site", "repo", "extra", "npm"], ["repo", "npm", "demo", "site"])).toEqual(["repo", "npm", "site", "extra"]);
  });

  it("words a measure plainly, and an unknown one from its id", () => {
    expect(measureLabel("ciFailuresLast30")).toBe("CI failures, 30 days");
    expect(measureLabel("npmDownloadsWeek")).toBe("Npm downloads week");
  });
});
