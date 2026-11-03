/* eslint-disable @typescript-eslint/no-explicit-any -- tests change a copy of a typed fixture on purpose */
import { describe, expect, it } from "vitest";

import {
  changeTitle,
  changeWords,
  changesSentence,
  chosenComparison,
  compareRuns,
  datesToPrune,
  driftOf,
  figureDef,
  figuresOf,
  movers,
  moveOf,
  orderFigures,
  parseJson,
  pickBases,
  ranksByOverall,
  readChanges,
  readFigures,
  sinceLabel,
  type StoredChanges,
} from "./changes";
import { parseScorecard, type Scorecard } from "./contract";
import sample from "./fixtures/sample.json";

function doc(edit: (d: any) => void = () => {}): Scorecard {
  const copy = structuredClone(sample) as any;
  edit(copy);
  const parsed = parseScorecard(copy);
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));
  return parsed.doc;
}

const DAY = 24 * 60 * 60 * 1000;

describe("the figures kept of a run", () => {
  const run = figuresOf(doc());

  it("keeps a few numbers per item, never the document", () => {
    expect(Object.keys(run)).toHaveLength(10);
    expect(run["kazoku-ui"]).toEqual({
      name: "@johnmorrisdotca/kazoku-ui",
      figures: expect.objectContaining({ rank: 2, grade: 8, score: 8, "g:docs": expect.any(Number), tickets: 3, bugs: 0, downloads: 420 }),
    });
    expect(JSON.stringify(run).length).toBeLessThan(5000);
  });

  it("leaves out what could not be read, so a gap never reads as a change", () => {
    expect(run.itsutsu.figures).not.toHaveProperty("downloads");
    expect(run["kazoku-ui"].figures).not.toHaveProperty("docsScore");
    expect(run["kazoku-ui"].figures).not.toHaveProperty("drift");
  });

  it("reads the docs score when the collector sends one", () => {
    const withDocs = figuresOf(doc((d) => (d.items[0].measures.docsScore = 72.25)));
    expect(withDocs["kazoku-ui"].figures.docsScore).toBe(72.3);
  });

  it("falls back to the tickets block for open tickets and bugs", () => {
    const d = doc((x) => {
      delete x.items[0].measures.openTickets;
      delete x.items[0].measures.openBugTickets;
      x.items[0].tickets = { boards: ["kazoku"], open: 5, openByKind: { bug: { high: 2, low: 1 } } };
    });
    expect(figuresOf(d)["kazoku-ui"].figures).toMatchObject({ tickets: 5, bugs: 3 });
  });
});

describe("rank", () => {
  it("is 1 for the best overall, and equal scores share a place", () => {
    const ranks = ranksByOverall(doc().items);
    expect(ranks.get("koyomi-calendars")).toBe(1);
    expect(ranks.get("kazoku-ui")).toBe(2);
    expect(ranks.get("chizu")).toBe(4);
    expect(ranks.get("hako-devices")).toBe(4);
    expect(ranks.get("onibako")).toBe(10);
  });

  it("skips an item with no overall", () => {
    const ranks = ranksByOverall(doc((d) => (d.items[0].grades.overall = null)).items);
    expect(ranks.has("kazoku-ui")).toBe(false);
  });
});

describe("version drift", () => {
  const latest = new Map([["chizu", "0.4.2"], ["kazoku-ui", "0.10.1"]]);
  const item = (ranges: Record<string, string>) => doc((d) => (d.items[2].dependencies.familyRanges = ranges)).items[2];

  it("counts the family ranges the latest release is not in", () => {
    expect(driftOf(item({ chizu: "^0.3.0", "kazoku-ui": "^0.10.0" }), latest)).toBe(1);
    expect(driftOf(item({ chizu: "^0.4.0", "kazoku-ui": "~0.9.0" }), latest)).toBe(1);
    expect(driftOf(item({ chizu: "^0.4.0" }), latest)).toBe(0);
  });

  it("does not count what cannot be told (a workspace link, a package not on npm)", () => {
    expect(driftOf(item({ chizu: "workspace:*", unknown: "^1.0.0" }), latest)).toBe(0);
  });

  it("is null when the item names no family package", () => {
    expect(driftOf(item({}), latest)).toBeNull();
  });
});

describe("comparing two runs", () => {
  const then = figuresOf(doc());
  const now = figuresOf(
    doc((d) => {
      d.items[0].grades.overall = 9; // kazoku-ui climbs to first
      d.items[0].measures.openBugTickets = 2; // and gains two bugs
      d.items[3].popularity.npmDownloadsWeek = 40; // kyogijo downloads
      d.items = d.items.filter((i: any) => i.id !== "onibako");
      d.items.push({ ...structuredClone(d.items[1]), id: "fuda-cards", name: "@johnmorrisdotca/fuda-cards", grades: { ...d.items[1].grades, overall: 1 } });
    }),
  );
  const c = compareRuns(now, then, "2026-10-26T23:00:00.000Z");

  it("keeps only the figures that changed, as [then, now]", () => {
    expect(c.items["kazoku-ui"]).toMatchObject({ rank: [2, 1], grade: [8, 9], score: [8, 9], bugs: [0, 2] });
    expect(c.items["kazoku-ui"]).not.toHaveProperty("tickets");
    expect(c.items.kyogijo).toEqual({ downloads: [12, 40] });
    expect(c.items).not.toHaveProperty("wazadb");
  });

  it("marks new and dropped items, a dropped one by the name it had", () => {
    expect(c.added).toEqual(["fuda-cards"]);
    expect(c.dropped).toEqual([{ id: "onibako", name: "onibako" }]);
    expect(c.at).toBe("2026-10-26T23:00:00.000Z");
  });

  it("does not call a figure read for the first time a change", () => {
    const later = figuresOf(doc((d) => (d.items[0].measures.docsScore = 70)));
    expect(compareRuns(later, then, "x").items["kazoku-ui"]).toBeUndefined();
  });

  it("lists the biggest movers up and down, and the rest", () => {
    const m = movers(c);
    expect(m.up.map((x) => x.id)[0]).toBe("kazoku-ui");
    expect(m.down.map((x) => x.id)).toContain("koyomi-calendars");
    expect(m.others.map((x) => x.id)).toContain("kyogijo");
    const kazoku = m.up[0];
    expect(kazoku.good).toBeGreaterThan(0);
    expect(kazoku.bad).toBe(1);
  });

  it("puts it in one sentence", () => {
    expect(changesSentence(c, "26 Oct")).toBe("Since 26 Oct: 1 moved up, 1 down, 1 changed in other figures, 1 new, 1 dropped.");
    expect(changesSentence({ at: "x", items: {}, added: [], dropped: [] }, "26 Oct")).toBe("Nothing changed since 26 Oct.");
  });
});

describe("which way is good", () => {
  it("is up for a grade, the score and downloads; down for tickets, bugs and drift", () => {
    expect(moveOf(figureDef("g:docs"), [6, 8])).toMatchObject({ up: true, good: true, arrow: "▲", sign: "+", amount: "2" });
    expect(moveOf(figureDef("downloads"), [1200, 900])).toMatchObject({ up: false, good: false, amount: "300" });
    expect(moveOf(figureDef("bugs"), [1, 3])).toMatchObject({ up: true, good: false, arrow: "▲" });
    expect(moveOf(figureDef("tickets"), [5, 2])).toMatchObject({ up: false, good: true, arrow: "▼", sign: "−" });
    expect(moveOf(figureDef("drift"), [0, 1]).good).toBe(false);
    expect(moveOf(figureDef("docsScore"), [60, 72.5]).good).toBe(true);
  });

  it("calls a smaller rank number up, and good", () => {
    expect(moveOf(figureDef("rank"), [7, 4])).toMatchObject({ up: true, good: true, amount: "3", arrow: "▲" });
    expect(moveOf(figureDef("rank"), [1, 2])).toMatchObject({ up: false, good: false });
  });

  it("words a change for a screen reader and a tooltip", () => {
    expect(changeWords(figureDef("rank"), [7, 4], "2 Nov")).toBe("rank up 3 places since 2 Nov");
    expect(changeWords(figureDef("rank"), [1, 2], "2 Nov")).toBe("rank down 1 place since 2 Nov");
    expect(changeWords(figureDef("score"), [7.1, 7.45], "2 Nov")).toBe("overall score up 0.35 since 2 Nov");
    expect(changeWords(figureDef("bugs"), [0, 2], "2 Nov")).toBe("open bugs up 2 since 2 Nov");
    expect(changeWords(figureDef("g:docs"), [6, 8], "2 Nov")).toBe("Documentation grade up 2 since 2 Nov");
    expect(changeTitle(figureDef("downloads"), [1200, 15000], "2 Nov")).toBe("weekly downloads up 14k since 2 Nov: 1.2k → 15k, better");
    expect(changeTitle(figureDef("rank"), [7, 4], "2 Nov")).toBe("rank up 3 places since 2 Nov: #7 → #4, better");
  });

  it("orders figures rank, grade, score, the radar in its order, then the counts", () => {
    expect(orderFigures(["drift", "g:tests", "bugs", "score", "g:docs", "rank", "g:zeta"], ["docs", "tests"])).toEqual(["rank", "score", "g:docs", "g:tests", "g:zeta", "bugs", "drift"]);
  });
});

describe("which earlier runs are compared with", () => {
  const now = "2026-11-30T06:00:00.000Z";
  const at = (days: number, minutes = 0) => new Date(Date.parse(now) - days * DAY + minutes * 60_000).toISOString();

  it("takes the run just before, and the newest a week and a month older", () => {
    const b = pickBases(now, [at(1), at(7, 2), at(14), at(28), at(35), now]);
    expect(b).toEqual({ previous: at(1), week: at(7, 2), month: at(28) });
  });

  it("is null where there is no run that old yet, or none at all", () => {
    expect(pickBases(now, [at(1)])).toEqual({ previous: at(1), week: null, month: null });
    expect(pickBases(now, [now])).toEqual({ previous: null, week: null, month: null });
  });

  it("never compares with a run newer than the one shown", () => {
    expect(pickBases(now, [at(-1)]).previous).toBeNull();
  });
});

describe("what is kept", () => {
  const now = Date.parse("2026-11-30T12:00:00.000Z");
  const at = (days: number) => new Date(now - days * DAY).toISOString();

  it("keeps every run for 30 days", () => {
    const daily = Array.from({ length: 30 }, (_, i) => at(i));
    expect(datesToPrune(daily, now)).toEqual([]);
  });

  it("then keeps the newest run of each week, up to a year", () => {
    const daily = Array.from({ length: 120 }, (_, i) => at(i));
    const drop = datesToPrune(daily, now);
    const kept = daily.filter((d) => !drop.includes(d));
    const old = kept.filter((d) => now - Date.parse(d) > 30 * DAY);
    expect(old.length).toBeGreaterThanOrEqual(12);
    expect(old.length).toBeLessThanOrEqual(14);
    /* One a week: the first may be closer to the 30-day line, every later one is exactly a week on. */
    for (let i = 2; i < old.length; i++) expect(Date.parse(old[i - 1]) - Date.parse(old[i])).toBe(7 * DAY);
  });

  it("drops anything over a year old", () => {
    expect(datesToPrune([at(366), at(400), at(10)], now)).toEqual([at(366), at(400)]);
  });

  it("stays near 80 runs a year when the collector runs every day", () => {
    const daily = Array.from({ length: 400 }, (_, i) => at(i));
    const kept = daily.length - datesToPrune(daily, now).length;
    expect(kept).toBeGreaterThan(75);
    expect(kept).toBeLessThan(85);
  });
});

describe("reading what was stored", () => {
  const comparison = { at: "2026-10-26T23:00:00.000Z", items: { chizu: { rank: [3, 2] as [number, number] } }, added: [], dropped: [] };
  const good: StoredChanges = { v: 1, at: "2026-11-02T23:00:00.000Z", previous: comparison, week: comparison, month: null };

  it("takes a good record, and nothing else", () => {
    expect(readChanges(parseJson(JSON.stringify(good)))).toEqual(good);
    expect(readChanges(null)).toBeNull();
    expect(readChanges(parseJson("{ not json"))).toBeNull();
    expect(readChanges({ ...good, v: 2 })).toBeNull();
    expect(readChanges({ ...good, previous: { ...comparison, items: { chizu: { rank: ["a", 2] } } } })).toBeNull();
  });

  it("keeps only numbers from a figures object", () => {
    expect(readFigures({ rank: 2, name: "x", bad: Number.NaN, list: [1] })).toEqual({ rank: 2 });
    expect(readFigures([1, 2])).toEqual({});
  });

  it("draws the chosen comparison, or the previous run's while the chosen one has no run that old", () => {
    expect(chosenComparison(good, "week")?.id).toBe("week");
    expect(chosenComparison(good, "month")?.id).toBe("previous");
    expect(chosenComparison(null, "previous")).toBeNull();
  });

  it("dates a comparison the short way, with the time when two runs share a day", () => {
    expect(sinceLabel("2026-11-02T23:00:00.000Z")).toBe("2 Nov");
    expect(sinceLabel("2026-11-02T06:15:00.000Z", "2026-11-02T23:00:00.000Z")).toBe("2 Nov 06:15");
  });
});
