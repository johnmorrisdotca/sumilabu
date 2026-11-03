import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseScorecard } from "@/lib/scorecard/contract";
import sample from "@/lib/scorecard/fixtures/sample.json";
import type { ScorecardData } from "@/lib/scorecard/server";
import { gradeColumns } from "@/lib/scorecard/view";

import { ItemDetail } from "./item-detail";
import { RankingsPanel } from "./rankings-panel";
import { ScorecardView } from "./scorecard-view";

const parsed = parseScorecard(sample);
if (!parsed.ok) throw new Error("the sample must parse");
const doc = parsed.doc;
const data: ScorecardData = {
  doc,
  receivedAt: "2026-11-02T23:05:00.000Z",
  trend: [
    { generatedAt: "2026-10-26T23:00:00.000Z", overall: { "kazoku-ui": 7 } },
    { generatedAt: "2026-11-02T23:00:00.000Z", overall: { "kazoku-ui": 8 } },
  ],
};
const NOW = "2026-11-03T02:00:00Z";
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("the scorecard table", () => {
  const out = html(createElement(ScorecardView, { data, nowIso: NOW }));

  it("shows the run date and how old the data is", () => {
    expect(out).toContain("Run 2026-11-02 23:00 UTC");
    expect(out).toContain("3 hours old");
    expect(out).toContain("10 items");
  });

  it("has one row per item, with its name, kind, owner and version", () => {
    expect(out.match(/data-testid="scorecard-row"/g)).toHaveLength(10);
    for (const item of doc.items) expect(out).toContain(item.name.replace("@", "@"));
    expect(out).toContain("johnmorrisdotca");
    expect(out).toContain("0.10.1");
    expect(out).toContain("2.14.3");
  });

  it("also draws a card per item for a phone, each with every grade", () => {
    expect(out).toContain('data-testid="scorecard-cards"');
    expect(out.match(/<li class="rounded-2xl[^>]*data-item="/g)).toHaveLength(10);
    expect(out).toContain("md:hidden");
  });

  it("has a column for every grade, overall last, each cell printing its number", () => {
    const heads = [...out.matchAll(/<th scope="col"[^>]*>.*?<\/th>/g)].map((m) => m[0].replace(/<[^>]+>/g, "").replace(/[▲▼]/g, ""));
    expect(heads.slice(-12)).toEqual(["Docs", "Deps", "Robust", "Tests", "Bugs", "Crashes", "Code", "Lint", "Perf", "Useful", "Fresh", "Overall"]);
    expect(out).toContain('data-grade="overall"');
    expect(out).toContain("Documentation: 9 of 10, excellent");
    expect(out).toContain("Overall: 8 of 10, good");
    expect(out).toContain("not graded");
  });

  it("offers the kind, owner and flag filters and a search", () => {
    for (const label of ["All", "Packages", "Sites", "Apps", "Any owner", "Flagged (", 'aria-label="Search"']) expect(out).toContain(label);
  });

  it("starts on the Scorecard tab with Rankings and the method one beside it, not folded open below", () => {
    expect(out).toContain('role="tablist"');
    expect(out).toContain("Rankings");
    expect(out).toContain("How it is graded");
    expect(out).not.toContain("<details");
  });

  it("warns, in words, when the run is more than a week old", () => {
    const old = html(createElement(ScorecardView, { data, nowIso: "2026-11-20T00:00:00Z" }));
    expect(old).toContain("17 days old");
    expect(old).toContain("collector has probably stopped");
  });

  it("says what to do when nothing has been uploaded", () => {
    const empty = html(createElement(ScorecardView, { data: null, nowIso: NOW }));
    expect(empty).toContain("No scorecard has been uploaded yet");
    expect(empty).toContain("scorecard:upload");
  });
});

describe("rankings", () => {
  const columns = gradeColumns(doc);

  it("lists the best and the worst for the chosen grade with their numbers", () => {
    const out = html(createElement(RankingsPanel, { doc, columns, rankId: "overall", onPick: () => {}, onOpen: () => {} }));
    expect(out).toContain("Best: Overall");
    expect(out).toContain("Worst: Overall");
    expect(out.indexOf("koyomi-calendars")).toBeGreaterThan(-1);
    expect(out.match(/<ol/g)).toHaveLength(2);
  });

  it("shows a measure ranking's raw numbers, not grade cells", () => {
    const out = html(createElement(RankingsPanel, { doc, columns, rankId: "npmDownloadsWeek", onPick: () => {}, onOpen: () => {} }));
    expect(out).toContain("420");
    expect(out).toContain("Best: Npm downloads week");
  });
});

describe("an item's detail", () => {
  const item = doc.items[0];
  const make = () => createElement(ItemDetail, { item, columns: gradeColumns(doc), trend: [7, 8], onBack: () => {} });

  it("shows the name, summary, flags, links and the trend", () => {
    const out = html(make());
    expect(out).toContain("@johnmorrisdotca/kazoku-ui");
    expect(out).toContain("v0.10.1");
    expect(out).toContain('href="https://www.npmjs.com/package/@johnmorrisdotca/kazoku-ui"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain("up over 2 runs");
  });

  it("opens on the grades, each with its note, in tabs that hold the facts and numbers apart", () => {
    const out = html(make());
    expect(out).toContain('aria-selected="true"');
    expect(out).toContain("Graded 9 on README and docs (sample sentence).");
    expect(out.match(/data-grade="/g)?.length).toBeGreaterThanOrEqual(12);
    expect(out).toContain("Facts and flags");
    expect(out).toContain("Numbers");
    expect(out).not.toContain("Sample fact 1");
  });

  it("explains a grade that could not be judged instead of leaving a gap", () => {
    const onibako = doc.items.find((i) => i.id === "onibako")!;
    const out = html(createElement(ItemDetail, { item: onibako, columns: gradeColumns(doc), trend: [], onBack: () => {} }));
    expect(out).toContain("Nothing to measure here.");
    expect(out).toContain("not updated for 58 days");
    expect(out).toContain("first run: no trend yet");
  });
});

describe("the /packages page", () => {
  const getScorecard = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    getScorecard.mockReset();
    vi.doMock("@/lib/scorecard/data", () => ({ getScorecard }));
  });

  it("reads the cached data once and draws it, not indexed by search engines", async () => {
    getScorecard.mockResolvedValue(data);
    const mod = await import("@/app/packages/page");
    const out = html(await mod.default());
    expect(getScorecard).toHaveBeenCalledTimes(1);
    expect(out).toContain("Package scorecard");
    expect(out).toContain("Updated whenever the collector");
    expect(mod.metadata.robots).toEqual({ index: false, follow: false });
    expect(mod.dynamic).toBe("force-dynamic");
  });
});
