import type { ScorecardItem } from "@/lib/scorecard/contract";
import { donePerWeek, openByKindParts, type ListedTicket } from "@/lib/scorecard/tickets";

import { DoneBars, KindBar, KindLegend, TicketFigures, blockFigures } from "./ticket-charts";

/**
 * An item's tickets at a glance (SUMILABU-12), above its full list: the
 * figures, the open tickets by kind, done per week, the open critical and high
 * ones as rows, and the recently done.
 */
export function TicketSection({ item, tickets, nowIso }: { item: ScorecardItem; tickets: readonly ListedTicket[]; nowIso: string }) {
  const b = item.tickets;
  if (!b) {
    return (
      <section className="rounded-2xl border border-stone-300/80 bg-white/90 p-4 text-sm text-stone-600 shadow-sm dark:border-stone-700 dark:bg-stone-900/90 dark:text-stone-300" data-testid="ticket-section">
        No board was read for {item.name}, so there are no tickets to show.
      </section>
    );
  }
  const f = blockFigures(b);
  const urgent = tickets.filter((t) => t.status !== "done" && (t.priority === "critical" || t.priority === "high"));
  const done = b.recentDone;
  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-stone-300/80 bg-white/90 p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900/90" data-testid="ticket-section" id="tickets">
      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">Tickets · {b.boards.join(", ")}</h3>
      <TicketFigures totals={f} />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-1">
          <KindBar parts={openByKindParts(b)} urgent={f.urgent} label={`${item.name} open tickets`} />
          <KindLegend />
        </div>
        <DoneBars counts={donePerWeek(tickets, nowIso, 8)} unit="week" label="Done per week, last 8 weeks" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <h4 className="mb-1 text-sm font-semibold">Open, critical or high ({urgent.length})</h4>
          {urgent.length === 0 ? (
            <p className="text-sm text-stone-500 dark:text-stone-400">None.</p>
          ) : (
            <ul className="grid gap-1 text-sm" data-testid="urgent-list">
              {urgent.map((t) => (
                <li key={t.id} className="flex gap-2">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.priority === "critical" ? "bg-red-600 text-white" : "bg-amber-400 text-amber-950"}`}>{t.priority}</span>
                  {t.url ? <a href={t.url} target="_blank" rel="noopener noreferrer" className="shrink-0 font-mono text-xs underline">{t.id}</a> : <span className="shrink-0 font-mono text-xs">{t.id}</span>}
                  <span className="min-w-0">{t.title} <span className="text-xs text-stone-500 dark:text-stone-400">· {t.kind} · {t.status}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="mb-1 text-sm font-semibold">Done recently ({done.length})</h4>
          {done.length === 0 ? (
            <p className="text-sm text-stone-500 dark:text-stone-400">{b.doneLast7 === null ? "The boards do not list done tickets yet." : `${b.doneLast7} done in the last 7 days; the boards do not list which.`}</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {done.map((t) => (
                <li key={t.id}><span className="font-mono text-xs">{t.id}</span> {t.title} <span className="text-xs text-stone-500">{t.done?.slice(0, 10)}</span></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
