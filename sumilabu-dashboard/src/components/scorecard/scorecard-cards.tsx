import type { ScorecardItem } from "@/lib/scorecard/contract";
import { daysSinceUpdate, formatCount, formatDays, itemVersion, type GradeColumn } from "@/lib/scorecard/view";

import { GradeCell } from "./grade-cell";

/**
 * The same rows as the table, for a phone: a table with a dozen grade columns
 * would scroll sideways, and the point of the page is to see the grades. Each
 * item is a card with every grade on it, overall large. Hidden from `md` up.
 */
export function ScorecardCards({ items, columns, onOpen }: { items: ScorecardItem[]; columns: GradeColumn[]; onOpen: (id: string) => void }) {
  if (items.length === 0) {
    return <p className="rounded-2xl border border-stone-300/80 bg-white/80 p-6 text-center text-sm text-stone-600 md:hidden">Nothing matches these filters.</p>;
  }
  const overall = columns.find((c) => c.id === "overall");
  const rest = columns.filter((c) => c.id !== "overall");
  return (
    <ul className="grid gap-2 md:hidden print:hidden" data-testid="scorecard-cards">
      {items.map((item) => {
        const days = daysSinceUpdate(item);
        return (
          <li key={item.id} className="rounded-2xl border border-stone-300/80 bg-white/90 p-3 shadow-sm" data-item={item.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <button type="button" onClick={() => onOpen(item.id)} className="max-w-full break-words rounded py-1 text-left text-base font-semibold text-stone-900 underline decoration-stone-300 underline-offset-2">
                  {item.name}
                </button>
                <p className="text-xs text-stone-600">
                  {item.kind} · {item.owner} · {itemVersion(item) ? `v${itemVersion(item)}` : "no version"}
                </p>
                <p className="text-xs text-stone-600">
                  updated {formatDays(days)}
                  {item.popularity.npmDownloadsWeek !== null ? ` · ${formatCount(item.popularity.npmDownloadsWeek)}/wk` : ""}
                  {item.popularity.stars !== null ? ` · ${formatCount(item.popularity.stars)} stars` : ""}
                  {item.flags.length > 0 ? <span className="text-amber-700"> · ⚑{item.flags.length}</span> : null}
                </p>
              </div>
              {overall ? (
                <div className="flex shrink-0 flex-col items-center gap-0.5">
                  <GradeCell value={item.grades.overall ?? null} large label="Overall" />
                  <span className="text-[10px] uppercase tracking-wider text-stone-500">overall</span>
                </div>
              ) : null}
            </div>
            <div className="mt-2 grid grid-cols-6 gap-x-1 gap-y-1.5">
              {rest.map((c) => (
                <div key={c.id} className="flex flex-col items-center gap-0.5" data-grade={c.id}>
                  <span className="text-[10px] uppercase tracking-wide text-stone-500">{c.label}</span>
                  <GradeCell value={item.grades[c.id] ?? null} label={c.long} />
                </div>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
