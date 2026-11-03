"use client";

import { useMemo, useState } from "react";

import { TICKET_KINDS, TICKET_PRIORITIES } from "@/lib/scorecard/contract";
import { FAMILY_WIDE, ageDays, chipCounts, filterTickets, sortTickets, type ListedTicket } from "@/lib/scorecard/tickets";
import { TICKET_STATUSES, type TicketListFilters, type TicketListSort } from "@/lib/scorecard/view-state";

import { HeartMark } from "./heart-button";

type Props = {
  tickets: readonly ListedTicket[];
  filters: TicketListFilters;
  sort: TicketListSort;
  onChange: (next: { filters: TicketListFilters; sort: TicketListSort }) => void;
  nowIso: string;
  favourites: ReadonlySet<string>;
  /** The all-tickets view: a package column and a package filter. */
  items?: ReadonlyArray<{ id: string; name: string }>;
  title: string;
};

const chip = (on: boolean) =>
  `rounded-full border px-2.5 py-1 text-xs transition pointer-coarse:py-2 ${on ? "border-stone-900 bg-stone-900 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900" : "border-stone-300 bg-white/80 text-stone-700 hover:border-stone-500 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200"}`;

const PRIORITY_TONE: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-amber-400 text-amber-950",
  medium: "bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100",
  normal: "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-100",
  low: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
  unset: "bg-stone-100 text-stone-400 dark:bg-stone-800 dark:text-stone-500",
};
const KIND_TONE: Record<string, string> = { bug: "text-red-700 dark:text-red-400", feature: "text-sky-700 dark:text-sky-400", chore: "text-stone-600 dark:text-stone-300", other: "text-violet-700 dark:text-violet-300" };

function Chips<V extends string>({ label, values, value, counts, onPick, word }: { label: string; values: readonly V[]; value: V; counts: Record<string, number>; onPick: (v: V) => void; word?: (v: V) => string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-stone-500 dark:text-stone-400">{label}</span>
      {values.map((v) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onPick(v)} className={chip(value === v)} data-chip={`${label.toLowerCase()}:${v}`}>
          {word ? word(v) : v === "all" ? "All" : v} <span className="tabular-nums opacity-70">{counts[v] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

function TicketDetail({ t, nowIso, onClose }: { t: ListedTicket; nowIso: string; onClose: () => void }) {
  const age = ageDays(t.created, nowIso);
  return (
    <section aria-label={`Ticket ${t.id}`} className="rounded-2xl border border-stone-300/80 bg-stone-50 p-4 text-sm dark:border-stone-700 dark:bg-stone-800/70" data-testid="ticket-detail">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold">
          {t.url ? <a href={t.url} target="_blank" rel="noopener noreferrer" className="font-mono underline underline-offset-2">{t.id}</a> : <span className="font-mono">{t.id}</span>}
          <span className="ml-2 font-normal">{t.title}</span>
        </h4>
        <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-xs underline underline-offset-2 pointer-coarse:py-2">Close</button>
      </div>
      <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
        {t.itemName} · <span className={KIND_TONE[t.kind]}>{t.kind}{t.kindDerived ? " (read from the title)" : ""}</span> · {t.priority === "unset" ? "no priority" : t.priority} · {t.status}
        {age !== null ? ` · ${age} days old` : ""}
        {t.claimedBy ? ` · held by ${t.claimedBy}` : ""}
        {t.done ? ` · done ${t.done.slice(0, 10)}` : ""}
      </p>
      <div className="mt-3 max-h-[28rem] overflow-y-auto whitespace-pre-wrap break-words leading-6 text-stone-800 dark:text-stone-200">{t.detail ?? "The board gives no detail text for this ticket."}</div>
    </section>
  );
}

/**
 * A board's tickets to browse (SUMILABU-12): chips with the count each would
 * leave, a search, sortable columns, and one ticket's text at a time beside
 * the list (under its row on a phone). Never a stack of sections that fold
 * open. The filters are part of the remembered view.
 */
export function TicketBrowser({ tickets, filters, sort, onChange, nowIso, favourites, items, title }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const set = (patch: Partial<TicketListFilters>) => onChange({ filters: { ...filters, ...patch }, sort });
  const shown = useMemo(() => sortTickets(filterTickets(tickets, filters, nowIso), sort, favourites, nowIso), [tickets, filters, sort, favourites, nowIso]);
  const kinds = chipCounts(tickets, filters, nowIso, "kind", ["all", ...TICKET_KINDS]);
  const priorities = chipCounts(tickets, filters, nowIso, "priority", ["all", ...TICKET_PRIORITIES]);
  const statuses = chipCounts(tickets, filters, nowIso, "status", ["all", ...TICKET_STATUSES]);
  const selected = shown.find((t) => `${t.itemId}/${t.id}` === openId) ?? null;
  const head = (key: TicketListSort["key"], label: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className="px-1.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-stone-500 dark:text-stone-400">
      <button type="button" onClick={() => onChange({ filters, sort: { key, dir: sort.key === key && sort.dir === "asc" ? "desc" : "asc" } })} className="rounded px-1 py-1 uppercase hover:bg-stone-200/70 dark:hover:bg-stone-700">
        {label} <span aria-hidden>{sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );

  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-stone-300/80 bg-white/90 p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900/90" data-testid="ticket-browser">
      <h3 className="text-sm font-semibold">{title} <span className="font-normal text-stone-500 dark:text-stone-400">· {shown.length} of {tickets.length} shown</span></h3>
      <div className="grid gap-2" data-testid="ticket-filters">
        <Chips label="Kind" values={["all", ...TICKET_KINDS] as const} value={filters.kind} counts={kinds} onPick={(kind) => set({ kind })} />
        <Chips label="Priority" values={["all", ...TICKET_PRIORITIES] as const} value={filters.priority} counts={priorities} onPick={(priority) => set({ priority })} word={(v) => (v === "all" ? "All" : v === "unset" ? "none set" : v)} />
        <Chips label="Status" values={["all", ...TICKET_STATUSES] as const} value={filters.status} counts={statuses} onPick={(status) => set({ status })} />
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Done tickets" className="flex items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-stone-500 dark:text-stone-400">Done</span>
            <button type="button" aria-pressed={filters.done === "30"} onClick={() => set({ done: "30" })} className={chip(filters.done === "30")}>last 30 days</button>
            <button type="button" aria-pressed={filters.done === "all"} onClick={() => set({ done: "all" })} className={chip(filters.done === "all")}>all</button>
          </div>
          {items ? (
            <label className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-300">
              Package
              <select value={filters.item} onChange={(e) => set({ item: e.target.value })} className="rounded-full border border-stone-300 bg-white px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-900" data-testid="ticket-item-filter">
                <option value="all">All packages</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
                <option value={FAMILY_WIDE}>Family-wide</option>
              </select>
            </label>
          ) : null}
          <input type="search" value={filters.query} onChange={(e) => set({ query: e.target.value })} placeholder="Search tickets" aria-label="Search tickets" className="min-w-0 flex-1 basis-40 rounded-full border border-stone-300 bg-white/90 px-3 py-1 text-sm outline-none focus:border-stone-600 dark:border-stone-600 dark:bg-stone-900" />
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">{tickets.length === 0 ? "No tickets on the boards for this." : "No ticket matches these filters."}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="max-h-[36rem] overflow-auto rounded-xl border border-stone-200 dark:border-stone-700">
            <table className="w-full min-w-[640px] border-collapse text-sm" data-testid="ticket-table">
              <thead className="sticky top-0 z-10 bg-stone-100 dark:bg-stone-800">
                <tr>
                  {head("id", "Id")}
                  {head("title", "Title")}
                  {items ? head("item", "Package") : null}
                  {head("kind", "Kind")}
                  {head("priority", "Priority")}
                  {head("status", "Status")}
                  {head("age", "Age")}
                  <th scope="col" className="px-1.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-stone-500 dark:text-stone-400">Held by</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => {
                  const key = `${t.itemId}/${t.id}`;
                  const on = key === openId;
                  const age = ageDays(t.created, nowIso);
                  return (
                    <tr key={key} className={`border-t border-stone-200 dark:border-stone-700 ${on ? "bg-amber-50 dark:bg-amber-950/40" : "hover:bg-stone-50 dark:hover:bg-stone-800/60"}`} data-testid="ticket-row" data-ticket={t.id}>
                      <td className="whitespace-nowrap px-1.5 py-1.5 font-mono text-xs">
                        {t.url ? <a href={t.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{t.id}</a> : t.id}
                      </td>
                      <td className="px-1.5 py-1.5">
                        <button type="button" aria-expanded={on} onClick={() => setOpenId(on ? null : key)} className="text-left underline decoration-stone-300 underline-offset-2 hover:decoration-stone-700 dark:decoration-stone-600 pointer-coarse:py-1.5">
                          {t.title}
                        </button>
                      </td>
                      {items ? (
                        <td className="whitespace-nowrap px-1.5 py-1.5 text-xs text-stone-600 dark:text-stone-300">
                          {favourites.has(t.itemId) ? <HeartMark /> : null} {t.itemName.replace(/^@johnmorrisdotca\//, "")}
                        </td>
                      ) : null}
                      <td className={`px-1.5 py-1.5 text-xs ${KIND_TONE[t.kind]}`} title={t.kindDerived ? "read from the title" : "as the board says"}>{t.kind}{t.kindDerived ? "*" : ""}</td>
                      <td className="px-1.5 py-1.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_TONE[t.priority]}`}>{t.priority === "unset" ? "–" : t.priority}</span></td>
                      <td className="whitespace-nowrap px-1.5 py-1.5 text-xs">{t.status}</td>
                      <td className="px-1.5 py-1.5 text-xs tabular-nums">{age === null ? "–" : `${age}d`}</td>
                      <td className="max-w-[8rem] truncate px-1.5 py-1.5 text-xs text-stone-600 dark:text-stone-300">{t.claimedBy ?? "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="md:sticky md:top-2 md:self-start">
            {selected ? <TicketDetail t={selected} nowIso={nowIso} onClose={() => setOpenId(null)} /> : <p className="text-sm text-stone-500 dark:text-stone-400">Press a title to read the ticket here. A kind with * was read from the title, not set on the board.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
