import type { Scorecard, ScorecardItem } from "@/lib/scorecard/contract";
import { COLLECTOR_MEASURE_RANKINGS, RANK_METHOD, formatRankValue, rankLabel, rankValue, rankingFor, rankingIds, type GradeColumn } from "@/lib/scorecard/view";

import { GradeCell } from "./grade-cell";
import { HeartMark } from "./heart-button";

type Props = { doc: Scorecard; columns: GradeColumn[]; rankId: string; onPick: (id: string) => void; onOpen: (id: string) => void; favourites?: ReadonlySet<string> };

const NO_SET: ReadonlySet<string> = new Set();

/** A ranking of a grade is drawn as grade cells; of anything else, as its number. */
function isGrade(doc: Scorecard, id: string): boolean {
  if (id.startsWith("grade:")) return true;
  return !COLLECTOR_MEASURE_RANKINGS.includes(id) && doc.items.some((i) => id in i.grades);
}

/** The longest bar of a ranking: a grade's is 10; a reading's is the largest value on either list. */
function barScale(doc: Scorecard, rankId: string, values: number[]): number {
  return isGrade(doc, rankId) ? 10 : Math.max(1, ...values.map(Math.abs));
}

function List({ title, tone, bar, items, doc, rankId, onOpen, favourites, scale }: { title: string; tone: string; bar: string; items: ScorecardItem[]; doc: Scorecard; rankId: string; onOpen: (id: string) => void; favourites: ReadonlySet<string>; scale: number }) {
  return (
    <section className="rounded-2xl border border-stone-300/80 dark:border-stone-700 bg-white/90 dark:bg-stone-900/90 p-4 shadow-sm">
      <h3 className={`mb-2 text-xs font-semibold uppercase tracking-[0.2em] ${tone}`}>{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">Nothing to rank.</p>
      ) : (
        <ol className="grid gap-1">
          {items.map((item, n) => {
            const value = rankValue(item, rankId);
            return (
              <li key={item.id} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3" data-testid="rank-row">
                <span className="text-right text-sm tabular-nums text-stone-400">{n + 1}</span>
                <span className="min-w-0">
                  <button type="button" onClick={() => onOpen(item.id)} className="flex max-w-full items-center gap-1 truncate rounded pt-1 text-left text-sm text-stone-900 underline decoration-stone-300 dark:decoration-stone-600 underline-offset-2 hover:decoration-stone-700 dark:text-stone-100">
                    {favourites.has(item.id) ? <HeartMark /> : null}
                    <span className="truncate">{item.name}</span>
                  </button>
                  <span aria-hidden className="mt-0.5 block h-2 rounded-full bg-stone-100 dark:bg-stone-800">
                    <span className={`block h-2 rounded-full ${bar}`} style={{ width: `${typeof value === "number" ? Math.max(2, (Math.abs(value) / scale) * 100) : 0}%` }} data-testid="rank-bar" />
                  </span>
                </span>
                {isGrade(doc, rankId) ? <GradeCell value={typeof value === "number" ? value : null} /> : <span className="font-mono text-sm tabular-nums text-stone-700 dark:text-stone-200">{formatRankValue(value, rankId)}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function RankingsPanel({ doc, columns, rankId, onPick, onOpen, favourites = NO_SET }: Props) {
  const ids = rankingIds(doc, columns);
  const ranking = rankingFor(doc, rankId);
  const name = rankLabel(rankId);
  const numbers = [...ranking.best, ...ranking.worst].map((i) => rankValue(i, rankId)).filter((v): v is number => typeof v === "number");
  const scale = barScale(doc, rankId, numbers);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3" data-testid="rankings-panel">
      <div role="group" aria-label="Rank by" className="flex flex-wrap gap-2">
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === rankId}
            onClick={() => onPick(id)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${id === rankId ? "border-stone-900 bg-stone-900 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900" : "border-stone-300 bg-white/80 text-stone-700 hover:border-stone-500 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200"}`}
          >
            {rankLabel(id)}
          </button>
        ))}
      </div>
      {(doc.methods[rankId] ?? doc.methods[RANK_METHOD[rankId] ?? ""]) ? <p className="text-sm text-stone-600 dark:text-stone-300"><span className="font-semibold">{name}:</span> {doc.methods[rankId] ?? doc.methods[RANK_METHOD[rankId] ?? ""]}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <List title={`Best: ${name}`} tone="text-emerald-700 dark:text-emerald-400" bar="bg-emerald-500" items={ranking.best} doc={doc} rankId={rankId} onOpen={onOpen} favourites={favourites} scale={scale} />
        <List title={`Worst: ${name}`} tone="text-red-700 dark:text-red-400" bar="bg-red-500" items={ranking.worst} doc={doc} rankId={rankId} onOpen={onOpen} favourites={favourites} scale={scale} />
      </div>
    </div>
  );
}
