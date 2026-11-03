import type { ScorecardItem } from "@/lib/scorecard/contract";
import { favouritesFirst } from "@/lib/scorecard/favourites";
import { filterTicketRows, openByKindParts, sortTicketRows, ticketRow, type TicketRow } from "@/lib/scorecard/tickets";
import type { TicketTableChips, TicketTableSort } from "@/lib/scorecard/view-state";

import { HeartButton } from "./heart-button";
import { KindBar, KindLegend } from "./ticket-charts";

type Props = {
  items: readonly ScorecardItem[];
  sort: TicketTableSort;
  chips: TicketTableChips;
  onChange: (next: { sort: TicketTableSort; chips: TicketTableChips }) => void;
  favourites: ReadonlySet<string>;
  onToggleFavourite: (id: string, name: string) => void;
  onOpen: (id: string) => void;
};

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-stone-900 bg-stone-900 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900" : "border-stone-300 bg-white/80 text-stone-700 hover:border-stone-500 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200"}`;

const COLS: Array<{ key: TicketTableSort["key"]; label: string; title: string }> = [
  { key: "open", label: "Open", title: "Open tickets, any kind" },
  { key: "bugs", label: "Bugs", title: "Open bugs" },
  { key: "features", label: "Feat", title: "Open features" },
  { key: "urgent", label: "Crit/High", title: "Open critical or high, any kind" },
  { key: "inProgress", label: "Doing", title: "In progress" },
  { key: "done30", label: "Done 30d", title: "Done in the last 30 days" },
  { key: "oldest", label: "Oldest", title: "Days the oldest open ticket has waited" },
];

/**
 * Every item's tickets side by side (SUMILABU-12): the counts as sortable
 * columns and a bar of open tickets by kind, all bars on one scale so a long
 * bar is a long queue. Favourites first, as in every list.
 */
export function TicketsPanel({ items, sort, chips, onChange, favourites, onToggleFavourite, onOpen }: Props) {
  const rows = items.map(ticketRow).filter((r): r is TicketRow => r !== null);
  const shown = favouritesFirst(
    sortTicketRows(filterTicketRows(rows, chips), sort).map((r) => ({ ...r, id: r.item.id })),
    favourites,
  );
  const scale = Math.max(1, ...rows.map((r) => r.open));
  const set = (patch: Partial<TicketTableChips>) => onChange({ sort, chips: { ...chips, ...patch } });
  const unread = items.length - rows.length;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3" data-testid="tickets-panel">
      <div role="group" aria-label="Ticket filters" className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={chips.hasBugs} onClick={() => set({ hasBugs: !chips.hasBugs })} className={chip(chips.hasBugs)}>Has bugs ({rows.filter((r) => r.bugs > 0).length})</button>
        <button type="button" aria-pressed={chips.hasCritical} onClick={() => set({ hasCritical: !chips.hasCritical })} className={chip(chips.hasCritical)}>Has critical ({rows.filter((r) => r.critical > 0).length})</button>
        <button type="button" aria-pressed={chips.nothingOpen} onClick={() => set({ nothingOpen: !chips.nothingOpen })} className={chip(chips.nothingOpen)}>Nothing open ({rows.filter((r) => r.open === 0).length})</button>
        <KindLegend />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-stone-300/80 bg-white/90 shadow-sm dark:border-stone-700 dark:bg-stone-900/90">
        <table className="w-full min-w-[820px] border-collapse text-sm" data-testid="tickets-table">
          <thead className="border-b border-stone-300/80 bg-stone-100/90 dark:border-stone-700 dark:bg-stone-800">
            <tr>
              <th scope="col" className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-stone-500 dark:text-stone-400">
                <button type="button" onClick={() => onChange({ chips, sort: { key: "name", dir: sort.key === "name" && sort.dir === "asc" ? "desc" : "asc" } })} className="rounded px-1 py-1 uppercase">
                  Name <span aria-hidden>{sort.key === "name" ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
                </button>
              </th>
              <th scope="col" className="w-[30%] px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-stone-500 dark:text-stone-400">Open by kind</th>
              {COLS.map((c) => (
                <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className="px-1 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.04em] text-stone-500 dark:text-stone-400">
                  <button type="button" title={c.title} onClick={() => onChange({ chips, sort: { key: c.key, dir: sort.key === c.key && sort.dir === "desc" ? "asc" : "desc" } })} className="rounded px-1 py-1 uppercase">
                    {c.label} <span aria-hidden>{sort.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.item.id} className="border-b border-stone-200/80 last:border-0 dark:border-stone-700" data-testid="tickets-row" data-item={r.item.id}>
                <th scope="row" className="px-2 py-1 text-left font-medium">
                  <span className="flex items-center gap-1">
                    <HeartButton on={favourites.has(r.item.id)} name={r.item.name} onToggle={() => onToggleFavourite(r.item.id, r.item.name)} />
                    <button type="button" onClick={() => onOpen(r.item.id)} className="truncate text-left underline decoration-stone-300 underline-offset-2 dark:decoration-stone-600">{r.item.name.replace(/^@johnmorrisdotca\//, "")}</button>
                  </span>
                </th>
                <td className="px-2 py-1">
                  <KindBar parts={openByKindParts(r.item.tickets)} scale={scale} urgent={r.urgent} label={`${r.item.name} open tickets`} height={18} />
                </td>
                {COLS.map((c) => {
                  const v = c.key === "done30" ? r.done30 : r[c.key as Exclude<TicketTableSort["key"], "name" | "done30">];
                  const tone = c.key === "bugs" && (v ?? 0) > 0 ? "font-semibold text-red-700 dark:text-red-400" : c.key === "urgent" && (v ?? 0) > 0 ? "font-semibold text-amber-700 dark:text-amber-400" : "";
                  return <td key={c.key} className={`px-2 py-1 text-right tabular-nums ${tone}`}>{v === null ? "–" : c.key === "oldest" ? `${v}d` : v}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500 dark:text-stone-400">
        {shown.length} of {rows.length} items with a board{unread ? `; ${unread} with no board read` : ""}. A dash is a number the boards do not give yet (done dates, ages).
      </p>
    </div>
  );
}
