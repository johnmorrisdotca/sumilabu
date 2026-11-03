import { formatGrade, gradeBand } from "@/lib/scorecard/view";

const BAND_CLASS = {
  none: "bg-stone-100 text-stone-400",
  bad: "bg-red-200 text-red-950",
  poor: "bg-orange-200 text-orange-950",
  fair: "bg-amber-100 text-amber-950",
  good: "bg-lime-200 text-lime-950",
  great: "bg-emerald-300 text-emerald-950",
} as const;

const BAND_WORD = { none: "not graded", bad: "poor", poor: "weak", fair: "fair", good: "good", great: "excellent" } as const;

/** A 1-10 grade as a coloured cell. The number is printed, so colour is never the only signal. */
export function GradeCell({ value, large = false, label }: { value: number | null; large?: boolean; label?: string }) {
  const band = gradeBand(value);
  return (
    <span
      title={`${label ? `${label}: ` : ""}${value === null ? "not graded" : `${formatGrade(value)} of 10, ${BAND_WORD[band]}`}`}
      className={`inline-flex items-center justify-center rounded-md font-semibold tabular-nums ${BAND_CLASS[band]} ${
        large ? "h-12 min-w-14 px-3 text-2xl" : "h-7 min-w-9 px-1.5 text-sm"
      }`}
    >
      {formatGrade(value)}
    </span>
  );
}

/** The overall grade over the last runs, as a small line. Needs two points to say anything. */
export function TrendSpark({ points }: { points: number[] }) {
  if (points.length < 2) return <span className="text-xs text-stone-500">first run: no trend yet</span>;
  const w = 96;
  const h = 28;
  /* The scale is the line's own range, padded: whole-grade moves of 0.5 are invisible on a 1-10 axis. */
  const lo = Math.min(...points) - 0.5;
  const hi = Math.max(...points) + 0.5;
  const coords = points.map((p, i) => `${(i / (points.length - 1)) * (w - 4) + 2},${h - 2 - ((p - lo) / (hi - lo)) * (h - 4)}`);
  const first = points[0];
  const last = points[points.length - 1];
  const word = last > first ? "up" : last < first ? "down" : "level";
  return (
    <span className="inline-flex items-center gap-2 text-xs text-stone-600">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Overall grade over the last ${points.length} runs: ${word}, from ${first} to ${last}`}>
        <polyline points={coords.join(" ")} fill="none" stroke="#44403c" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={coords[coords.length - 1].split(",")[0]} cy={coords[coords.length - 1].split(",")[1]} r="3" fill="#44403c" />
      </svg>
      {word} over {points.length} runs
    </span>
  );
}
