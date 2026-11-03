import { z } from "zod";

import type { Scorecard, ScorecardItem } from "./contract";
import { satisfies } from "./map";
import { openOfKind } from "./tickets";
import { formatCount, gradeLabel, overallValue } from "./view";

/*
 * Changes since an earlier run (SUMILABU-14). Pure: what is kept of a run,
 * how two runs are compared, which earlier runs are compared with, which
 * are kept, and how a change is put into words. lib/scorecard/history.ts
 * stores and reads; the components only draw.
 *
 * The comparison is made once, when a run is uploaded, and stored with the
 * run, so a page view never compares anything and nothing runs on a timer.
 */

/* ---- the figures kept of each item ---- */

/** Which way is better for a figure. The arrow shows the direction it moved; the colour says whether that is good. */
export type Better = "higher" | "lower";

export type FigureDef = {
  id: string;
  /** Short, for a chip: "Rank", "Docs", "Bugs". */
  label: string;
  /** In a sentence: "rank up 3 since 2 Nov", "open bugs down 1 since 2 Nov". */
  word: string;
  better: Better;
  kind: "rank" | "grade" | "score" | "count" | "downloads" | "points";
};

/** The fixed figures, in the order they are listed; each radar grade is `g:<grade id>`, between the score and the tickets. */
const FIXED: Record<string, Omit<FigureDef, "id">> = {
  rank: { label: "Rank", word: "rank", better: "higher", kind: "rank" },
  grade: { label: "Grade", word: "overall grade", better: "higher", kind: "grade" },
  score: { label: "Score", word: "overall score", better: "higher", kind: "score" },
  tickets: { label: "Open tickets", word: "open tickets", better: "lower", kind: "count" },
  bugs: { label: "Open bugs", word: "open bugs", better: "lower", kind: "count" },
  downloads: { label: "Downloads/wk", word: "weekly downloads", better: "higher", kind: "downloads" },
  docsScore: { label: "Docs score", word: "docs score", better: "higher", kind: "points" },
  drift: { label: "Version drift", word: "version drift", better: "lower", kind: "count" },
};
const HEAD = ["rank", "grade", "score"];
const TAIL = ["tickets", "bugs", "downloads", "docsScore", "drift"];
export const GRADE_FIGURE = "g:";

export function figureDef(id: string): FigureDef {
  const fixed = FIXED[id];
  if (fixed) return { id, ...fixed };
  const gradeId = id.startsWith(GRADE_FIGURE) ? id.slice(GRADE_FIGURE.length) : id;
  const long = gradeLabel(gradeId);
  return { id, label: long, word: `${long} grade`, better: "higher", kind: "grade" };
}

/** Figure ids in the order a list shows them: rank, grade, score, the radar grades in `gradeOrder`, then the counts. */
export function orderFigures(ids: readonly string[], gradeOrder: readonly string[]): string[] {
  const rank = (id: string): number => {
    const head = HEAD.indexOf(id);
    if (head !== -1) return head;
    const tail = TAIL.indexOf(id);
    if (tail !== -1) return 1000 + tail;
    const g = gradeOrder.indexOf(id.slice(GRADE_FIGURE.length));
    return 10 + (g === -1 ? 500 : g);
  };
  return [...ids].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Rank by overall, 1 the best; equal scores share a place (1, 2, 2, 4). An item with no overall has no rank. */
export function ranksByOverall(items: readonly ScorecardItem[]): Map<string, number> {
  const scored = items.map((i) => ({ id: i.id, v: overallValue(i) })).filter((x): x is { id: string; v: number } => typeof x.v === "number");
  scored.sort((a, b) => b.v - a.v);
  const ranks = new Map<string, number>();
  scored.forEach((x, i) => ranks.set(x.id, i > 0 && scored[i - 1].v === x.v ? (ranks.get(scored[i - 1].id) as number) : i + 1));
  return ranks;
}

/** How many family packages this item asks for in a range their latest release is not in; null when it names none. */
export function driftOf(item: ScorecardItem, latest: ReadonlyMap<string, string>): number | null {
  const ranges = Object.entries(item.dependencies.familyRanges).filter(([dep]) => dep !== item.id);
  if (ranges.length === 0) return null;
  return ranges.filter(([dep, range]) => {
    const version = latest.get(dep);
    return version !== undefined && satisfies(version, range) === false;
  }).length;
}

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;
const numberOf = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export type ItemFigures = { name: string; figures: Record<string, number> };
/** One run as it is kept: item id -> its name and figures. */
export type RunFigures = Record<string, ItemFigures>;

/** What is kept of a run: a few numbers per item, never the document. A figure that could not be read is left out, so it never reads as a change. */
export function figuresOf(doc: Pick<Scorecard, "items">): RunFigures {
  const ranks = ranksByOverall(doc.items);
  const latest = new Map(doc.items.filter((i) => i.kind === "package" && i.versions.npm).map((i) => [i.id, i.versions.npm as string]));
  const out: RunFigures = {};
  for (const item of doc.items) {
    const f: Record<string, number> = {};
    const put = (id: string, v: number | null | undefined, places = 2) => {
      if (typeof v === "number" && Number.isFinite(v)) f[id] = round(v, places);
    };
    put("rank", ranks.get(item.id));
    put("grade", item.grades.overall);
    put("score", overallValue(item));
    for (const [g, v] of Object.entries(item.grades)) if (g !== "overall") put(`${GRADE_FIGURE}${g}`, v);
    const t = item.tickets;
    put("tickets", numberOf(item.measures.openTickets) ?? t?.open);
    put("bugs", numberOf(item.measures.openBugTickets) ?? (t ? openOfKind(t, "bug") : null));
    put("downloads", item.popularity.npmDownloadsWeek, 0);
    put("docsScore", numberOf(item.measures.docsScore), 1);
    put("drift", driftOf(item, latest));
    out[item.id] = { name: item.name, figures: f };
  }
  return out;
}

/* ---- comparing two runs ---- */

/** [then, now]. Only figures that changed are kept. */
export type Pair = [number, number];

export type Comparison = {
  /** The earlier run's generatedAt. */
  at: string;
  /** item id -> figure id -> [then, now], for items in both runs with at least one change. */
  items: Record<string, Record<string, Pair>>;
  /** Ids in this run that the earlier one did not have. */
  added: string[];
  /** Items the earlier run had and this one does not. */
  dropped: Array<{ id: string; name: string }>;
};

export function compareRuns(now: RunFigures, then: RunFigures, thenAt: string): Comparison {
  const items: Comparison["items"] = {};
  const added: string[] = [];
  for (const [id, cur] of Object.entries(now)) {
    const old = then[id];
    if (!old) {
      added.push(id);
      continue;
    }
    const diff: Record<string, Pair> = {};
    for (const [fig, v] of Object.entries(cur.figures)) {
      const was = old.figures[fig];
      if (typeof was === "number" && was !== v) diff[fig] = [was, v];
    }
    if (Object.keys(diff).length > 0) items[id] = diff;
  }
  const dropped = Object.entries(then)
    .filter(([id]) => !now[id])
    .map(([id, old]) => ({ id, name: old.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { at: thenAt, items, added: added.sort(), dropped };
}

/* ---- which earlier runs ---- */

export const COMPARE_IDS = ["previous", "week", "month"] as const;
export type CompareId = (typeof COMPARE_IDS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
/** "A week ago" is the newest run at least this many days older; a weekly run a few minutes early still counts. */
export const WEEK_MIN_DAYS = 6;
/** "A month ago": the newest run at least this many days older, so one kept a week apart is found after 30 days. */
export const MONTH_MIN_DAYS = 27;

/** The runs to compare with: the one just before, and the newest at least a week and a month older. Null where there is none. */
export function pickBases(nowAt: string, earlier: readonly string[]): Record<CompareId, string | null> {
  const nowMs = Date.parse(nowAt);
  const older = [...new Set(earlier)].filter((d) => Date.parse(d) < nowMs).sort((a, b) => Date.parse(b) - Date.parse(a));
  const atLeast = (days: number) => older.find((d) => nowMs - Date.parse(d) >= days * DAY_MS) ?? null;
  return { previous: older[0] ?? null, week: atLeast(WEEK_MIN_DAYS), month: atLeast(MONTH_MIN_DAYS) };
}

/* ---- what is kept ---- */

/** Every run for this many days... */
export const KEEP_ALL_DAYS = 30;
/** ...then the newest run of each week (Monday to Sunday, UTC) up to this age; older runs go. */
export const KEEP_WEEKLY_DAYS = 365;

function weekKey(ms: number): number {
  const day = new Date(ms).getUTCDay();
  const monday = ms - ((day + 6) % 7) * DAY_MS;
  return Math.floor(monday / DAY_MS);
}

/** The run dates to delete at `nowMs`: anything over a year, and every run but a week's newest once it is past 30 days. */
export function datesToPrune(dates: readonly string[], nowMs: number): string[] {
  const unique = [...new Set(dates)].sort((a, b) => Date.parse(b) - Date.parse(a));
  const weeksSeen = new Set<number>();
  const drop: string[] = [];
  for (const d of unique) {
    const ms = Date.parse(d);
    const age = nowMs - ms;
    if (age <= KEEP_ALL_DAYS * DAY_MS) continue;
    if (age > KEEP_WEEKLY_DAYS * DAY_MS) {
      drop.push(d);
      continue;
    }
    const week = weekKey(ms);
    if (weeksSeen.has(week)) drop.push(d);
    else weeksSeen.add(week);
  }
  return drop;
}

/* ---- what is stored with a run, and read back ---- */

/** Stored JSON text as a value, or null when it is not JSON. The columns are text so they move to SQLite as they are. */
export function parseJson(text: string | null | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A stored figures object, keeping only finite numbers: a row edited by hand never reaches a comparison as anything else. */
export function readFigures(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1])));
}


export const CHANGES_VERSION = 1;

export type StoredChanges = { v: typeof CHANGES_VERSION; at: string } & Record<CompareId, Comparison | null>;

const pair = z.tuple([z.number().finite(), z.number().finite()]);
const comparison = z.object({
  at: z.iso.datetime({ offset: true }),
  items: z.record(z.string().max(100), z.record(z.string().max(60), pair)),
  added: z.array(z.string().max(100)).max(400),
  dropped: z.array(z.object({ id: z.string().max(100), name: z.string().max(120) })).max(400),
});
const stored = z.object({
  v: z.literal(CHANGES_VERSION),
  at: z.iso.datetime({ offset: true }),
  previous: comparison.nullable(),
  week: comparison.nullable(),
  month: comparison.nullable(),
});

/** The stored changes, or null when there are none or they are of another shape (an older or newer page wrote them). */
export function readChanges(value: unknown): StoredChanges | null {
  const parsed = stored.safeParse(value);
  return parsed.success ? (parsed.data as StoredChanges) : null;
}

/** The comparison to draw: the one chosen, else the previous run's when the chosen one has no run that old yet. */
export function chosenComparison(changes: StoredChanges | null | undefined, choice: CompareId): { id: CompareId; comparison: Comparison } | null {
  if (!changes) return null;
  const pick = changes[choice];
  if (pick) return { id: choice, comparison: pick };
  return changes.previous ? { id: "previous", comparison: changes.previous } : null;
}

/* ---- words ---- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2 Nov", or "2 Nov 06:00" when it is the same day as the run it is compared with (two runs a day). Always UTC, like the run stamp. */
export function sinceLabel(at: string, nowAt?: string): string {
  const d = new Date(at);
  const label = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return nowAt && nowAt.slice(0, 10) === at.slice(0, 10) ? `${label} ${at.slice(11, 16)}` : label;
}

export type Move = { up: boolean; good: boolean; amount: string; arrow: "▲" | "▼"; sign: "+" | "−" };

/**
 * One change as an arrow. The arrow is the direction the figure moved, except
 * for rank, where up means climbing (a smaller number). Good is the direction
 * that is better for that figure: more downloads is good, more bugs is bad.
 */
export function moveOf(def: FigureDef, [then, now]: Pair): Move {
  const delta = def.kind === "rank" ? then - now : now - then;
  const up = delta > 0;
  const good = def.kind === "rank" ? up : up === (def.better === "higher");
  return { up, good, amount: formatAmount(def, Math.abs(delta)), arrow: up ? "▲" : "▼", sign: up ? "+" : "−" };
}

function trim(v: number, places: number): string {
  return String(round(v, places));
}

export function formatAmount(def: FigureDef, amount: number): string {
  switch (def.kind) {
    case "downloads":
      return formatCount(amount);
    case "score":
      return trim(amount, 2);
    case "grade":
    case "points":
      return trim(amount, 1);
    default:
      return trim(amount, 0);
  }
}

export function formatFigure(def: FigureDef, value: number): string {
  if (def.kind === "rank") return `#${value}`;
  if (def.kind === "downloads") return formatCount(value);
  return trim(value, def.kind === "score" ? 2 : 1);
}

/** What a screen reader hears, and the tooltip's first half: "rank up 3 since 2 Nov". */
export function changeWords(def: FigureDef, pair: Pair, since: string): string {
  const m = moveOf(def, pair);
  const places = def.kind === "rank" ? (m.amount === "1" ? " place" : " places") : "";
  return `${def.word} ${m.up ? "up" : "down"} ${m.amount}${places} since ${since}`;
}

/** The tooltip: the words, then from and to, then whether that is better or worse. */
export function changeTitle(def: FigureDef, pair: Pair, since: string): string {
  const m = moveOf(def, pair);
  return `${changeWords(def, pair, since)}: ${formatFigure(def, pair[0])} → ${formatFigure(def, pair[1])}, ${m.good ? "better" : "worse"}`;
}

/* ---- the Changes tab ---- */

export type Mover = { id: string; score: Pair | null; rank: Pair | null; changes: Record<string, Pair>; good: number; bad: number };

/** The items whose overall moved most, up and down: the score first, the rank when the score is level or unread. */
export function movers(comparison: Comparison, limit = 10): { up: Mover[]; down: Mover[]; others: Mover[] } {
  const all: Mover[] = Object.entries(comparison.items).map(([id, changes]) => {
    let good = 0;
    let bad = 0;
    for (const [fig, p] of Object.entries(changes)) {
      if (moveOf(figureDef(fig), p).good) good++;
      else bad++;
    }
    return { id, score: changes.score ?? null, rank: changes.rank ?? null, changes, good, bad };
  });
  const scoreDelta = (m: Mover) => (m.score ? m.score[1] - m.score[0] : 0);
  const rankDelta = (m: Mover) => (m.rank ? m.rank[0] - m.rank[1] : 0);
  const direction = (m: Mover) => Math.sign(scoreDelta(m)) || Math.sign(rankDelta(m));
  const byMove = (a: Mover, b: Mover) => Math.abs(scoreDelta(b)) - Math.abs(scoreDelta(a)) || Math.abs(rankDelta(b)) - Math.abs(rankDelta(a)) || a.id.localeCompare(b.id);
  const up = all.filter((m) => direction(m) > 0).sort(byMove);
  const down = all.filter((m) => direction(m) < 0).sort(byMove);
  const others = all.filter((m) => direction(m) === 0).sort((a, b) => b.good + b.bad - (a.good + a.bad) || a.id.localeCompare(b.id));
  return { up: up.slice(0, limit), down: down.slice(0, limit), others };
}

/** "Since 2 Nov: 6 moved up, 3 down, 1 new, 1 dropped." */
export function changesSentence(comparison: Comparison, since: string): string {
  const { up, down, others } = movers(comparison, Number.MAX_SAFE_INTEGER);
  const parts = [`${up.length} moved up`, `${down.length} down`];
  if (others.length > 0) parts.push(`${others.length} changed in other figures`);
  if (comparison.added.length > 0) parts.push(`${comparison.added.length} new`);
  if (comparison.dropped.length > 0) parts.push(`${comparison.dropped.length} dropped`);
  if (Object.keys(comparison.items).length + comparison.added.length + comparison.dropped.length === 0) return `Nothing changed since ${since}.`;
  return `Since ${since}: ${parts.join(", ")}.`;
}
