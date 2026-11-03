import type { ScorecardItem } from "@/lib/scorecard/contract";
import { radarGeometry } from "@/lib/scorecard/radar";
import { formatGrade, gradeBand, type GradeColumn } from "@/lib/scorecard/view";

/* The grade colour scale of GradeCell, as SVG classes, light and dark. Literal strings so Tailwind keeps them. */
const SHAPE = {
  none: "fill-stone-300/40 stroke-stone-400",
  bad: "fill-red-400/30 stroke-red-600 dark:stroke-red-400",
  poor: "fill-orange-400/30 stroke-orange-600 dark:stroke-orange-400",
  fair: "fill-amber-300/35 stroke-amber-600 dark:stroke-amber-400",
  good: "fill-lime-400/30 stroke-lime-700 dark:stroke-lime-400",
  great: "fill-emerald-400/30 stroke-emerald-700 dark:stroke-emerald-400",
} as const;
const DOT = {
  none: "fill-stone-400",
  bad: "fill-red-600 dark:fill-red-400",
  poor: "fill-orange-600 dark:fill-orange-400",
  fair: "fill-amber-600 dark:fill-amber-400",
  good: "fill-lime-700 dark:fill-lime-400",
  great: "fill-emerald-700 dark:fill-emerald-400",
} as const;

type Props = {
  item: Pick<ScorecardItem, "grades" | "gradeNotes" | "name">;
  columns: readonly GradeColumn[];
  median?: Record<string, number | null>;
  overall: number | null;
  /** The tiny one for a table row: no labels, no rings but the outer, nothing to press. */
  mini?: boolean;
  onPick?: (gradeId: string) => void;
};

/**
 * The item's grades as a radar beside its Overall (SUMILABU-12): one spoke per
 * grade, rings at 2 to 10, the item's shape in the colour of its overall band
 * and the family median as a faint outline behind it. A grade nobody could
 * judge leaves a notch to the centre and a hollow dot there. Every point is a
 * focusable mark: its tooltip is the grade and its note, and pressing it goes
 * to that grade's card. The list under it is the same in words, for a screen
 * reader.
 */
export function RadarChart({ item, columns, median = {}, overall, mini = false, onPick }: Props) {
  const size = mini ? 28 : 240;
  const g = radarGeometry(item, columns, size, median, mini ? 0 : 16);
  const band = gradeBand(overall);
  if (mini) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="inline-block shrink-0" data-testid="radar-mini">
        <path d={g.rings[g.rings.length - 1].path} className="fill-none stroke-stone-300 dark:stroke-stone-600" strokeWidth="0.75" />
        {g.shape.map((d, i) => (
          <path key={i} d={d} className={SHAPE[band]} strokeWidth="1" />
        ))}
      </svg>
    );
  }
  const judged = g.points.filter((p) => p.value !== null).length;
  return (
    <figure className="w-full max-w-[240px] md:w-[240px]" data-testid="radar">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full overflow-visible" role="group" aria-label={`${item.name}: ${judged} of ${g.points.length} grades judged, against the family median`}>
        {g.rings.map((r) => (
          <path key={r.value} d={r.path} className="fill-none stroke-stone-200 dark:stroke-stone-700" strokeWidth={r.value === 10 ? 1.25 : 0.75} />
        ))}
        {g.points.map((p) => (
          <line key={p.id} x1={g.centre} y1={g.centre} x2={p.spokeX} y2={p.spokeY} className="stroke-stone-200 dark:stroke-stone-700" strokeWidth="0.75" />
        ))}
        {g.median.map((d, i) => (
          <path key={`m${i}`} d={d} className="fill-none stroke-stone-500 dark:stroke-stone-400" strokeWidth="1.25" strokeDasharray="3 3" data-testid="radar-median" />
        ))}
        {g.shape.map((d, i) => (
          <path key={i} d={d} className={SHAPE[band]} strokeWidth="2" strokeLinejoin="round" data-testid="radar-shape" />
        ))}
        {g.points.map((p) => (
          <text key={`l${p.id}`} x={p.labelX} y={p.labelY} textAnchor={p.anchor} className="fill-stone-600 text-[10px] dark:fill-stone-300" aria-hidden>
            {p.label}
          </text>
        ))}
        {g.points.map((p) => {
          const tip = p.value === null ? `${p.long}: not judged` : `${p.long}: ${formatGrade(p.value)} of 10. ${item.gradeNotes[p.id] ?? ""}`.trim();
          return (
            <g
              key={`p${p.id}`}
              role="button"
              tabIndex={0}
              aria-label={tip}
              data-grade-point={p.id}
              onClick={() => onPick?.(p.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onPick?.(p.id);
                }
              }}
              className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-sky-600 [&:focus-visible>circle]:stroke-[3]"
            >
              <title>{tip}</title>
              <circle cx={p.x} cy={p.y} r="9" className="fill-transparent" />
              <circle cx={p.x} cy={p.y} r={p.value === null ? 4 : 3.5} className={p.value === null ? "fill-white stroke-stone-500 dark:fill-stone-900" : `${DOT[gradeBand(p.value)]} stroke-white dark:stroke-stone-900`} strokeWidth="1.5" />
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-center text-[11px] text-stone-500 dark:text-stone-400">
        <span className="inline-flex items-center gap-1"><span aria-hidden className="inline-block h-0.5 w-4 bg-current" /> this item</span>
        <span className="ml-3 inline-flex items-center gap-1"><span aria-hidden className="inline-block w-4 border-t border-dashed border-current" /> family median</span>
      </figcaption>
    </figure>
  );
}
