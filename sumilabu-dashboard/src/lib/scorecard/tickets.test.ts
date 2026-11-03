import { describe, expect, it } from "vitest";

import { parseScorecard, type Ticket } from "./contract";
import run from "./fixtures/map-run.json";
import { ageDays, chipCounts, donePerDay, donePerWeek, filterTicketRows, filterTickets, openOfKind, sortTicketRows, sortTickets, stackSegments, ticketRow, ticketTotals, ticketsOf, totalsSentence, type ListedTicket, type TicketRow } from "./tickets";
import { NO_TICKET_FILTERS } from "./view-state";

const parsed = parseScorecard(run);
if (!parsed.ok) throw new Error(parsed.problems.join("; "));
const doc = parsed.doc;
const NOW = "2026-11-03T12:00:00Z";

const t = (over: Partial<ListedTicket>): ListedTicket => ({ id: "X-1", title: "t", kind: "feature", kindDerived: false, priority: "normal", status: "waiting", created: null, done: null, url: null, claimedBy: null, detail: null, itemId: "a", itemName: "a", ...over });

describe("ticket totals", () => {
  it("adds every item's block and the family-wide one, and the kinds add up to the open count", () => {
    const totals = ticketTotals(doc);
    const open = doc.items.reduce((s, i) => s + (i.tickets?.open ?? 0), 0) + (doc.familyTickets?.open ?? 0);
    expect(totals.open).toBe(open);
    expect(Object.values(totals.byKind).reduce((a, b) => a + b, 0)).toBe(open);
    expect(totals.bugs).toBe(totals.byKind.bug);
  });

  it("says it in one line, and says when done is not known", () => {
    expect(totalsSentence({ open: 3, inProgress: 1, bugs: 1, criticalBugs: 1, critical: 1, byKind: { bug: 1, feature: 2, chore: 0, other: 0 }, doneLast7: 4, boardsRead: 2 })).toBe("3 open tickets, 1 bug (1 critical), 4 done this week");
    expect(totalsSentence({ open: 1, inProgress: 0, bugs: 0, criticalBugs: 0, critical: 0, byKind: { bug: 0, feature: 1, chore: 0, other: 0 }, doneLast7: null, boardsRead: 1 })).toBe("1 open ticket, 0 bugs, done this week not read");
  });
});

describe("the Tickets tab's rows", () => {
  const rows = doc.items.map(ticketRow).filter((r): r is TicketRow => r !== null);

  it("has a row per item with a board, with its open, bugs and critical-or-high", () => {
    expect(rows.length).toBe(doc.items.filter((i) => i.tickets).length);
    const k = rows.find((r) => r.item.id === "kazoku-ui")!;
    expect(k.open).toBe(k.item.tickets!.open);
    expect(k.bugs).toBe(openOfKind(k.item.tickets!, "bug"));
  });

  it("filters by the chips", () => {
    expect(filterTicketRows(rows, { hasBugs: true, hasCritical: false, nothingOpen: false }).every((r) => r.bugs > 0)).toBe(true);
    expect(filterTicketRows(rows, { hasBugs: false, hasCritical: false, nothingOpen: true }).every((r) => r.open === 0)).toBe(true);
  });

  it("sorts by a column with missing numbers last either way", () => {
    const byOpen = sortTicketRows(rows, { key: "open", dir: "desc" });
    expect(byOpen[0].open).toBe(Math.max(...rows.map((r) => r.open)));
    const done = sortTicketRows(rows, { key: "done30", dir: "asc" });
    expect(done.at(-1)!.done30).toBeNull();
  });
});

describe("the list of tickets", () => {
  it("has every ticket of every item and the family-wide ones, each once", () => {
    const all = ticketsOf(doc.items, doc.familyTickets);
    const expected = doc.items.reduce((s, i) => s + (i.tickets ? new Set([...i.tickets.list, ...i.tickets.urgent].map((x) => x.id)).size : 0), 0) + (doc.familyTickets?.list.length ?? 0);
    expect(all.length).toBe(expected);
    expect(all.some((x) => x.itemId === "family-wide")).toBe(doc.familyTickets !== null && doc.familyTickets.list.length > 0);
  });

  it("filters by kind, priority, status, package and words, and counts each chip with the other filters on", () => {
    const list = [t({ id: "A", kind: "bug", priority: "high" }), t({ id: "B", kind: "bug", priority: "low", status: "in progress" }), t({ id: "C", kind: "feature", priority: "high", itemId: "b", detail: "zoom slider" })];
    expect(filterTickets(list, { ...NO_TICKET_FILTERS, kind: "bug" }, NOW).map((x) => x.id)).toEqual(["A", "B"]);
    expect(filterTickets(list, { ...NO_TICKET_FILTERS, status: "in progress" }, NOW).map((x) => x.id)).toEqual(["B"]);
    expect(filterTickets(list, { ...NO_TICKET_FILTERS, query: "ZOOM" }, NOW).map((x) => x.id)).toEqual(["C"]);
    expect(filterTickets(list, { ...NO_TICKET_FILTERS, item: "b" }, NOW).map((x) => x.id)).toEqual(["C"]);
    expect(chipCounts(list, { ...NO_TICKET_FILTERS, priority: "high" }, NOW, "kind", ["all", "bug", "feature"])).toEqual({ all: 2, bug: 1, feature: 1 });
  });

  it("shows done tickets of the last 30 days unless asked for all", () => {
    const list = [t({ id: "old", status: "done", done: "2026-09-01" }), t({ id: "new", status: "done", done: "2026-11-01" }), t({ id: "open" })];
    expect(filterTickets(list, NO_TICKET_FILTERS, NOW).map((x) => x.id)).toEqual(["new", "open"]);
    expect(filterTickets(list, { ...NO_TICKET_FILTERS, done: "all" }, NOW)).toHaveLength(3);
    expect(filterTickets(list, { ...NO_TICKET_FILTERS, status: "open" }, NOW).map((x) => x.id)).toEqual(["open"]);
  });

  it("sorts by priority, then the oldest first, with favourite packages on top", () => {
    const list = [t({ id: "n", priority: "normal", created: "2026-10-01" }), t({ id: "c", priority: "critical", created: "2026-11-01" }), t({ id: "h-old", priority: "high", created: "2026-09-01" }), t({ id: "h-new", priority: "high", created: "2026-10-30" }), t({ id: "fav", priority: "low", itemId: "fav" })];
    expect(sortTickets(list, { key: "priority", dir: "asc" }, new Set(), NOW).map((x) => x.id)).toEqual(["c", "h-old", "h-new", "n", "fav"]);
    expect(sortTickets(list, { key: "priority", dir: "asc" }, new Set(["fav"]), NOW)[0].id).toBe("fav");
  });

  it("counts a ticket's age in whole days, null without a date", () => {
    expect(ageDays("2026-11-01", NOW)).toBe(2);
    expect(ageDays(null, NOW)).toBeNull();
  });
});

describe("the charts' numbers", () => {
  it("cuts a stacked bar into parts that add up to its width, empty parts left out", () => {
    const segs = stackSegments([{ key: "bug", label: "bugs", value: 1 }, { key: "feature", label: "features", value: 0 }, { key: "chore", label: "chores", value: 3 }], 100);
    expect(segs.map((s) => [s.key, s.x, s.width])).toEqual([["bug", 0, 25], ["chore", 25, 75]]);
    expect(stackSegments([{ key: "bug", label: "bugs", value: 0 }], 100)).toEqual([]);
  });

  it("scales a bar against the longest when given one", () => {
    const segs = stackSegments([{ key: "bug", label: "bugs", value: 2 }], 50, 2);
    expect(segs[0].width).toBe(50);
  });

  it("bins done tickets by day and week, oldest first, and says nothing when no ticket has a done date", () => {
    const done = (d: string): Ticket => t({ status: "done", done: d });
    const days = donePerDay([done("2026-11-03"), done("2026-11-02"), done("2026-11-02"), done("2026-08-01")], NOW, 30)!;
    expect(days).toHaveLength(30);
    expect(days.slice(-2)).toEqual([2, 1]);
    expect(donePerWeek([done("2026-11-03"), done("2026-10-25")], NOW, 8)!.slice(-2)).toEqual([1, 1]);
    expect(donePerDay([t({})], NOW)).toBeNull();
  });
});
