"use client";

import { useContext } from "react";

import { COMPARE_IDS, movers, orderFigures, sinceLabel, type CompareId, type Mover, type StoredChanges } from "@/lib/scorecard/changes";
import type { ScorecardItem } from "@/lib/scorecard/contract";
import { formatGrade, overallValue } from "@/lib/scorecard/view";

import { ChangeArrow, ChangeChip, ChangesContext, RankChange } from "./change-arrow";

const COMPARE_LABEL: Record<CompareId, string> = { previous: "Previous run", week: "A week ago", month: "A month ago" };
const COMPARE_MISSING: Record<CompareId, string> = {
  previous: "No earlier run is kept yet.",
  week: "No run a week older is kept yet.",
  month: "No run a month older is kept yet.",
};

const chip = (on: boolean, disabled: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition ${
    disabled
      ? "cursor-not-allowed border-dashed border-stone-300 text-stone-400 dark:border-stone-700 dark:text-stone-500"
      : on
        ? "border-stone-900 bg-stone-900 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900"
        : "border-stone-300 bg-white/80 text-stone-700 hover:border-stone-500 hover:bg-white dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
  }`;

/** "Changes since: Previous run · 2 Nov | A week ago · 27 Oct | A month ago": buttons, one pressed; a run that is not kept yet is a greyed button that says why. */
export function ComparePicker({ changes, chosen, shown, onPick }: { changes: StoredChanges; chosen: CompareId; shown: CompareId | null; onPick: (id: CompareId) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden" data-testid="compare-picker">
      <span className="text-sm text-stone-600 dark:text-stone-300" id="compare-label">
        Changes since
      </span>
      <div role="group" aria-labelledby="compare-label" className="flex flex-wrap gap-2">
        {COMPARE_IDS.map((id) => {
          const base = changes[id];
          const disabled = base === null;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={shown === id}
              disabled={disabled}
              title={disabled ? COMPARE_MISSING[id] : `Compare with the run of ${sinceLabel(base.at, changes.at)}`}
              onClick={() => onPick(id)}
              className={chip(shown === id, disabled)}
              data-compare={id}
            >
              {COMPARE_LABEL[id]}
              {base ? <span className="ml-1 opacity-75">· {sinceLabel(base.at, changes.at)}</span> : null}
            </button>
          );
        })}
      </div>
      {shown !== null && shown !== chosen ? <span className="text-xs text-stone-500 dark:text-stone-400">{COMPARE_MISSING[chosen]} Showing the previous run.</span> : null}
    </div>
  );
}

const card = "rounded-2xl border border-stone-300/80 bg-white/90 shadow-sm dark:border-stone-700 dark:bg-stone-900/90";

function shortName(name: string): string {
  return name.startsWith("@") ? name.slice(name.indexOf("/") + 1) : name;
}

function MoverRow({ mover, item, gradeOrder, onOpen }: { mover: Mover; item: ScorecardItem | undefined; gradeOrder: readonly string[]; onOpen: (id: string) => void }) {
  const { since } = useContext(ChangesContext);
  const rest = orderFigures(
    Object.keys(mover.changes).filter((f) => f !== "score" && f !== "rank"),
    gradeOrder,
  );
  return (
    <li className="grid gap-1 border-b border-stone-200 py-2 last:border-0 dark:border-stone-700" data-testid="mover" data-item={mover.id}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button type="button" onClick={() => onOpen(mover.id)} className="rounded py-0.5 text-left font-medium text-stone-900 underline decoration-stone-300 underline-offset-2 hover:decoration-stone-700 dark:text-stone-100 dark:decoration-stone-600" title={item ? `Open ${item.name}` : undefined}>
          {item ? shortName(item.name) : mover.id}
        </button>
        {item ? <span className="text-sm tabular-nums text-stone-600 dark:text-stone-300">{formatGrade(overallValue(item))}</span> : null}
        <ChangeArrow figure="score" pair={mover.score ?? undefined} since={since} size="sm" />
        <RankChange item={mover.id} size="sm" />
      </div>
      {rest.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {rest.map((f) => (
            <ChangeChip key={f} figure={f} pair={mover.changes[f]} since={since} />
          ))}
        </div>
      ) : null}
    </li>
  );
}

function MoverList({ title, list, empty, items, gradeOrder, onOpen, testid }: { title: string; list: Mover[]; empty: string; items: Map<string, ScorecardItem>; gradeOrder: readonly string[]; onOpen: (id: string) => void; testid: string }) {
  return (
    <section className={`${card} p-4`} data-testid={testid}>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.12em] text-stone-600 dark:text-stone-300">{title}</h2>
      {list.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">{empty}</p>
      ) : (
        <ol className="grid">
          {list.map((m) => (
            <MoverRow key={m.id} mover={m} item={items.get(m.id)} gradeOrder={gradeOrder} onOpen={onOpen} />
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * The Changes tab: the biggest movers up and down by overall score (by rank
 * when the score is level), what changed in other figures only, and what is
 * new and what was dropped. A tab of lists side by side, nothing to unfold.
 */
export function ChangesPanel({ items, gradeOrder, onOpen }: { items: readonly ScorecardItem[]; gradeOrder: readonly string[]; onOpen: (id: string) => void }) {
  const { comparison, since } = useContext(ChangesContext);
  if (!comparison) {
    return (
      <section className={`${card} p-6`} data-testid="changes-panel">
        <h2 className="text-lg font-semibold">No changes to show yet</h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">The arrows start with the second run uploaded: each upload is compared with the run before it, a week back and a month back.</p>
      </section>
    );
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  const { up, down, others } = movers(comparison);
  const added = comparison.added.map((id) => byId.get(id)).filter((i): i is ScorecardItem => Boolean(i));
  return (
    <div className="grid gap-3" data-testid="changes-panel">
      <div className="grid gap-3 lg:grid-cols-2">
        <MoverList title="Moved up most" list={up} empty={`Nothing moved up since ${since}.`} items={byId} gradeOrder={gradeOrder} onOpen={onOpen} testid="movers-up" />
        <MoverList title="Moved down most" list={down} empty={`Nothing moved down since ${since}.`} items={byId} gradeOrder={gradeOrder} onOpen={onOpen} testid="movers-down" />
      </div>
      {others.length > 0 ? <MoverList title="Overall level, other figures moved" list={others} empty="" items={byId} gradeOrder={gradeOrder} onOpen={onOpen} testid="movers-other" /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <section className={`${card} p-4`} data-testid="changes-new">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.12em] text-stone-600 dark:text-stone-300">New since {since}</h2>
          {added.length === 0 ? (
            <p className="text-sm text-stone-500 dark:text-stone-400">None.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {added.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => onOpen(i.id)} className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100">
                    {shortName(i.name)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={`${card} p-4`} data-testid="changes-dropped">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.12em] text-stone-600 dark:text-stone-300">Dropped since {since}</h2>
          {comparison.dropped.length === 0 ? (
            <p className="text-sm text-stone-500 dark:text-stone-400">None.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {comparison.dropped.map((d) => (
                <li key={d.id} className="rounded-full border border-stone-300 px-3 py-1 text-sm text-stone-600 line-through decoration-stone-400 dark:border-stone-600 dark:text-stone-300">
                  {shortName(d.name)}
                  <span className="sr-only"> (dropped)</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p className="text-xs text-stone-500 dark:text-stone-400">
        The arrow is the way a figure moved; green is better and red is worse for that figure (fewer bugs, tickets and version drift are better; a smaller rank number is up). Worked out when the run was uploaded.
      </p>
    </div>
  );
}
