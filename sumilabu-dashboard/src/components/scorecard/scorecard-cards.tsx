import type { ScorecardItem } from "@/lib/scorecard/contract";
import { daysSinceUpdate, formatCount, formatDays, itemVersion, overallValue, type GradeColumn } from "@/lib/scorecard/view";

import { GradeCell, PrivateBadge } from "./grade-cell";
import { HeartButton } from "./heart-button";
import { ItemChange, NewBadge, RankChange } from "./change-arrow";
import { TicketBadges, TicketChanges } from "./scorecard-table";
import { Thumb } from "./thumb";

/**
 * The same rows as the table, for a phone: a table with a dozen grade columns
 * would scroll sideways, and the point of the page is to see the grades. Each
 * item is a card with every grade on it, overall large. Hidden from `md` up.
 */
type Props = { items: ScorecardItem[]; columns: GradeColumn[]; onOpen: (id: string) => void; favourites: ReadonlySet<string>; onToggleFavourite: (id: string, name: string) => void };

export function ScorecardCards({ items, columns, onOpen, favourites, onToggleFavourite }: Props) {
  if (items.length === 0) {
    return <p className="rounded-2xl border border-stone-300/80 dark:border-stone-700 bg-white/80 dark:bg-stone-900/80 p-6 text-center text-sm text-stone-600 dark:text-stone-300 md:hidden">Nothing matches these filters.</p>;
  }
  const overall = columns.find((c) => c.id === "overall");
  const rest = columns.filter((c) => c.id !== "overall");
  return (
    <ul className="grid gap-2 md:hidden print:hidden" data-testid="scorecard-cards">
      {items.map((item) => {
        const days = daysSinceUpdate(item);
        return (
          <li key={item.id} className="rounded-2xl border border-stone-300/80 bg-white/90 p-3 shadow-sm dark:border-stone-700 dark:bg-stone-900/90" data-item={item.id}>
            <div className="mb-2"><Thumb item={item} size="card" /></div>
            <div className="flex items-start justify-between gap-3">
              <HeartButton on={favourites.has(item.id)} name={item.name} onToggle={() => onToggleFavourite(item.id, item.name)} large />
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => onOpen(item.id)} className="max-w-full break-words rounded py-1 text-left text-base font-semibold text-stone-900 dark:text-stone-100 underline decoration-stone-300 dark:decoration-stone-600 underline-offset-2">
                  {item.name}
                </button>
                {item.private ? <PrivateBadge /> : null}
                <NewBadge item={item.id} />
                <p className="text-xs text-stone-600 dark:text-stone-300">
                  {item.kind} · {item.owner} · {itemVersion(item) ? `v${itemVersion(item)}` : "no version"}
                </p>
                <p className="text-xs text-stone-600 dark:text-stone-300">
                  updated {formatDays(days)}
                  {item.popularity.npmDownloadsWeek !== null ? ` · ${formatCount(item.popularity.npmDownloadsWeek)}/wk ` : ""}
                  <ItemChange item={item.id} figure="downloads" size="xs" />
                  {item.popularity.stars !== null ? ` · ${formatCount(item.popularity.stars)} stars` : ""}
                  {item.flags.length > 0 ? <span className="text-amber-700 dark:text-amber-400"> · ⚑{item.flags.length}</span> : null}
                  <TicketBadges item={item} />
                  <TicketChanges item={item} />
                </p>
              </div>
              {overall ? (
                <div className="flex shrink-0 flex-col items-center gap-0.5">
                  <GradeCell value={overallValue(item)} large label="Overall" />
                  <span className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">overall</span>
                  <ItemChange item={item.id} figure="score" size="xs" />
                  <RankChange item={item.id} />
                </div>
              ) : null}
            </div>
            <div className="mt-2 grid grid-cols-6 gap-x-1 gap-y-1.5">
              {rest.map((c) => (
                <div key={c.id} className="flex flex-col items-center gap-0.5" data-grade={c.id}>
                  <span className="text-[10px] uppercase tracking-wide text-stone-500 dark:text-stone-400">{c.label}</span>
                  <GradeCell value={item.grades[c.id] ?? null} label={c.long} />
                  <ItemChange item={item.id} figure={`g:${c.id}`} size="xs" />
                </div>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
