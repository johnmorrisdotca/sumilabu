"use client";

import { useState } from "react";

import type { ScorecardItem } from "@/lib/scorecard/contract";
import { LINK_ORDER, daysSinceUpdate, formatCount, formatDays, formatMeasure, itemVersion, measureLabel, measureOrder, orderKeys, type GradeColumn } from "@/lib/scorecard/view";

import { GradeCell, TrendSpark } from "./grade-cell";

export type DetailTab = "grades" | "facts" | "numbers";
type Tab = DetailTab;
export const DETAIL_TABS: Array<{ id: Tab; label: string }> = [
  { id: "grades", label: "Grades" },
  { id: "facts", label: "Facts and flags" },
  { id: "numbers", label: "Numbers" },
];

function Rows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-stone-500">{k}</dt>
          <dd className="text-right font-mono text-xs leading-5 tabular-nums text-stone-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{title}</h3>
      {children}
    </section>
  );
}

export function ItemDetail({ item, columns, trend, onBack, initialTab = "grades" }: { item: ScorecardItem; columns: GradeColumn[]; trend: number[]; onBack: () => void; initialTab?: DetailTab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const links = orderKeys(Object.keys(item.links), LINK_ORDER).map((k) => [k, item.links[k]] as const);
  const d = item.dependencies;
  const p = item.popularity;
  return (
    <article className="grid grid-cols-[minmax(0,1fr)] gap-3" data-testid="item-detail" data-item={item.id}>
      <header className="rounded-2xl border border-stone-300/80 bg-white/90 p-4 shadow-sm">
        <button type="button" onClick={onBack} className="mb-2 rounded px-1 py-1 text-sm text-stone-600 underline underline-offset-2 hover:text-stone-900 print:hidden">
          ← All items
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-xl font-semibold tracking-tight md:text-2xl">{item.name}</h2>
            <p className="mt-1 text-sm text-stone-600">{item.summary || "No summary."}</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600">
              <span className="rounded-full bg-stone-200 px-2 py-0.5 font-semibold uppercase tracking-wider">{item.kind}</span>
              <span>{item.owner}</span>
              <span className="font-mono">{itemVersion(item) ? `v${itemVersion(item)}` : "no version"}</span>
              <span>updated {formatDays(daysSinceUpdate(item))}{daysSinceUpdate(item) ? " ago" : ""}</span>
            </p>
            {links.length > 0 ? (
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {links.map(([k, href]) => (
                  <a key={k} href={href} target="_blank" rel="noopener noreferrer" className="rounded py-1 text-stone-800 underline underline-offset-2 hover:text-emerald-800">
                    {k}
                  </a>
                ))}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2">
            <GradeCell value={item.grades.overall ?? null} large label="Overall" />
            <span className="text-xs uppercase tracking-wider text-stone-500">overall</span>
            <TrendSpark points={trend} />
          </div>
        </div>
        {item.flags.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Flags">
            {item.flags.map((f) => (
              <li key={f} className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">
                ⚑ {f}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <div role="tablist" aria-label="Detail" className="flex flex-wrap gap-2 print:hidden">
        {DETAIL_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${tab === t.id ? "border-stone-900 bg-stone-900 text-stone-50" : "border-stone-300 bg-white/80 text-stone-700 hover:border-stone-500"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "grades" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="tabpanel">
          {[columns[columns.length - 1], ...columns.slice(0, -1)].map((c) => (
            <section key={c.id} className="flex gap-3 rounded-2xl border border-stone-300/80 bg-white/90 p-3 shadow-sm" data-grade={c.id}>
              <GradeCell value={item.grades[c.id] ?? null} large label={c.long} />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{c.long}</h3>
                <p className="mt-0.5 text-sm leading-5 text-stone-600">{item.gradeNotes[c.id] ?? (item.grades[c.id] == null ? "Could not be judged." : "No note.")}</p>
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {tab === "facts" ? (
        <div className="grid gap-3 md:grid-cols-[2fr_1fr]" role="tabpanel">
          <Card title="Facts">
            {item.facts.length === 0 ? <p className="text-sm text-stone-500">None recorded.</p> : <ol className="grid list-decimal gap-1.5 pl-5 text-sm leading-5 text-stone-800">{item.facts.map((f, i) => <li key={i}>{f}</li>)}</ol>}
          </Card>
          <Card title="Dates">
            <Rows
              rows={[
                ["Last commit", item.dates.lastCommit ?? "–"],
                ["Last release", item.dates.lastRelease ?? "–"],
                ["Created", item.dates.created ?? "–"],
                ["Days since commit", formatDays(item.dates.daysSinceCommit)],
                ["Days since release", formatDays(item.dates.daysSinceRelease)],
              ]}
            />
          </Card>
        </div>
      ) : null}

      {tab === "numbers" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" role="tabpanel">
          <Card title="Popularity">
            <Rows
              rows={[
                ["Downloads / week", formatCount(p.npmDownloadsWeek)],
                ["Downloads / month", formatCount(p.npmDownloadsMonth)],
                ["Stars", formatCount(p.stars)],
                ["Forks", formatCount(p.forks)],
                ["Watchers", formatCount(p.watchers)],
                ["Outside dependents", formatCount(p.dependentsOutsideFamily)],
              ]}
            />
            {p.note ? <p className="mt-2 text-xs leading-5 text-stone-500">{p.note}</p> : null}
          </Card>
          <Card title="Versions and size">
            <Rows
              rows={[
                ["npm", item.versions.npm ?? "–"],
                ["repo", item.versions.repo ?? "–"],
                ["Versions published", item.versions.count === null ? "–" : String(item.versions.count)],
                ["Packed", d.packedKb === null ? "–" : `${d.packedKb} KB`],
                ["Unpacked", d.unpackedKb === null ? "–" : `${d.unpackedKb} KB`],
              ]}
            />
          </Card>
          <Card title="Dependencies">
            <Rows rows={[["Runtime", d.runtime.length ? d.runtime.join(", ") : "none"], ["Optional peers", d.optionalPeers.length ? d.optionalPeers.join(", ") : "none"], ["Family", d.family.length ? d.family.join(", ") : "none"], ["Dev", d.dev === null ? "–" : String(d.dev)]]} />
          </Card>
          <Card title="What was measured">
            {Object.keys(item.measures).length === 0 ? <p className="text-sm text-stone-500">Nothing recorded.</p> : <Rows rows={orderKeys(Object.keys(item.measures), measureOrder).map((k) => [measureLabel(k), formatMeasure(item.measures[k])])} />}
          </Card>
        </div>
      ) : null}
    </article>
  );
}
