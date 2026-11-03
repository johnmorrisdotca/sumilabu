import type { TicketsBlock } from "@/lib/scorecard/contract";
import { KIND_LABEL, openByKindParts, openUrgent, stackSegments, type Kind, type TicketTotals } from "@/lib/scorecard/tickets";

/* One colour per kind, light and dark, the same everywhere a kind is drawn. */
export const KIND_FILL: Record<Kind, string> = {
  bug: "fill-red-500 dark:fill-red-500",
  feature: "fill-sky-500 dark:fill-sky-500",
  chore: "fill-stone-400 dark:fill-stone-500",
  other: "fill-violet-400 dark:fill-violet-500",
};
export const KIND_SWATCH: Record<Kind, string> = { bug: "bg-red-500", feature: "bg-sky-500", chore: "bg-stone-400 dark:bg-stone-500", other: "bg-violet-400 dark:bg-violet-500" };

/** Open tickets by kind as one bar, each part with its count printed on it (or beside it when too thin), with a hidden sentence for a screen reader. */
export function KindBar({ parts, width = 320, height = 22, scale, urgent = 0, label }: { parts: ReturnType<typeof openByKindParts>; width?: number; height?: number; scale?: number; urgent?: number; label: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const span = scale && scale > 0 ? (total / scale) * width : width;
  const segs = stackSegments(parts, span, total);
  const words = total === 0 ? "nothing open" : parts.filter((p) => p.value > 0).map((p) => `${p.value} ${p.label}`).join(", ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={`${label}: ${words}${urgent ? `, ${urgent} critical or high` : ""}`} className="block" data-testid="kind-bar">
      <rect x="0" y="0" width={width} height={height} rx="4" className="fill-stone-100 dark:fill-stone-800" />
      {segs.map((s) => (
        <g key={s.key}>
          <rect x={s.x} y="0" width={Math.max(0, s.width - 1)} height={height} className={KIND_FILL[s.key as Kind]} />
          {s.width >= 18 ? (
            <text x={s.x + s.width / 2} y={height / 2 + 4} textAnchor="middle" className="fill-white text-[11px] font-semibold" aria-hidden>
              {s.value}
            </text>
          ) : null}
        </g>
      ))}
      {urgent > 0 ? <rect x="0" y={height - 3} width={Math.min(width, (urgent / Math.max(1, total)) * span)} height="3" className="fill-amber-400" data-testid="urgent-mark" /> : null}
    </svg>
  );
}

export function KindLegend() {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-600 dark:text-stone-400" aria-hidden>
      {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1">
          <span className={`inline-block h-2.5 w-2.5 rounded-sm ${KIND_SWATCH[k]}`} /> {KIND_LABEL[k]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1"><span className="inline-block h-1 w-3 bg-amber-400" /> critical or high</span>
    </p>
  );
}

/** Small bars of done tickets over time; says so in words when the boards gave no done dates. */
export function DoneBars({ counts, unit, label }: { counts: number[] | null; unit: "day" | "week"; label: string }) {
  if (!counts) return <p className="text-xs text-stone-500 dark:text-stone-400" data-testid="done-unknown">{label}: the boards give no done dates yet, so there is nothing to draw.</p>;
  const w = 180;
  const h = 36;
  const max = Math.max(1, ...counts);
  const slot = w / counts.length;
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" role="img" aria-label={`${label}: ${total} in ${counts.length} ${unit}s, most in one ${unit} ${max}`}>
        {counts.map((c, i) => {
          const bar = Math.max(1, (c / max) * (h - 2));
          return <rect key={i} x={i * slot + 0.5} y={h - bar} width={Math.max(1, slot - 1)} height={bar} className={c === 0 ? "fill-stone-300 dark:fill-stone-700" : "fill-emerald-600 dark:fill-emerald-500"} />;
        })}
      </svg>
      <figcaption className="text-xs text-stone-500 dark:text-stone-400">{label}: {total} in {counts.length} {unit}s.</figcaption>
    </figure>
  );
}

/** Three or four figures, the numbers always printed. */
export function TicketFigures({ totals }: { totals: Pick<TicketTotals, "open" | "bugs" | "criticalBugs" | "inProgress" | "doneLast7"> }) {
  const figures: Array<{ label: string; value: string; tone: string; note?: string }> = [
    { label: "open", value: String(totals.open), tone: "text-stone-900 dark:text-stone-50" },
    { label: "bugs", value: String(totals.bugs), tone: "text-red-700 dark:text-red-400", note: totals.criticalBugs ? `${totals.criticalBugs} critical` : undefined },
    { label: "in progress", value: String(totals.inProgress), tone: "text-sky-700 dark:text-sky-400" },
    { label: "done this week", value: totals.doneLast7 === null ? "–" : String(totals.doneLast7), tone: "text-emerald-700 dark:text-emerald-400" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="ticket-figures">
      {figures.map((f) => (
        <div key={f.label} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-700 dark:bg-stone-800/60">
          <dt className="text-[11px] uppercase tracking-wider text-stone-500 dark:text-stone-400">{f.label}</dt>
          <dd className={`text-2xl font-semibold tabular-nums ${f.tone}`}>
            {f.value}
            {f.note ? <span className="ml-1.5 align-middle text-xs font-semibold text-red-700 dark:text-red-400">{f.note}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function blockFigures(b: TicketsBlock) {
  const parts = openByKindParts(b);
  return { open: b.open, bugs: parts[0].value, criticalBugs: b.openByKind.bug.critical, inProgress: b.inProgress, doneLast7: b.doneLast7, urgent: openUrgent(b) };
}
