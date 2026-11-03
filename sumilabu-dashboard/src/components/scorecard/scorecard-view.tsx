"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import Link from "next/link";

import { changesSentence, chosenComparison, figuresOf, sinceLabel } from "@/lib/scorecard/changes";
import { TICKET_KINDS } from "@/lib/scorecard/contract";
import { favouriteCount } from "@/lib/scorecard/favourites";
import { familyMedian } from "@/lib/scorecard/radar";
import type { ScorecardData } from "@/lib/scorecard/server";
import { FAMILY_WIDE, KIND_LABEL, donePerDay, ticketTotals, ticketsOf, totalsSentence } from "@/lib/scorecard/tickets";
import {
  ageLabel,
  averageOverall,
  defaultDir,
  filterItems,
  gradeColumns,
  rankingIds,
  runIsStale,
  sortItems,
  trendOf,
  type Filters,
  type SortKey,
} from "@/lib/scorecard/view";
import {
  DEFAULT_VIEW,
  VIEW_STORAGE_KEY,
  fitView,
  hashFor,
  readHash,
  readStoredView,
  resolveView,
  serializeView,
  type ViewState,
  type ViewTab,
} from "@/lib/scorecard/view-state";

import { ChangesContext, type ChangesView } from "./change-arrow";
import { ChangesPanel, ComparePicker } from "./changes-panel";
import { ItemDetail } from "./item-detail";
import { MethodPanel } from "./method-panel";
import { RankingsPanel } from "./rankings-panel";
import { ScorecardCards } from "./scorecard-cards";
import { ScorecardTable } from "./scorecard-table";
import { DoneBars, KindBar, KindLegend, TicketFigures } from "./ticket-charts";
import { TicketBrowser } from "./ticket-browser";
import { TicketsPanel } from "./tickets-panel";
import { useFavourites } from "./use-favourites";

const TABS: Array<{ id: ViewTab; label: string }> = [
  { id: "table", label: "Scorecard" },
  { id: "changes", label: "Changes" },
  { id: "tickets", label: "Tickets" },
  { id: "rankings", label: "Rankings" },
  { id: "method", label: "How it is graded" },
];

const KIND_CHIPS: Array<{ id: Filters["kind"]; label: string }> = [
  { id: "all", label: "All" },
  { id: "package", label: "Packages" },
  { id: "site", label: "Sites" },
  { id: "app", label: "Apps" },
];

/** The attribute the page's inline script sets while a remembered view waits to be applied (see page.tsx). */
export const RESTORING_ATTR = "data-sc-restoring";

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-stone-900 bg-stone-900 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900" : "border-stone-300 bg-white/80 text-stone-700 hover:border-stone-500 hover:bg-white dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"}`;
const card = "rounded-2xl border border-stone-300/80 bg-white/90 shadow-sm dark:border-stone-700 dark:bg-stone-900/90";

function utcStamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function readStorage(): string | null {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(VIEW_STORAGE_KEY);
    else window.localStorage.setItem(VIEW_STORAGE_KEY, value);
  } catch {
    /* A private window, full or blocked storage: the page works, it just does not remember. */
  }
}

export function ScorecardView({ data, nowIso, favourites: initialFavourites = [] }: { data: ScorecardData | null; nowIso: string; favourites?: readonly string[] }) {
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
  const [restored, setRestored] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [hashDetailTab, setHashDetailTab] = useState<ViewState["detailTab"] | null>(null);
  const { favourites, toggle, message } = useFavourites(initialFavourites);

  const doc = data?.doc ?? null;
  const columns = useMemo(() => (doc ? gradeColumns(doc) : []), [doc]);
  const owners = useMemo(() => (doc ? [...new Set(doc.items.map((i) => i.owner))].sort() : []), [doc]);
  const run = useMemo(
    () => ({ owners, gradeIds: columns.map((c) => c.id), rankIds: doc ? rankingIds(doc, columns) : [], itemIds: new Set([...(doc?.items.map((i) => i.id) ?? []), FAMILY_WIDE]) }),
    [owners, columns, doc],
  );

  /*
   * The server renders the default view: it cannot see this browser's storage.
   * Before the first paint after hydration the address and the remembered view
   * are applied. The inline script in page.tsx hid the lists until then, and
   * only when there was something to apply, so the default order never shows
   * first. A layout effect, so the corrected view is the one painted.
   */
  /* eslint-disable react-hooks/set-state-in-effect -- restoring what only the browser knows, once, after hydration: the point of this effect */
  useLayoutEffect(() => {
    const hash = readHash(window.location.hash);
    setView(fitView(resolveView(hash, readStoredView(readStorage())), run));
    setOpenId(hash.item);
    setHashDetailTab(hash.dtab);
    setRestored(true);
    document.documentElement.removeAttribute(RESTORING_ATTR);
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival; later address changes are the listener below */
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const sync = () => {
      const hash = readHash(window.location.hash);
      setOpenId(hash.item);
      setHashDetailTab(hash.dtab);
      setView((v) => fitView(resolveView(hash, v), run));
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [run]);

  /* Stored only once restored: the first render's default must never overwrite what was remembered. */
  useEffect(() => {
    if (restored) writeStorage(serializeView(view));
  }, [view, restored]);

  const change = useCallback((next: ViewState, address = false) => {
    setView(next);
    if (address) history.replaceState(null, "", hashFor(next));
  }, []);
  const open = useCallback((id: string) => {
    window.location.hash = `item=${encodeURIComponent(id)}`;
    window.scrollTo({ top: 0 });
  }, []);
  const close = useCallback(() => {
    history.pushState(null, "", window.location.pathname + window.location.search + hashFor(view));
    setOpenId(null);
  }, [view]);
  const [refreshing, setRefreshing] = useState<"idle" | "busy" | "failed">("idle");
  /* Clears the server's cached reads, then loads the page again; the view comes back from this browser's memory and the hearts from the server. */
  const refresh = useCallback(async () => {
    setRefreshing("busy");
    try {
      const res = await fetch("/packages/refresh", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      window.location.reload();
    } catch {
      setRefreshing("failed");
    }
  }, []);
  const reset = useCallback(() => {
    writeStorage(null);
    setView(DEFAULT_VIEW);
    setOpenId(null);
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  const visible = useMemo(() => (doc ? sortItems(filterItems(doc.items, view.filters, favourites), view.sort.key, view.sort.dir) : []), [doc, view.filters, view.sort, favourites]);
  const allTickets = useMemo(() => (doc ? ticketsOf(doc.items, doc.familyTickets) : []), [doc]);
  const totals = useMemo(() => (doc ? ticketTotals(doc) : null), [doc]);
  /* The comparison was made when the run was uploaded (SUMILABU-14); the page only picks which of the three to show. */
  const storedChanges = data?.changes ?? null;
  const shown = chosenComparison(storedChanges, view.compare);
  const changesView = useMemo<ChangesView>(
    () => ({ comparison: shown?.comparison ?? null, since: shown && storedChanges ? sinceLabel(shown.comparison.at, storedChanges.at) : "" }),
    [shown, storedChanges],
  );
  const nowFigures = useMemo(() => (doc ? figuresOf(doc) : {}), [doc]);

  if (!data || !doc || !totals) {
    return (
      <section className={`${card} p-6`} data-testid="scorecard-empty">
        <h2 className="text-lg font-semibold">No scorecard has been uploaded yet</h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
          Run <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs dark:bg-stone-800">pnpm scorecard:upload</code> from <code className="font-mono text-xs">sumilabu-dashboard/</code> on the Mac that holds the collector&apos;s <code className="font-mono text-xs">latest.json</code>. This page fills in as soon as a run arrives.
        </p>
      </section>
    );
  }

  const filters = view.filters;
  const setFilters = (patch: Partial<Filters>, address = false) => change({ ...view, filters: { ...filters, ...patch } }, address);
  const stale = runIsStale(doc.generatedAt, nowIso);
  const flagged = doc.items.filter((i) => i.flags.length > 0).length;
  const favCount = favouriteCount(doc.items, favourites);
  const average = averageOverall(doc.items);
  const openItem = openId ? doc.items.find((i) => i.id === openId) : undefined;
  const itemsForFilter = doc.items
    .filter((i) => i.tickets)
    .map((i) => ({ id: i.id, name: i.name.replace(/^@johnmorrisdotca\//, "") }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const kindParts = TICKET_KINDS.map((k) => ({ key: k, label: KIND_LABEL[k], value: totals.byKind[k] }));

  return (
    <ChangesContext.Provider value={changesView}>
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <section className={`${card} grid gap-3 p-4`} data-testid="scorecard-summary">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="text-sm text-stone-700 dark:text-stone-200">
            <span className="font-semibold">Run {utcStamp(doc.generatedAt)}</span>
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${stale ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`} data-testid="scorecard-age">
              {ageLabel(doc.generatedAt, nowIso)}
            </span>
          </p>
          <p className="text-sm text-stone-600 dark:text-stone-300">
            {doc.items.length} items{average !== null ? ` · average overall ${average}` : ""} · {flagged} flagged
          </p>
          <span className="flex gap-2 print:hidden">
            <button type="button" onClick={refresh} disabled={refreshing === "busy"} className={chip(false)} data-testid="refresh-data" title="Clear the server's cached copy and show the newest data">
              {refreshing === "busy" ? "Refreshing…" : refreshing === "failed" ? "Refresh failed, try again" : "Refresh data"}
            </button>
            <button type="button" onClick={reset} className={chip(false)} data-testid="reset-view" title="Forget the sort, filters and tabs this browser remembers">
              Reset view
            </button>
            <button type="button" onClick={() => window.print()} className={chip(false)}>
              Print or save as PDF
            </button>
          </span>
        </div>
        {storedChanges && shown ? (
          <div className="grid gap-1 border-t border-stone-200 pt-3 dark:border-stone-700" data-testid="changes-summary">
            <ComparePicker changes={storedChanges} chosen={view.compare} shown={shown.id} onPick={(compare) => change({ ...view, compare })} />
            <p className="text-sm text-stone-700 dark:text-stone-200" data-testid="changes-summary-sentence">
              {changesSentence(shown.comparison, changesView.since)}{" "}
              {view.tab !== "changes" && !openItem ? (
                <button type="button" onClick={() => change({ ...view, tab: "changes" }, true)} className="underline underline-offset-2 print:hidden">
                  See the biggest movers
                </button>
              ) : null}
            </p>
          </div>
        ) : (
          <p className="border-t border-stone-200 pt-3 text-xs text-stone-500 dark:border-stone-700 dark:text-stone-400" data-testid="changes-summary">
            Up and down arrows for what changed start with the next upload: each run is compared with the one before, a week back and a month back.
          </p>
        )}
        {stale ? <p className="text-sm text-red-700">This run is more than a week old: the collector has probably stopped. Run it again and upload.</p> : null}
        {totals.boardsRead > 0 ? (
          <div className="grid gap-3 border-t border-stone-200 pt-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] dark:border-stone-700" data-testid="ticket-summary">
            <div className="grid content-start gap-2">
              <p className="text-sm font-semibold" data-testid="ticket-sentence">{totalsSentence(totals)}</p>
              <TicketFigures totals={totals} />
            </div>
            <div className="grid content-start gap-2">
              <KindBar parts={kindParts} label="All open tickets" height={26} />
              <KindLegend />
              <DoneBars counts={donePerDay(allTickets, nowIso, 30)} unit="day" label="Done per day, last 30 days" />
            </div>
          </div>
        ) : null}
        {message ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400" data-testid="favourite-error">
            {message}
          </p>
        ) : null}
      </section>

      <div data-sc-body className="grid grid-cols-[minmax(0,1fr)] gap-3">
        {openItem ? (
          <ItemDetail
            key={openItem.id}
            item={openItem}
            columns={columns}
            trend={trendOf(data.trend, openItem.id)}
            onBack={close}
            initialTab={hashDetailTab ?? view.detailTab}
            onTabChange={(detailTab) => change({ ...view, detailTab })}
            favourite={favourites.has(openItem.id)}
            onToggleFavourite={() => toggle(openItem.id, openItem.name)}
            median={familyMedian(openItem, doc.items, columns)}
            tickets={allTickets.filter((t) => t.itemId === openItem.id)}
            ticketView={{ filters: { ...view.ticketList.filters, item: "all" }, sort: view.ticketList.sort }}
            onTicketView={(next) => change({ ...view, ticketList: { filters: { ...next.filters, item: view.ticketList.filters.item }, sort: next.sort } })}
            favourites={favourites}
            nowIso={nowIso}
            figures={nowFigures[openItem.id]?.figures}
          />
        ) : openId ? (
          <section className={`${card} p-6`}>
            <p className="text-sm text-stone-700 dark:text-stone-200">
              There is no item called <span className="font-mono">{openId}</span> in this run.
            </p>
            <button type="button" onClick={close} className="mt-2 text-sm underline underline-offset-2">
              ← All items
            </button>
          </section>
        ) : (
          <>
            <div role="tablist" aria-label="View" className="flex flex-wrap gap-2 print:hidden">
              {TABS.map((t) => (
                <button key={t.id} role="tab" type="button" aria-selected={view.tab === t.id} onClick={() => change({ ...view, tab: t.id }, true)} className={chip(view.tab === t.id)}>
                  {t.label}
                </button>
              ))}
            </div>

            {view.tab === "table" ? (
              <>
                <div className="flex flex-wrap items-center gap-2 print:hidden" data-testid="scorecard-filters">
                  <div role="group" aria-label="Kind" className="flex flex-wrap gap-2">
                    {KIND_CHIPS.map((k) => (
                      <button key={k.id} type="button" aria-pressed={filters.kind === k.id} onClick={() => setFilters({ kind: k.id })} className={chip(filters.kind === k.id)}>
                        {k.label}
                      </button>
                    ))}
                  </div>
                  {owners.length > 1 ? (
                    <div role="group" aria-label="Owner" className="flex flex-wrap gap-2">
                      {["all", ...owners].map((o) => (
                        <button key={o} type="button" aria-pressed={filters.owner === o} onClick={() => setFilters({ owner: o })} className={chip(filters.owner === o)}>
                          {o === "all" ? "Any owner" : o}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <button type="button" aria-pressed={filters.flaggedOnly} onClick={() => setFilters({ flaggedOnly: !filters.flaggedOnly })} className={chip(filters.flaggedOnly)}>
                    ⚑ Flagged ({flagged})
                  </button>
                  <button type="button" aria-pressed={filters.favouritesOnly} onClick={() => setFilters({ favouritesOnly: !filters.favouritesOnly }, true)} className={chip(filters.favouritesOnly)} data-testid="favourites-chip">
                    ♥ Favourites ({favCount})
                  </button>
                  <input
                    type="search"
                    value={filters.query}
                    onChange={(e) => setFilters({ query: e.target.value })}
                    placeholder="Search name or summary"
                    aria-label="Search"
                    className="min-w-0 flex-1 basis-48 rounded-full border border-stone-300 bg-white/90 px-4 py-1.5 text-sm outline-none focus:border-stone-600 dark:border-stone-600 dark:bg-stone-900"
                  />
                  <label className="flex items-center gap-2 text-sm text-stone-600 md:hidden dark:text-stone-300">
                    Sort
                    <select
                      value={view.sort.key}
                      onChange={(e) => change({ ...view, sort: { key: e.target.value as SortKey, dir: defaultDir(e.target.value as SortKey) } })}
                      className="rounded-full border border-stone-300 bg-white/90 px-3 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-900"
                    >
                      <option value="name">Name</option>
                      <option value="days">Last updated</option>
                      <option value="downloads">Downloads</option>
                      <option value="stars">Stars</option>
                      {columns.map((c) => (
                        <option key={c.id} value={`grade:${c.id}`}>
                          {c.long}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <ScorecardTable items={visible} columns={columns} sortKey={view.sort.key} sortDir={view.sort.dir} onSort={(key, dir) => change({ ...view, sort: { key, dir } })} onOpen={open} favourites={favourites} onToggleFavourite={toggle} />
                <ScorecardCards items={visible} columns={columns} onOpen={open} favourites={favourites} onToggleFavourite={toggle} />
                <p className="text-xs text-stone-500 dark:text-stone-400 print:hidden">
                  {visible.length} of {doc.items.length} shown, in the order of the column you sorted by; ♥ Favourites shows only yours. 1 is worst, 10 is best; a dash means it could not be judged. Tap a name to open it.
                </p>
                {allTickets.length > 0 ? (
                  <TicketBrowser title="Every ticket" tickets={allTickets} filters={view.ticketList.filters} sort={view.ticketList.sort} onChange={(next) => change({ ...view, ticketList: next })} nowIso={nowIso} favourites={favourites} items={itemsForFilter} />
                ) : null}
              </>
            ) : null}

            {view.tab === "changes" ? <ChangesPanel items={doc.items} gradeOrder={columns.map((c) => c.id)} onOpen={open} /> : null}

            {view.tab === "tickets" ? (
              <TicketsPanel items={doc.items} sort={view.ticketTable.sort} chips={view.ticketTable.chips} onChange={(next) => change({ ...view, ticketTable: next })} favourites={favourites} onToggleFavourite={toggle} onOpen={open} />
            ) : null}

            {view.tab === "rankings" ? <RankingsPanel doc={doc} columns={columns} rankId={view.rankId} onPick={(rankId) => change({ ...view, rankId }, true)} onOpen={open} favourites={favourites} /> : null}

            {view.tab === "method" ? <MethodPanel doc={doc} /> : null}
          </>
        )}
      </div>
      <p className="text-xs text-stone-500 dark:text-stone-400 print:hidden">
        <Link href="/" className="underline underline-offset-2">
          ← Fleet dashboard
        </Link>
        {" · "}
        <Link href="/packages/map" className="underline underline-offset-2">
          Package map
        </Link>
      </p>
    </div>
    </ChangesContext.Provider>
  );
}
