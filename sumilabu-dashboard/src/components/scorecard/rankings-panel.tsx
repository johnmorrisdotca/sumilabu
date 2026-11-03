import type { Scorecard, ScorecardItem } from "@/lib/scorecard/contract";
import { COLLECTOR_MEASURE_RANKINGS, RANK_METHOD, formatRankValue, rankLabel, rankValue, rankingFor, rankingIds, type GradeColumn } from "@/lib/scorecard/view";

import { GradeCell } from "./grade-cell";

type Props = { doc: Scorecard; columns: GradeColumn[]; rankId: string; onPick: (id: string) => void; onOpen: (id: string) => void };

/** A ranking of a grade is drawn as grade cells; of anything else, as its number. */
function isGrade(doc: Scorecard, id: string): boolean {
  if (id.startsWith("grade:")) return true;
  return !COLLECTOR_MEASURE_RANKINGS.includes(id) && doc.items.some((i) => id in i.grades);
}

function List({ title, tone, items, doc, rankId, onOpen }: { title: string; tone: string; items: ScorecardItem[]; doc: Scorecard; rankId: string; onOpen: (id: string) => void }) {
  return (
    <section className="rounded-2xl border border-stone-300/80 bg-white/90 p-4 shadow-sm">
      <h3 className={`mb-2 text-xs font-semibold uppercase tracking-[0.2em] ${tone}`}>{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-stone-500">Nothing to rank.</p>
      ) : (
        <ol className="grid gap-1">
          {items.map((item, n) => {
            const value = rankValue(item, rankId);
            return (
              <li key={item.id} className="flex items-center gap-3">
                <span className="w-5 text-right text-sm tabular-nums text-stone-400">{n + 1}</span>
                <button type="button" onClick={() => onOpen(item.id)} className="min-w-0 flex-1 truncate rounded py-1.5 text-left text-sm text-stone-900 underline decoration-stone-300 underline-offset-2 hover:decoration-stone-700">
                  {item.name}
                </button>
                {isGrade(doc, rankId) ? <GradeCell value={typeof value === "number" ? value : null} /> : <span className="font-mono text-sm tabular-nums text-stone-700">{formatRankValue(value, rankId)}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function RankingsPanel({ doc, columns, rankId, onPick, onOpen }: Props) {
  const ids = rankingIds(doc, columns);
  const ranking = rankingFor(doc, rankId);
  const name = rankLabel(rankId);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3" data-testid="rankings-panel">
      <div role="group" aria-label="Rank by" className="flex flex-wrap gap-2">
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === rankId}
            onClick={() => onPick(id)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${id === rankId ? "border-stone-900 bg-stone-900 text-stone-50" : "border-stone-300 bg-white/80 text-stone-700 hover:border-stone-500"}`}
          >
            {rankLabel(id)}
          </button>
        ))}
      </div>
      {(doc.methods[rankId] ?? doc.methods[RANK_METHOD[rankId] ?? ""]) ? <p className="text-sm text-stone-600"><span className="font-semibold">{name}:</span> {doc.methods[rankId] ?? doc.methods[RANK_METHOD[rankId] ?? ""]}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <List title={`Best: ${name}`} tone="text-emerald-700" items={ranking.best} doc={doc} rankId={rankId} onOpen={onOpen} />
        <List title={`Worst: ${name}`} tone="text-red-700" items={ranking.worst} doc={doc} rankId={rankId} onOpen={onOpen} />
      </div>
    </div>
  );
}
