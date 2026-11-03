import type { Scorecard } from "@/lib/scorecard/contract";
import { gradeOrder, methodLabel, orderKeys } from "@/lib/scorecard/view";

/** How it is graded (the collector's own words), how the run went, and what it left out and why. */
export function MethodPanel({ doc }: { doc: Scorecard }) {
  const boards = Object.entries(doc.run?.boardsRead ?? {});
  const missed = boards.filter(([, ok]) => !ok).map(([name]) => name);
  return (
    <div className="grid gap-3 lg:grid-cols-[3fr_2fr]" data-testid="method-panel">
      <section className="rounded-2xl border border-stone-300/80 bg-white/90 p-4 shadow-sm">
        <p className="mb-3 text-sm text-stone-600">
          Collector {doc.generator.name} {doc.generator.version}. Every grade runs from 1 (worst) to 10 (best).
          {doc.run
            ? ` This run took ${doc.run.seconds ?? "?"} s; GitHub rate-limited it: ${doc.run.githubRateLimited ? "yes" : "no"}; installs run: ${doc.run.installsRun ? "yes" : "no"}; ticket boards read: ${boards.length - missed.length} of ${boards.length}${missed.length ? ` (not read: ${missed.join(", ")})` : ""}.`
            : ""}
        </p>
        {Object.keys(doc.methods).length === 0 ? (
          <p className="text-sm text-stone-500">This run did not describe its methods.</p>
        ) : (
          <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2">
            {orderKeys(Object.keys(doc.methods), gradeOrder).map((id) => (
              <div key={id}>
                <dt className="text-sm font-semibold">{methodLabel(id)}</dt>
                <dd className="text-sm leading-5 text-stone-600">{doc.methods[id]}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
      <section className="rounded-2xl border border-stone-300/80 bg-white/90 p-4 shadow-sm" data-testid="skipped-panel">
        <h3 className="mb-1 text-sm font-semibold">Left out of this run ({doc.skipped.length})</h3>
        {doc.skipped.length === 0 ? (
          <p className="text-sm text-stone-500">Nothing was skipped.</p>
        ) : (
          <ul className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1">
            {doc.skipped.map((s) => (
              <li key={s.repo} className="text-sm leading-5">
                <span className="font-mono text-xs text-stone-800">{s.repo}</span>
                <span className="block text-stone-600">{s.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
