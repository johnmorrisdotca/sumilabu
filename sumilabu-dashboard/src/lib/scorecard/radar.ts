import type { ScorecardItem } from "./contract";
import type { GradeColumn } from "./view";

/*
 * The grades as a radar (spider) chart, beside an item's Overall (SUMILABU-12).
 * Not a pie: grades are not parts of a whole. Pure geometry, so the spokes,
 * rings, gaps and the family median each have a test; the component only
 * draws what this returns.
 */

export type RadarPoint = {
  id: string;
  label: string;
  long: string;
  value: number | null;
  /** Where the point sits; for a missing grade, the centre (drawn hollow). */
  x: number;
  y: number;
  /** The end of the spoke and where its label goes. */
  spokeX: number;
  spokeY: number;
  labelX: number;
  labelY: number;
  anchor: "start" | "middle" | "end";
};

export type RadarGeometry = {
  size: number;
  centre: number;
  radius: number;
  points: RadarPoint[];
  /** Rings at 2, 4, 6, 8 and 10, each a closed polygon on the spokes. */
  rings: Array<{ value: number; path: string }>;
  /** The item's shape, one closed path per run of judged grades: a missing grade leaves a gap, never a fake zero. */
  shape: string[];
  /** The family median's shape, the same way, or empty when there is none. */
  median: string[];
};

export const RING_VALUES = [2, 4, 6, 8, 10] as const;

/** The grade columns a radar shows: every grade but the overall, which sits beside it as the big number. */
export function radarColumns(columns: readonly GradeColumn[]): GradeColumn[] {
  return columns.filter((c) => c.id !== "overall");
}

/** Spoke i of n, clockwise from straight up. */
export function spokeAngle(i: number, n: number): number {
  return -Math.PI / 2 + (2 * Math.PI * i) / n;
}

function at(centre: number, radius: number, angle: number, value: number): [number, number] {
  const r = (Math.max(0, Math.min(10, value)) / 10) * radius;
  return [round(centre + r * Math.cos(angle)), round(centre + r * Math.sin(angle))];
}

const round = (v: number) => Math.round(v * 100) / 100;

function closed(points: Array<[number, number]>): string {
  return points.length === 0 ? "" : `M${points.map(([x, y]) => `${x},${y}`).join("L")}Z`;
}

/**
 * The polygons of a set of values, split at the gaps. With no gap it is one
 * closed shape; with gaps, each run of judged spokes is drawn back to the
 * centre, so a missing grade shows as a notch to the middle, not as a 0 that
 * was never given and not as a line skipping over it.
 */
export function shapePaths(values: ReadonlyArray<number | null>, centre: number, radius: number): string[] {
  const n = values.length;
  if (n === 0 || values.every((v) => v === null)) return [];
  const pt = (i: number) => at(centre, radius, spokeAngle(i, n), values[i] as number);
  if (values.every((v) => v !== null)) return [closed(values.map((_, i) => pt(i)))];
  /* Start just after a gap so every run is read in one piece, wrapping round. */
  const start = values.findIndex((v) => v === null);
  const runs: number[][] = [];
  let run: number[] = [];
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (values[i] === null) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(i);
  }
  if (run.length) runs.push(run);
  return runs.map((r) => closed([[centre, centre], ...r.map(pt)]));
}

export function radarGeometry(item: Pick<ScorecardItem, "grades">, columns: readonly GradeColumn[], size: number, median: Record<string, number | null> = {}, labelGap = 12): RadarGeometry {
  const cols = radarColumns(columns);
  const n = cols.length;
  const centre = size / 2;
  const radius = Math.max(1, centre - labelGap - (labelGap > 0 ? 12 : 2));
  const values = cols.map((c) => item.grades[c.id] ?? null);
  const points: RadarPoint[] = cols.map((c, i) => {
    const angle = spokeAngle(i, n);
    const value = values[i];
    const [x, y] = value === null ? [centre, centre] : at(centre, radius, angle, value);
    const [spokeX, spokeY] = at(centre, radius, angle, 10);
    const lr = radius + labelGap;
    const cos = Math.cos(angle);
    return {
      id: c.id,
      label: c.label,
      long: c.long,
      value,
      x,
      y,
      spokeX,
      spokeY,
      labelX: round(centre + lr * cos),
      labelY: round(centre + lr * Math.sin(angle) + 3),
      anchor: Math.abs(cos) < 0.3 ? "middle" : cos > 0 ? "start" : "end",
    };
  });
  const rings = RING_VALUES.map((value) => ({ value, path: closed(cols.map((_, i) => at(centre, radius, spokeAngle(i, n), value))) }));
  const medianValues = cols.map((c) => median[c.id] ?? null);
  return { size, centre, radius, points, rings, shape: shapePaths(values, centre, radius), median: shapePaths(medianValues, centre, radius) };
}

/** The middle value, or the mean of the two middle ones; null for none. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Each grade's median over the items like this one: the same family group
 * when the item has one, else the same kind. "Better or worse than usual"
 * means against its neighbours, not against sites when it is a package.
 */
export function familyMedian(item: Pick<ScorecardItem, "kind" | "group">, all: readonly ScorecardItem[], columns: readonly GradeColumn[]): Record<string, number | null> {
  const peers = item.group ? all.filter((i) => i.group === item.group) : all.filter((i) => i.kind === item.kind);
  return Object.fromEntries(radarColumns(columns).map((c) => [c.id, median(peers.map((p) => p.grades[c.id]).filter((v): v is number => typeof v === "number"))]));
}
