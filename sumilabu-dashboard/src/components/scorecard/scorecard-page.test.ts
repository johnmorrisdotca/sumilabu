import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { parseScorecard } from "@/lib/scorecard/contract";
import real from "@/lib/scorecard/fixtures/real-trimmed.json";
import sample from "@/lib/scorecard/fixtures/sample.json";
import type { ScorecardData } from "@/lib/scorecard/server";
import { gradeColumns } from "@/lib/scorecard/view";

import mapRun from "@/lib/scorecard/fixtures/map-run.json";

import { ChangesContext } from "./change-arrow";
import { ChangesPanel } from "./changes-panel";
import { ItemDetail } from "./item-detail";
import { RadarChart } from "./radar-chart";
import { TicketsPanel } from "./tickets-panel";
import { MethodPanel } from "./method-panel";
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

  it("centres every grade box: an empty line above it as tall as the change line below it, in every grade cell (John, 2026-11-03)", () => {
    const balance = (out.match(/data-testid="change-balance"/g) ?? []).length;
    const slots = (out.match(/data-testid="change-slot"/g) ?? []).length;
    expect(slots).toBeGreaterThan(0);
    expect(balance).toBe(slots);
    for (const cell of out.matchAll(/<span class="inline-flex flex-col items-center">(.*?)data-testid="change-slot"/g)) {
      expect(cell[1].indexOf('data-testid="change-balance"')).toBe(cell[1].search(/data-testid="change-balance"/));
      expect(cell[1].startsWith('<span class="h-3.5" aria-hidden="true" data-testid="change-balance">')).toBe(true);
    }
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

describe("the real run's additions on screen", () => {
  const realParsed = parseScorecard(real);
  if (!realParsed.ok) throw new Error("the real run must parse");
  const rdoc = realParsed.doc;
  const item = (id: string) => structuredClone(rdoc.items.find((i) => i.id === id)!);
  const detail = (it: ReturnType<typeof item>, tab?: "numbers") =>
    html(createElement(ItemDetail, { item: it, columns: gradeColumns(rdoc), trend: [], onBack: () => {}, initialTab: tab }));

  it("draws the 30 daily downloads as a small chart in the Numbers tab", () => {
    const out = detail(item("tane"), "numbers");
    expect(out).toContain("Downloads per day, last 30 days: 1,311 in all, busiest day 237.");
    expect((out.match(/<rect /g) ?? []).length).toBe(30);
    expect(out).toContain("Stars outside John&#x27;s accounts");
  });

  it("says why a lint, type or audit reading is blank, once, under the list", () => {
    const out = detail(item("sumilabu"), "numbers");
    expect(out).toContain("not read *");
    expect(out).toContain("* no lockfile, so no cheap install: lint, typecheck and audit not run");
    expect(out).toContain("Met Vercel&#x27;s bot check");
  });

  it("has no footnote star when nothing is blank", () => {
    const out = detail(item("tane"), "numbers");
    expect(out).not.toContain("not read *");
    expect(out).not.toContain('data-testid="check-notes"');
  });

  it("marks a private item as private in the table, the cards and the detail", () => {
    const d = structuredClone(rdoc);
    d.items[2].private = true;
    const data: ScorecardData = { doc: d, receivedAt: "2026-11-03T06:09:00.000Z", trend: [] };
    const out = html(createElement(ScorecardView, { data, nowIso: "2026-11-03T07:00:00Z" }));
    expect((out.match(/>private</g) ?? []).length).toBe(2);
    expect(detail(d.items[2])).toContain(">private<");
    expect(html(createElement(ScorecardView, { data: { ...data, doc: rdoc }, nowIso: "2026-11-03T07:00:00Z" }))).not.toContain(">private<");
  });

  it("shows the overall as the two-decimal score and orders by it", () => {
    const out = html(createElement(ScorecardView, { data: { doc: rdoc, receivedAt: "2026-11-03T06:09:00.000Z", trend: [] }, nowIso: "2026-11-03T07:00:00Z" }));
    expect(out).toContain("Overall: 9.1 of 10");
    expect(out.indexOf('data-item="tane"')).toBeLessThan(out.indexOf('data-item="jirai"'));
  });

  it("lists what was skipped, with the reasons, and how the run went, on the method tab", () => {
    const out = html(createElement(MethodPanel, { doc: rdoc }));
    expect(out).toContain("Left out of this run (3)");
    expect(out).toContain("johnmorrisdotca/hotaru-releases");
    expect(out).toContain("the public release host for hotaru&#x27;s signed packs, not a package or a site");
    expect(out).toContain("This run took 57 s");
    expect(out).toContain("ticket boards read: 3 of 3");
    expect(out).toContain("Use outside John&#x27;s accounts");
    expect(out).not.toContain("<details");
  });

  it("puts the extra rankings in the chip row, with their own words and units", () => {
    const columns = gradeColumns(rdoc);
    const chips = html(createElement(RankingsPanel, { doc: rdoc, columns, rankId: "packedKb", onPick: () => {}, onOpen: () => {} }));
    for (const label of ["Downloads, 30 days", "Number of tests", "Tests (grade)", "Dependency count", "Days since commit", "Packed size", "Open bug tickets", "README words"]) expect(chips).toContain(`>${label}<`);
    expect(chips).toContain("58.9 KB");
  });
});

describe("favourites on the page (SUMILABU-9)", () => {
  const withFavs = (favourites: string[]) => html(createElement(ScorecardView, { data, nowIso: NOW, favourites }));

  it("puts a heart on every row and card, pressed for a favourite, with the action as its label", () => {
    const out = withFavs(["chizu"]);
    expect((out.match(/data-testid="heart"/g) ?? []).length).toBe(20);
    expect((out.match(/aria-pressed="true" aria-label="Remove from favourites"/g) ?? []).length).toBe(2);
    expect((out.match(/aria-label="Add to favourites"/g) ?? []).length).toBe(18);
  });

  it("keeps the rows in the sorted order whatever is hearted (John, 2026-11-03: a heart must not change a sort)", () => {
    const rowsOf = (out: string) => [...out.matchAll(/data-testid="scorecard-row" data-item="([^"]+)"/g)].map((m) => m[1]);
    const plain = rowsOf(withFavs([]));
    const last = plain.slice(-2);
    expect(rowsOf(withFavs(last))).toEqual(plain);
  });

  it("offers a Favourites chip with the count, and a Reset view button", () => {
    expect(withFavs(["chizu", "kazoku-ui", "gone"])).toContain("♥ Favourites (2)");
    expect(withFavs([])).toContain('data-testid="reset-view"');
  });

  it("puts a picture in each row, or a plain tile when the item has none", () => {
    const real = parseScorecard(mapRun);
    if (!real.ok) throw new Error("map run must parse");
    const out = html(createElement(ScorecardView, { data: { doc: real.doc, receivedAt: "", trend: [] }, nowIso: NOW }));
    expect(out).toContain('loading="lazy"');
    expect(out).toContain('src="https://raw.githubusercontent.com/johnmorrisdotca/');
    expect(out).toMatch(/<img[^>]*width="76"[^>]*height="40"/);
  });
});

describe("tickets on the page (SUMILABU-12)", () => {
  const real = parseScorecard(mapRun);
  if (!real.ok) throw new Error("map run must parse");
  const rdoc = real.doc;
  const out = html(createElement(ScorecardView, { data: { doc: rdoc, receivedAt: "", trend: [] }, nowIso: NOW }));

  it("says the totals in one line at the top, with the figures and a bar by kind", () => {
    expect(out).toMatch(/data-testid="ticket-sentence">\d+ open tickets, \d+ bugs/);
    expect(out).toContain('data-testid="ticket-figures"');
    expect(out).toContain('data-testid="kind-bar"');
    expect(out).toContain("the boards give no done dates yet");
  });

  it("puts open bugs and open tickets as badges on a row", () => {
    expect(out).toContain('data-testid="ticket-badges"');
  });

  it("lists every ticket under the table, with its filters", () => {
    expect(out).toContain('data-testid="ticket-browser"');
    expect(out).toContain('data-chip="kind:bug"');
    expect(out).toContain('data-testid="ticket-item-filter"');
  });

  it("compares the items' tickets in the Tickets tab, in the sorted order whatever is hearted", () => {
    const panel = html(createElement(TicketsPanel, { items: rdoc.items, sort: { key: "open", dir: "desc" }, chips: { hasBugs: false, hasCritical: false, nothingOpen: false }, onChange: () => {}, favourites: new Set(["tane"]), onToggleFavourite: () => {}, onOpen: () => {} }));
    const rows = [...panel.matchAll(/data-testid="tickets-row" data-item="([^"]+)"/g)].map((m) => m[1]);
    const unhearted = html(createElement(TicketsPanel, { items: rdoc.items, sort: { key: "open", dir: "desc" }, chips: { hasBugs: false, hasCritical: false, nothingOpen: false }, onChange: () => {}, favourites: new Set<string>(), onToggleFavourite: () => {}, onOpen: () => {} }));
    expect(rows).toEqual([...unhearted.matchAll(/data-testid="tickets-row" data-item="([^"]+)"/g)].map((m) => m[1]));
    expect(rows.length).toBe(rdoc.items.filter((i) => i.tickets).length);
    for (const label of ["Has bugs", "Has critical", "Nothing open"]) expect(panel).toContain(label);
  });

  it("shows an item's tickets below its grade cards, and a radar beside its overall", () => {
    const item = rdoc.items.find((i) => i.id === "kazoku-ui")!;
    const detail = html(createElement(ItemDetail, { item, columns: gradeColumns(rdoc), trend: [], onBack: () => {}, tickets: [], ticketView: { filters: { kind: "all", priority: "all", status: "all", done: "30", query: "", item: "all" }, sort: { key: "priority", dir: "asc" } }, onTicketView: () => {} }));
    expect(detail.indexOf('data-testid="ticket-section"')).toBeGreaterThan(detail.indexOf('id="grade-overall"'));
    expect(detail).toContain('data-testid="radar"');
    expect(detail).toContain('data-testid="ticket-browser"');
  });
});

describe("the radar on screen", () => {
  it("is a focusable mark per grade, its tooltip the grade and its note, a gap said in words", () => {
    const item = { ...doc.items[0], grades: { ...doc.items[0].grades, lint: null } };
    const out = html(createElement(RadarChart, { item, columns: gradeColumns(doc), overall: 8, median: { docs: 6 } }));
    expect((out.match(/tabindex="0"/g) ?? []).length).toBe(11);
    expect(out).toContain("Documentation: 9 of 10. Graded 9 on README and docs (sample sentence).");
    expect(out).toContain("Lint: not judged");
    expect(out).toContain('data-testid="radar-median"');
  });

  it("has a tiny version for a row with nothing to press", () => {
    const out = html(createElement(RadarChart, { item: doc.items[0], columns: gradeColumns(doc), overall: 8, mini: true }));
    expect(out).toContain('width="28"');
    expect(out).not.toContain("tabindex");
  });
});

describe("changes since an earlier run (SUMILABU-14)", () => {
  const comparison = {
    at: "2026-10-26T23:00:00.000Z",
    items: {
      "kazoku-ui": { rank: [4, 2] as [number, number], score: [7.5, 8] as [number, number], "g:docs": [6, 8] as [number, number], bugs: [0, 2] as [number, number], downloads: [300, 420] as [number, number] },
      wazadb: { score: [6, 5.5] as [number, number], rank: [8, 9] as [number, number], tickets: [12, 10] as [number, number] },
      umakuma: { drift: [2, 1] as [number, number] },
    },
    added: ["koyomi-calendars"],
    dropped: [{ id: "fuda-cards", name: "@johnmorrisdotca/fuda-cards" }],
  };
  const withChanges: ScorecardData = { ...data, changes: { v: 1, at: "2026-11-02T23:00:00.000Z", previous: comparison, week: comparison, month: null } };
  const out = html(createElement(ScorecardView, { data: withChanges, nowIso: NOW }));

  it("draws an arrow, a sign and the amount, coloured by good or bad, with words for a screen reader", () => {
    expect(out).toContain('data-change="score"');
    expect(out).toContain("▲+0.5");
    expect(out).toContain('<span class="sr-only">overall score up 0.5 since 26 Oct</span>');
    expect(out).toContain('<span class="sr-only">rank up 2 places since 26 Oct</span>');
    expect(out).toMatch(/data-change="bugs" data-good="no"/);
    expect(out).toContain('<span class="sr-only">open bugs up 2 since 26 Oct</span>');
    expect(out).toMatch(/data-change="tickets" data-good="yes"/);
    expect(out).toContain("▼−0.5");
  });

  it("puts a change beside each radar grade and the downloads", () => {
    expect(out).toContain('<span class="sr-only">Documentation grade up 2 since 26 Oct</span>');
    expect(out).toContain('<span class="sr-only">weekly downloads up 120 since 26 Oct</span>');
  });

  it("marks a new item and draws nothing where nothing changed", () => {
    expect(out).toContain('data-testid="new-badge"');
    const chizuRow = out.slice(out.indexOf('data-item="chizu"'), out.indexOf("</tr>", out.indexOf('data-item="chizu"')));
    expect(chizuRow).not.toContain("data-change=");
  });

  it("offers the earlier runs as buttons, a run not kept yet greyed with the reason", () => {
    expect(out).toContain('data-testid="compare-picker"');
    expect(out).toMatch(/aria-pressed="true"[^>]*data-compare="previous"/);
    expect(out).toMatch(/disabled=""[^>]*title="No run a month older is kept yet\."[^>]*data-compare="month"/);
    expect(out).toContain("Since 26 Oct: 1 moved up, 1 down, 1 changed in other figures, 1 new, 1 dropped.");
  });

  it("has a Changes tab beside the Scorecard tab", () => {
    expect(out).toMatch(/role="tab"[^>]*>Changes<\/button>/);
  });

  it("lists the movers up and down, what is new and what was dropped", () => {
    const panel = html(createElement(ChangesContext.Provider, { value: { comparison, since: "26 Oct" } }, createElement(ChangesPanel, { items: doc.items, gradeOrder: gradeColumns(doc).map((c) => c.id), onOpen: () => {} })));
    expect(panel).toMatch(/data-testid="movers-up"[\s\S]*data-item="kazoku-ui"/);
    expect(panel).toMatch(/data-testid="movers-down"[\s\S]*data-item="wazadb"/);
    expect(panel).toMatch(/data-testid="movers-other"[\s\S]*data-item="umakuma"/);
    expect(panel).toContain("koyomi-calendars");
    expect(panel).toContain("fuda-cards");
    expect(panel).toContain("(dropped)");
  });

  it("says when there is nothing to compare with yet", () => {
    expect(out.length).toBeGreaterThan(0);
    const none = html(createElement(ScorecardView, { data, nowIso: NOW }));
    expect(none).toContain("start with the next upload");
    expect(none).not.toContain('data-testid="compare-picker"');
  });

  it("shows the item's key figures with what moved", () => {
    const item = doc.items[0];
    const detail = html(
      createElement(
        ChangesContext.Provider,
        { value: { comparison, since: "26 Oct" } },
        createElement(ItemDetail, { item, columns: gradeColumns(doc), trend: [], onBack: () => {}, figures: { rank: 2, score: 8, "g:docs": 8, bugs: 2, tickets: 3, drift: 0 } }),
      ),
    );
    expect(detail).toContain('data-testid="key-figures"');
    expect(detail).toContain("5 moved since 26 Oct");
    expect(detail).toMatch(/data-figure="drift"[^>]*>[\s\S]*?Version drift[\s\S]*?0<\/span><\/span>/);
  });
});
