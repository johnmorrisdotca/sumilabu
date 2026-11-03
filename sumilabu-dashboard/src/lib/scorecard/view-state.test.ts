import { describe, expect, it } from "vitest";

import { DEFAULT_VIEW, VIEW_VERSION, fitView, hashFor, isDefaultView, readHash, readStoredView, resolveView, serializeView, type ViewState } from "./view-state";

const stored: ViewState = {
  ...DEFAULT_VIEW,
  tab: "tickets",
  sort: { key: "name", dir: "asc" },
  filters: { kind: "package", owner: "johnmorrisdotca", query: "kazu", flaggedOnly: true, favouritesOnly: true },
  rankId: "performance",
  detailTab: "numbers",
  ticketTable: { sort: { key: "bugs", dir: "desc" }, chips: { hasBugs: true, hasCritical: false, nothingOpen: false } },
  ticketList: { filters: { kind: "bug", priority: "high", status: "open", done: "all", query: "zoom", item: "kazoku-ui" }, sort: { key: "age", dir: "desc" } },
  compare: "month",
};
const raw = serializeView(stored);

describe("restoring the view: the address, then what was stored, then the default", () => {
  it("brings back everything that was stored", () => {
    expect(readStoredView(raw)).toEqual(stored);
  });

  it("is the default with nothing stored", () => {
    expect(resolveView(readHash(""), readStoredView(null))).toEqual(DEFAULT_VIEW);
  });

  it("lets what the address names win, field by field, and keeps the rest from storage", () => {
    const v = resolveView(readHash("#tab=rankings&rank=docs"), readStoredView(raw));
    expect(v.tab).toBe("rankings");
    expect(v.rankId).toBe("docs");
    expect(v.sort).toEqual(stored.sort);
    expect(v.filters.query).toBe("kazu");
  });

  it("takes the detail tab and the favourites filter from the address over storage", () => {
    expect(resolveView(readHash("#item=jirai&dtab=facts"), readStoredView(raw)).detailTab).toBe("facts");
    expect(resolveView(readHash("#item=jirai"), readStoredView(raw)).detailTab).toBe("numbers");
    expect(resolveView(readHash("#tab=table&filter=none"), readStoredView(raw)).filters.favouritesOnly).toBe(false);
    expect(resolveView(readHash("#tab=table&filter=favourites"), readStoredView(null)).filters.favouritesOnly).toBe(true);
  });

  it("reads a ranking link without a tab as the Rankings tab", () => {
    expect(readHash("#rank=performance").tab).toBe("rankings");
  });

  it("ignores an address value it does not know", () => {
    const h = readHash("#tab=evil&dtab=x&item=<b>&rank=a%20b");
    expect(h).toEqual({ item: null, tab: null, rank: null, dtab: null, favourites: null });
  });
});

describe("bad stored values are ignored, one field at a time", () => {
  it.each(["", "not json", "[]", "null", JSON.stringify({ ...JSON.parse(raw), v: VIEW_VERSION + 1 }), JSON.stringify({ tab: "tickets" })])("a whole value it cannot use (%s) is the default", (bad) => {
    expect(readStoredView(bad)).toEqual(DEFAULT_VIEW);
  });

  it("keeps the good fields when some are bad", () => {
    const mixed = JSON.parse(raw);
    mixed.tab = "admin";
    mixed.sort = { key: "grade:<img>", dir: "up" };
    mixed.filters.kind = "rocket";
    mixed.filters.query = "x".repeat(500);
    mixed.filters.flaggedOnly = "yes";
    mixed.ticketList.filters.priority = "urgent!";
    mixed.ticketList.sort.key = "__proto__";
    const v = readStoredView(JSON.stringify(mixed));
    expect(v.tab).toBe(DEFAULT_VIEW.tab);
    expect(v.sort).toEqual(DEFAULT_VIEW.sort);
    expect(v.filters).toEqual({ kind: "all", owner: "johnmorrisdotca", query: "", flaggedOnly: false, favouritesOnly: true });
    expect(v.ticketList.filters.priority).toBe("all");
    expect(v.ticketList.filters.kind).toBe("bug");
    expect(v.ticketList.sort.key).toBe("priority");
    expect(v.rankId).toBe("performance");
  });

  it("drops choices this run no longer has", () => {
    const v = fitView({ ...stored, sort: { key: "grade:gone", dir: "desc" } }, { owners: ["spxis"], gradeIds: ["docs", "overall"], rankIds: ["overall"], itemIds: new Set(["tane"]) });
    expect(v.sort).toEqual(DEFAULT_VIEW.sort);
    expect(v.filters.owner).toBe("all");
    expect(v.rankId).toBe("overall");
    expect(v.ticketList.filters.item).toBe("all");
  });
});

describe("the address the page writes", () => {
  it("names the tab, the ranking and the favourites filter, so a copied link opens the same view", () => {
    expect(hashFor({ ...DEFAULT_VIEW, tab: "rankings", rankId: "grade:tests" })).toBe("#tab=rankings&rank=grade%3Atests");
    expect(hashFor({ ...DEFAULT_VIEW, filters: { ...DEFAULT_VIEW.filters, favouritesOnly: true } })).toBe("#tab=table&filter=favourites");
    expect(hashFor(DEFAULT_VIEW)).toBe("#tab=table");
    expect(readHash(hashFor({ ...DEFAULT_VIEW, tab: "rankings", rankId: "grade:tests" })).rank).toBe("grade:tests");
  });

  it("knows the default view", () => {
    expect(isDefaultView(DEFAULT_VIEW)).toBe(true);
    expect(isDefaultView(stored)).toBe(false);
  });
});

describe("the comparison choice (SUMILABU-14)", () => {
  it("is remembered, and falls back alone when it is not one of the three", () => {
    expect(readStoredView(raw).compare).toBe("month");
    const bad = JSON.parse(raw);
    bad.compare = "year";
    const v = readStoredView(JSON.stringify(bad));
    expect(v.compare).toBe("previous");
    expect(v.sort).toEqual(stored.sort);
  });

  it("is not dropped by a run that has no run that old yet", () => {
    expect(fitView(readStoredView(raw), { owners: ["johnmorrisdotca"], gradeIds: [], rankIds: ["performance"], itemIds: new Set(["kazoku-ui"]) }).compare).toBe("month");
  });

  it("has a Changes tab the address can name", () => {
    expect(readHash("#tab=changes").tab).toBe("changes");
    expect(hashFor({ ...DEFAULT_VIEW, tab: "changes" })).toBe("#tab=changes");
  });
});
