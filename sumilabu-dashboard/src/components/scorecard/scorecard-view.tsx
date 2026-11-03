"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { ScorecardData } from "@/lib/scorecard/server";
import {
  NO_FILTERS,
  ageLabel,
  averageOverall,
  defaultDir,
  filterItems,
  gradeColumns,
  runIsStale,
  sortItems,
  trendOf,
  type Filters,
  type SortDir,
  type SortKey,
} from "@/lib/scorecard/view";

import { DETAIL_TABS, ItemDetail, type DetailTab } from "./item-detail";
import { MethodPanel } from "./method-panel";
import { RankingsPanel } from "./rankings-panel";
import { ScorecardCards } from "./scorecard-cards";
import { ScorecardTable } from "./scorecard-table";

type Tab = "table" | "rankings" | "method";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "table", label: "Scorecard" },
  { id: "rankings", label: "Rankings" },
  { id: "method", label: "How it is graded" },
];

const KIND_CHIPS: Array<{ id: Filters["kind"]; label: string }> = [
  { id: "all", label: "All" },
  { id: "package", label: "Packages" },
  { id: "site", label: "Sites" },
  { id: "app", label: "Apps" },
];

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-stone-900 bg-stone-900 text-stone-50" : "border-stone-300 bg-white/80 text-stone-700 hover:border-stone-500 hover:bg-white"}`;

function utcStamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/* The address hash is the view's state worth sharing: #item=<id>, or #tab=rankings&rank=performance. */
function readHash(): { item: string | null; tab: Tab | null; rank: string | null; dtab: DetailTab | null } {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const tab = params.get("tab");
  const dtab = params.get("dtab");
  return {
    item: params.get("item"),
    tab: TABS.some((t) => t.id === tab) ? (tab as Tab) : null,
    rank: params.get("rank"),
    dtab: DETAIL_TABS.some((t) => t.id === dtab) ? (dtab as DetailTab) : null,
  };
}

export function ScorecardView({ data, nowIso }: { data: ScorecardData | null; nowIso: string }) {
  const [tab, setTab] = useState<Tab>("table");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "grade:overall", dir: "desc" });
  const [rankId, setRankId] = useState("overall");
  const [openId, setOpenId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("grades");

  /* The open item lives in the address (#item=id) so a link, the back button and a reload all land on it. */
  useEffect(() => {
    const sync = () => {
      const h = readHash();
      setOpenId(h.item);
      if (h.tab) setTab(h.tab);
      if (h.rank) setRankId(h.rank);
      setDetailTab(h.dtab ?? "grades");
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const open = useCallback((id: string) => {
    window.location.hash = `item=${encodeURIComponent(id)}`;
    window.scrollTo({ top: 0 });
  }, []);
  const close = useCallback(() => {
    history.pushState(null, "", window.location.pathname + window.location.search);
    setOpenId(null);
  }, []);
  const pickTab = useCallback((next: Tab) => {
    setTab(next);
    history.replaceState(null, "", `#tab=${next}`);
  }, []);
  const pickRank = useCallback((id: string) => {
    setRankId(id);
    history.replaceState(null, "", `#tab=rankings&rank=${encodeURIComponent(id)}`);
  }, []);

  const doc = data?.doc ?? null;
  const columns = useMemo(() => (doc ? gradeColumns(doc) : []), [doc]);
  const owners = useMemo(() => (doc ? [...new Set(doc.items.map((i) => i.owner))].sort() : []), [doc]);
  const visible = useMemo(() => (doc ? sortItems(filterItems(doc.items, filters), sort.key, sort.dir) : []), [doc, filters, sort]);

  if (!data || !doc) {
    return (
      <section className="rounded-2xl border border-stone-300/80 bg-white/90 p-6 shadow-sm" data-testid="scorecard-empty">
        <h2 className="text-lg font-semibold">No scorecard has been uploaded yet</h2>
        <p className="mt-2 text-sm text-stone-600">
          Run <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs">pnpm scorecard:upload</code> from <code className="font-mono text-xs">sumilabu-dashboard/</code> on the Mac that holds the collector&apos;s <code className="font-mono text-xs">latest.json</code>. This page fills in as soon as a run arrives.
        </p>
      </section>
    );
  }

  const stale = runIsStale(doc.generatedAt, nowIso);
  const flagged = doc.items.filter((i) => i.flags.length > 0).length;
  const average = averageOverall(doc.items);
  const openItem = openId ? doc.items.find((i) => i.id === openId) : undefined;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <section className="rounded-2xl border border-stone-300/80 bg-white/90 p-4 shadow-sm" data-testid="scorecard-summary">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="text-sm text-stone-700">
            <span className="font-semibold">Run {utcStamp(doc.generatedAt)}</span>
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${stale ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`} data-testid="scorecard-age">
              {ageLabel(doc.generatedAt, nowIso)}
            </span>
          </p>
          <p className="text-sm text-stone-600">
            {doc.items.length} items{average !== null ? ` · average overall ${average}` : ""} · {flagged} flagged
          </p>
          <button type="button" onClick={() => window.print()} className="rounded-full border border-stone-300 bg-white/80 px-3 py-1.5 text-sm text-stone-700 hover:border-stone-500 print:hidden">
            Print or save as PDF
          </button>
        </div>
        {stale ? <p className="mt-2 text-sm text-red-700">This run is more than a week old: the collector has probably stopped. Run it again and upload.</p> : null}
      </section>

      {openItem ? (
        <ItemDetail key={openItem.id} item={openItem} columns={columns} trend={trendOf(data.trend, openItem.id)} onBack={close} initialTab={detailTab} />
      ) : openId ? (
        <section className="rounded-2xl border border-stone-300/80 bg-white/90 p-6 shadow-sm">
          <p className="text-sm text-stone-700">There is no item called <span className="font-mono">{openId}</span> in this run.</p>
          <button type="button" onClick={close} className="mt-2 text-sm underline underline-offset-2">← All items</button>
        </section>
      ) : (
        <>
          <div role="tablist" aria-label="View" className="flex flex-wrap gap-2 print:hidden">
            {TABS.map((t) => (
              <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => pickTab(t.id)} className={chip(tab === t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "table" ? (
            <>
              <div className="flex flex-wrap items-center gap-2 print:hidden" data-testid="scorecard-filters">
                <div role="group" aria-label="Kind" className="flex flex-wrap gap-2">
                  {KIND_CHIPS.map((k) => (
                    <button key={k.id} type="button" aria-pressed={filters.kind === k.id} onClick={() => setFilters({ ...filters, kind: k.id })} className={chip(filters.kind === k.id)}>
                      {k.label}
                    </button>
                  ))}
                </div>
                {owners.length > 1 ? (
                  <div role="group" aria-label="Owner" className="flex flex-wrap gap-2">
                    {["all", ...owners].map((o) => (
                      <button key={o} type="button" aria-pressed={filters.owner === o} onClick={() => setFilters({ ...filters, owner: o })} className={chip(filters.owner === o)}>
                        {o === "all" ? "Any owner" : o}
                      </button>
                    ))}
                  </div>
                ) : null}
                <button type="button" aria-pressed={filters.flaggedOnly} onClick={() => setFilters({ ...filters, flaggedOnly: !filters.flaggedOnly })} className={chip(filters.flaggedOnly)}>
                  ⚑ Flagged ({flagged})
                </button>
                <input
                  type="search"
                  value={filters.query}
                  onChange={(e) => setFilters({ ...filters, query: e.target.value })}
                  placeholder="Search name or summary"
                  aria-label="Search"
                  className="min-w-0 flex-1 basis-48 rounded-full border border-stone-300 bg-white/90 px-4 py-1.5 text-sm outline-none focus:border-stone-600"
                />
                <label className="flex items-center gap-2 text-sm text-stone-600 md:hidden">
                  Sort
                  <select
                    value={sort.key}
                    onChange={(e) => setSort({ key: e.target.value as SortKey, dir: defaultDir(e.target.value as SortKey) })}
                    className="rounded-full border border-stone-300 bg-white/90 px-3 py-1.5 text-sm"
                  >
                    <option value="name">Name</option>
                    <option value="days">Last updated</option>
                    <option value="downloads">Downloads</option>
                    <option value="stars">Stars</option>
                    {columns.map((c) => (
                      <option key={c.id} value={`grade:${c.id}`}>{c.long}</option>
                    ))}
                  </select>
                </label>
              </div>
              <ScorecardTable items={visible} columns={columns} sortKey={sort.key} sortDir={sort.dir} onSort={(key, dir) => setSort({ key, dir })} onOpen={open} />
              <ScorecardCards items={visible} columns={columns} onOpen={open} />
              <p className="text-xs text-stone-500 print:hidden">
                {visible.length} of {doc.items.length} shown. 1 is worst, 10 is best; a dash means it could not be judged. Tap a name to open it.
              </p>
            </>
          ) : null}

          {tab === "rankings" ? <RankingsPanel doc={doc} columns={columns} rankId={rankId} onPick={pickRank} onOpen={open} /> : null}

          {tab === "method" ? (
            <MethodPanel doc={doc} />
          ) : null}
        </>
      )}
      <p className="text-xs text-stone-500 print:hidden">
        <Link href="/" className="underline underline-offset-2">← Fleet dashboard</Link>
      </p>
    </div>
  );
}
