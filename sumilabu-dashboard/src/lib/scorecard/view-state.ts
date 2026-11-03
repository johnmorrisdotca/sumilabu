import { TICKET_KINDS, TICKET_PRIORITIES } from "./contract";
import { NO_FILTERS, type Filters, type SortDir, type SortKey } from "./view";

/*
 * The scorecard remembers how John left it (SUMILABU-10): sort, tab, filter
 * chips, search, the ranking chosen, the detail tab and the ticket views. Kept
 * in the browser (localStorage), one key per page with a version, because these
 * are per-device preferences; the hearts are on the server (SUMILABU-9).
 *
 * Three sources, one rule per field: what the address names wins (a link
 * opens exactly what it says), then what was stored, then the default. Every
 * stored field is checked on its own and a bad one falls back alone, so a
 * value written by an older page never breaks the view, and a version bump
 * drops everything older at once.
 */

export const VIEW_STORAGE_KEY = "sumilabu.scorecard.view";
export const VIEW_VERSION = 1;

export const VIEW_TABS = ["table", "tickets", "rankings", "method"] as const;
export type ViewTab = (typeof VIEW_TABS)[number];
export const DETAIL_TAB_IDS = ["grades", "facts", "numbers"] as const;
export type DetailTabId = (typeof DETAIL_TAB_IDS)[number];

export const TICKET_STATUSES = ["open", "in progress", "waiting on John", "done"] as const;
export type TicketListFilters = {
  kind: "all" | (typeof TICKET_KINDS)[number];
  priority: "all" | (typeof TICKET_PRIORITIES)[number];
  status: "all" | (typeof TICKET_STATUSES)[number];
  /** Done tickets: the last 30 days, or every one the boards gave. */
  done: "30" | "all";
  query: string;
  /** The all-tickets view's package chip; the detail's list ignores it. */
  item: string;
};
export const TICKET_LIST_SORTS = ["priority", "age", "id", "title", "kind", "status", "item"] as const;
export type TicketListSort = { key: (typeof TICKET_LIST_SORTS)[number]; dir: SortDir };

export const TICKET_TABLE_SORTS = ["name", "open", "bugs", "features", "urgent", "inProgress", "done30", "oldest"] as const;
export type TicketTableSort = { key: (typeof TICKET_TABLE_SORTS)[number]; dir: SortDir };
export type TicketTableChips = { hasBugs: boolean; hasCritical: boolean; nothingOpen: boolean };

export type ViewState = {
  tab: ViewTab;
  sort: { key: SortKey; dir: SortDir };
  filters: Filters;
  rankId: string;
  detailTab: DetailTabId;
  ticketTable: { sort: TicketTableSort; chips: TicketTableChips };
  ticketList: { filters: TicketListFilters; sort: TicketListSort };
};

export const NO_TICKET_FILTERS: TicketListFilters = { kind: "all", priority: "all", status: "all", done: "30", query: "", item: "all" };

export const DEFAULT_VIEW: ViewState = {
  tab: "table",
  sort: { key: "grade:overall", dir: "desc" },
  filters: NO_FILTERS,
  rankId: "overall",
  detailTab: "grades",
  ticketTable: { sort: { key: "open", dir: "desc" }, chips: { hasBugs: false, hasCritical: false, nothingOpen: false } },
  ticketList: { filters: NO_TICKET_FILTERS, sort: { key: "priority", dir: "asc" } },
};

const SORT_KEYS = ["name", "kind", "owner", "version", "days", "downloads", "stars"];
const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const text = (v: unknown, max: number, fallback: string) => (typeof v === "string" && v.length <= max ? v : fallback);
const dir = (v: unknown, fallback: SortDir): SortDir => (v === "asc" || v === "desc" ? v : fallback);

export function isSortKey(v: unknown): v is SortKey {
  return typeof v === "string" && (SORT_KEYS.includes(v) || /^grade:[A-Za-z0-9_]{1,30}$/.test(v));
}

/** The stored text as a view: every field checked alone, anything unreadable is the default. */
export function readStoredView(raw: string | null | undefined): ViewState {
  if (!raw) return DEFAULT_VIEW;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return DEFAULT_VIEW;
  }
  if (!isObj(value) || value.v !== VIEW_VERSION) return DEFAULT_VIEW;
  const d = DEFAULT_VIEW;
  const sort = isObj(value.sort) && isSortKey(value.sort.key) ? { key: value.sort.key, dir: dir(value.sort.dir, "desc") } : d.sort;
  const f = isObj(value.filters) ? value.filters : {};
  const kind = oneOf(["all", "package", "site", "app"] as const, f.kind, "all");
  const filters: Filters = {
    kind,
    owner: text(f.owner, 60, "all") || "all",
    query: text(f.query, 200, ""),
    flaggedOnly: bool(f.flaggedOnly, false),
    favouritesOnly: bool(f.favouritesOnly, false),
  };
  const tt = isObj(value.ticketTable) ? value.ticketTable : {};
  const ttSort = isObj(tt.sort) ? tt.sort : {};
  const ttChips = isObj(tt.chips) ? tt.chips : {};
  const tl = isObj(value.ticketList) ? value.ticketList : {};
  const tlf = isObj(tl.filters) ? tl.filters : {};
  const tlSort = isObj(tl.sort) ? tl.sort : {};
  return {
    tab: oneOf(VIEW_TABS, value.tab, d.tab),
    sort,
    filters,
    rankId: typeof value.rankId === "string" && /^[A-Za-z0-9:_-]{1,60}$/.test(value.rankId) ? value.rankId : d.rankId,
    detailTab: oneOf(DETAIL_TAB_IDS, value.detailTab, d.detailTab),
    ticketTable: {
      sort: { key: oneOf(TICKET_TABLE_SORTS, ttSort.key, d.ticketTable.sort.key), dir: dir(ttSort.dir, d.ticketTable.sort.dir) },
      chips: { hasBugs: bool(ttChips.hasBugs, false), hasCritical: bool(ttChips.hasCritical, false), nothingOpen: bool(ttChips.nothingOpen, false) },
    },
    ticketList: {
      filters: {
        kind: oneOf(["all", ...TICKET_KINDS] as const, tlf.kind, "all"),
        priority: oneOf(["all", ...TICKET_PRIORITIES] as const, tlf.priority, "all"),
        status: oneOf(["all", ...TICKET_STATUSES] as const, tlf.status, "all"),
        done: oneOf(["30", "all"] as const, tlf.done, "30"),
        query: text(tlf.query, 200, ""),
        item: typeof tlf.item === "string" && /^[A-Za-z0-9._@/-]{1,100}$/.test(tlf.item) ? tlf.item : "all",
      },
      sort: { key: oneOf(TICKET_LIST_SORTS, tlSort.key, d.ticketList.sort.key), dir: dir(tlSort.dir, d.ticketList.sort.dir) },
    },
  };
}

export function serializeView(view: ViewState): string {
  return JSON.stringify({ v: VIEW_VERSION, ...view });
}

/** What an address names: `#item=jirai&dtab=numbers`, `#tab=rankings&rank=performance`, `#tab=table&filter=favourites`. */
export type HashView = { item: string | null; tab: ViewTab | null; rank: string | null; dtab: DetailTabId | null; favourites: boolean | null };

export function readHash(hash: string): HashView {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const tab = params.get("tab");
  const dtab = params.get("dtab");
  const rank = params.get("rank");
  const filter = params.get("filter");
  const item = params.get("item");
  const goodRank = rank && /^[A-Za-z0-9:_-]{1,60}$/.test(rank) ? rank : null;
  return {
    item: item && /^[A-Za-z0-9._@/-]{1,100}$/.test(item) ? item : null,
    tab: VIEW_TABS.includes(tab as ViewTab) ? (tab as ViewTab) : goodRank ? "rankings" : null,
    rank: goodRank,
    dtab: DETAIL_TAB_IDS.includes(dtab as DetailTabId) ? (dtab as DetailTabId) : null,
    favourites: filter === null ? null : filter === "favourites",
  };
}

/** Field by field: the address, then the stored view, then the default (already folded into `stored`). */
export function resolveView(hash: HashView, stored: ViewState): ViewState {
  return {
    ...stored,
    tab: hash.tab ?? stored.tab,
    rankId: hash.rank ?? stored.rankId,
    detailTab: hash.dtab ?? stored.detailTab,
    filters: hash.favourites === null ? stored.filters : { ...stored.filters, favouritesOnly: hash.favourites },
  };
}

/** The address for a list view, so it can be copied: the tab, the ranking, and the favourites filter. */
export function hashFor(view: ViewState): string {
  if (view.tab === "rankings") return `#tab=rankings&rank=${encodeURIComponent(view.rankId)}`;
  if (view.tab === "table" && view.filters.favouritesOnly) return "#tab=table&filter=favourites";
  return `#tab=${view.tab}`;
}

/** A view whose choices still exist in this run: an owner, a sort column or a ranking that went away falls back. */
export function fitView(view: ViewState, run: { owners: readonly string[]; gradeIds: readonly string[]; rankIds: readonly string[]; itemIds: ReadonlySet<string> }): ViewState {
  const sortOk = !view.sort.key.startsWith("grade:") || run.gradeIds.includes(view.sort.key.slice("grade:".length));
  const ownerOk = view.filters.owner === "all" || run.owners.includes(view.filters.owner);
  const itemOk = view.ticketList.filters.item === "all" || run.itemIds.has(view.ticketList.filters.item);
  return {
    ...view,
    sort: sortOk ? view.sort : DEFAULT_VIEW.sort,
    filters: ownerOk ? view.filters : { ...view.filters, owner: "all" },
    rankId: run.rankIds.includes(view.rankId) ? view.rankId : DEFAULT_VIEW.rankId,
    ticketList: itemOk ? view.ticketList : { ...view.ticketList, filters: { ...view.ticketList.filters, item: "all" } },
  };
}

/** Whether anything differs from the default: the page hides its lists until a stored view is applied only then. */
export function isDefaultView(view: ViewState): boolean {
  return serializeView(view) === serializeView(DEFAULT_VIEW);
}
