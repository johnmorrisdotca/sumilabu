import { TICKET_KINDS, TICKET_PRIORITIES, type Scorecard, type ScorecardItem, type Ticket, type TicketsBlock } from "./contract";
import type { TicketListFilters, TicketListSort, TicketTableChips, TicketTableSort } from "./view-state";

/*
 * Tickets on the scorecard (SUMILABU-12): the boards' tickets per item, as
 * counts, as one comparing table and as a list to browse. Pure; the numbers
 * are the collector's, and a null stays a null (the boards could not say),
 * never a zero.
 */

export type Kind = (typeof TICKET_KINDS)[number];
export type Priority = (typeof TICKET_PRIORITIES)[number];

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Open tickets of one kind, any priority. */
export function openOfKind(block: TicketsBlock, kind: Kind): number {
  return sum(Object.values(block.openByKind[kind]));
}

/** Open critical and high, any kind. */
export function openUrgent(block: TicketsBlock): number {
  return sum(TICKET_KINDS.map((k) => block.openByKind[k].critical + block.openByKind[k].high));
}

export function openCritical(block: TicketsBlock): number {
  return sum(TICKET_KINDS.map((k) => block.openByKind[k].critical));
}

export type TicketTotals = { open: number; inProgress: number; bugs: number; criticalBugs: number; critical: number; byKind: Record<Kind, number>; doneLast7: number | null; boardsRead: number };

/** The line at the top of the scorecard: every item's block plus the family-wide one. Done is null unless every block could count it. */
export function ticketTotals(doc: Pick<Scorecard, "items" | "familyTickets">): TicketTotals {
  const blocks = [...doc.items.map((i) => i.tickets), doc.familyTickets].filter((b): b is TicketsBlock => b !== null);
  const done = blocks.map((b) => b.doneLast7);
  return {
    open: sum(blocks.map((b) => b.open)),
    inProgress: sum(blocks.map((b) => b.inProgress)),
    bugs: sum(blocks.map((b) => openOfKind(b, "bug"))),
    criticalBugs: sum(blocks.map((b) => b.openByKind.bug.critical)),
    critical: sum(blocks.map(openCritical)),
    byKind: Object.fromEntries(TICKET_KINDS.map((k) => [k, sum(blocks.map((b) => openOfKind(b, k)))])) as Record<Kind, number>,
    doneLast7: blocks.length > 0 && done.every((d) => d !== null) ? sum(done as number[]) : done.some((d) => d !== null) ? sum(done.filter((d): d is number => d !== null)) : null,
    boardsRead: blocks.length,
  };
}

/** "432 open tickets, 41 bugs (2 critical), 421 done this week". */
export function totalsSentence(t: TicketTotals): string {
  const open = `${t.open} open ticket${t.open === 1 ? "" : "s"}`;
  const bugs = `${t.bugs} bug${t.bugs === 1 ? "" : "s"}${t.criticalBugs > 0 ? ` (${t.criticalBugs} critical)` : ""}`;
  const done = t.doneLast7 === null ? "done this week not read" : `${t.doneLast7} done this week`;
  return `${open}, ${bugs}, ${done}`;
}

export type TicketRow = {
  item: ScorecardItem;
  open: number;
  bugs: number;
  features: number;
  urgent: number;
  critical: number;
  inProgress: number;
  done30: number | null;
  oldest: number | null;
};

/** One row of the Tickets tab, or null for an item no board was read for. */
export function ticketRow(item: ScorecardItem): TicketRow | null {
  const b = item.tickets;
  if (!b) return null;
  return { item, open: b.open, bugs: openOfKind(b, "bug"), features: openOfKind(b, "feature"), urgent: openUrgent(b), critical: openCritical(b), inProgress: b.inProgress, done30: b.doneLast30, oldest: b.oldestOpenDays };
}

export function filterTicketRows(rows: readonly TicketRow[], chips: TicketTableChips): TicketRow[] {
  return rows.filter((r) => (!chips.hasBugs || r.bugs > 0) && (!chips.hasCritical || r.critical > 0) && (!chips.nothingOpen || r.open === 0));
}

/** Sorted like the main table: a missing number last either way, then by name. */
export function sortTicketRows(rows: readonly TicketRow[], sort: TicketTableSort): TicketRow[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const value = (r: TicketRow): number | string | null => (sort.key === "name" ? r.item.name.toLowerCase() : sort.key === "done30" ? r.done30 : r[sort.key]);
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null && vb === null) return a.item.name.localeCompare(b.item.name);
    if (va === null) return 1;
    if (vb === null) return -1;
    const order = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
    return order === 0 ? a.item.name.localeCompare(b.item.name) : order * sign;
  });
}

/* ---- the list of tickets ---- */

export type ListedTicket = Ticket & { itemId: string; itemName: string };

/** Every ticket of the given items (and the family-wide ones), each once: `list`, else the urgent and recently done the older collector wrote. */
export function ticketsOf(items: readonly ScorecardItem[], familyTickets: TicketsBlock | null = null): ListedTicket[] {
  const out: ListedTicket[] = [];
  const add = (block: TicketsBlock | null, itemId: string, itemName: string) => {
    if (!block) return;
    const seen = new Set<string>();
    for (const t of [...block.list, ...block.urgent, ...block.recentDone]) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push({ ...t, itemId, itemName });
    }
  };
  for (const item of items) add(item.tickets, item.id, item.name);
  add(familyTickets, FAMILY_WIDE, "Family-wide");
  return out;
}

/** The package chip's value for tickets on a shared board that name no item. */
export const FAMILY_WIDE = "family-wide";

const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, normal: 3, low: 4, unset: 5 };
const STATUS_RANK = { "in progress": 0, "waiting on John": 1, waiting: 2, done: 3 } as const;

/** Days since a date, or null when the board gave none. */
export function ageDays(created: string | null, nowIso: string): number | null {
  if (!created) return null;
  const ms = new Date(nowIso).getTime() - new Date(created.slice(0, 10) + "T00:00:00Z").getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86_400_000)) : null;
}

function withinDays(date: string | null, days: number, nowIso: string): boolean {
  const age = ageDays(date, nowIso);
  return age !== null && age <= days;
}

function statusMatches(t: Ticket, status: TicketListFilters["status"]): boolean {
  if (status === "all") return true;
  if (status === "open") return t.status !== "done";
  return t.status === status;
}

/** What one chip would leave, ignoring that chip's own group, so each chip can print the count it would give. */
export function filterTickets(tickets: readonly ListedTicket[], f: TicketListFilters, nowIso: string, ignore: keyof TicketListFilters | null = null): ListedTicket[] {
  const q = f.query.trim().toLowerCase();
  return tickets.filter((t) => {
    if (t.status === "done" && f.done === "30" && ignore !== "done" && !withinDays(t.done, 30, nowIso)) return false;
    if (ignore !== "kind" && f.kind !== "all" && t.kind !== f.kind) return false;
    if (ignore !== "priority" && f.priority !== "all" && t.priority !== f.priority) return false;
    if (ignore !== "status" && !statusMatches(t, f.status)) return false;
    if (ignore !== "item" && f.item !== "all" && t.itemId !== f.item) return false;
    if (q && !`${t.id} ${t.title} ${t.detail ?? ""} ${t.claimedBy ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Counts per chip value, each with every other filter applied: what pressing that chip would show. */
export function chipCounts<K extends "kind" | "priority" | "status">(tickets: readonly ListedTicket[], f: TicketListFilters, nowIso: string, group: K, values: readonly string[]): Record<string, number> {
  const base = filterTickets(tickets, f, nowIso, group);
  return Object.fromEntries(values.map((v) => [v, v === "all" ? base.length : base.filter((t) => (group === "status" ? statusMatches(t, v as TicketListFilters["status"]) : t[group] === v)).length]));
}

/** Priority first (critical at the top), then oldest first; or by the column John pressed, the same two breaking ties. */
export function sortTickets(tickets: readonly ListedTicket[], sort: TicketListSort, nowIso: string): ListedTicket[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const age = (t: ListedTicket) => ageDays(t.created, nowIso) ?? -1;
  const base = (a: ListedTicket, b: ListedTicket) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || age(b) - age(a) || a.id.localeCompare(b.id);
  const by = (a: ListedTicket, b: ListedTicket): number => {
    switch (sort.key) {
      case "priority":
        return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) * sign || age(b) - age(a) || a.id.localeCompare(b.id);
      case "age":
        return (age(a) - age(b)) * sign || base(a, b);
      case "status":
        return (STATUS_RANK[a.status] - STATUS_RANK[b.status]) * sign || base(a, b);
      case "item":
        return a.itemName.localeCompare(b.itemName) * sign || base(a, b);
      default:
        return String(a[sort.key]).localeCompare(String(b[sort.key])) * sign || base(a, b);
    }
  };
  return [...tickets].sort(by);
}

/* ---- the charts' numbers ---- */

export type Segment = { key: string; label: string; value: number; x: number; width: number };

/** A stacked bar's segments in `width` units, in the given order, empty ones left out; the last ends exactly at the total's share. */
export function stackSegments(parts: ReadonlyArray<{ key: string; label: string; value: number }>, width: number, total = sum(parts.map((p) => p.value))): Segment[] {
  if (total <= 0) return [];
  let x = 0;
  return parts
    .filter((p) => p.value > 0)
    .map((p) => {
      const w = (p.value / total) * width;
      const seg = { ...p, x, width: w };
      x += w;
      return seg;
    });
}

export function openByKindParts(block: TicketsBlock | null): Array<{ key: Kind; label: string; value: number }> {
  return TICKET_KINDS.map((k) => ({ key: k, label: KIND_LABEL[k], value: block ? openOfKind(block, k) : 0 }));
}

export const KIND_LABEL: Record<Kind, string> = { bug: "bugs", feature: "features", chore: "chores", other: "other" };

/** Done tickets per day over the last `days` days, oldest first; null when no ticket carries a done date. */
export function donePerDay(tickets: readonly Ticket[], nowIso: string, days = 30): number[] | null {
  const dated = tickets.filter((t) => t.status === "done" && t.done);
  if (dated.length === 0) return null;
  const counts = new Array<number>(days).fill(0);
  for (const t of dated) {
    const age = ageDays(t.done, nowIso);
    if (age !== null && age < days) counts[days - 1 - age]++;
  }
  return counts;
}

/** Done tickets per week over the last `weeks` weeks, oldest first; null when no ticket carries a done date. */
export function donePerWeek(tickets: readonly Ticket[], nowIso: string, weeks = 8): number[] | null {
  const daily = donePerDay(tickets, nowIso, weeks * 7);
  if (!daily) return null;
  return Array.from({ length: weeks }, (_, w) => sum(daily.slice(w * 7, w * 7 + 7)));
}
