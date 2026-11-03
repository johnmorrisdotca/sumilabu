import { prisma } from "@/lib/prisma";

import { CHANGES_VERSION, compareRuns, datesToPrune, figuresOf, parseJson, pickBases, readFigures, type RunFigures, type StoredChanges } from "./changes";
import { parseScorecard, type Scorecard } from "./contract";

/*
 * The scorecard's history (SUMILABU-14), written only by the upload route:
 *
 * 1. the run's key figures, one small row per item (ScorecardFigures);
 * 2. once, the figures of kept runs uploaded before this existed, read from
 *    their stored documents, so the first upload after the deploy already
 *    has something to compare with;
 * 3. the retention rule (`datesToPrune`): every run for 30 days, then the
 *    newest of each week for a year;
 * 4. the comparison of the newest run with the previous run, a week back and
 *    a month back, stored on that run's row for the page to read as it is.
 *
 * The page never compares anything, and nothing here runs on a timer.
 */

export type HistoryStore = {
  /** Replaces the figures kept for the run at `at`. */
  writeRun(at: Date, run: RunFigures): Promise<void>;
  /** The generatedAt of every run with figures, as ISO text. */
  figureDates(): Promise<string[]>;
  /** The generatedAt of every ScorecardRun still stored (the newest ten), newest first. */
  documentDates(): Promise<string[]>;
  loadDocument(at: Date): Promise<unknown>;
  readRuns(dates: readonly string[]): Promise<Record<string, RunFigures>>;
  deleteRuns(dates: readonly string[]): Promise<number>;
  saveChanges(at: Date, changes: StoredChanges): Promise<void>;
};

export type HistoryResult = { runsKept: number; backfilled: number; pruned: number; compared: Record<"previous" | "week" | "month", string | null> };

export async function recordHistory(doc: Scorecard, store: HistoryStore = prismaHistoryStore, nowMs = Date.now()): Promise<HistoryResult> {
  await store.writeRun(new Date(doc.generatedAt), figuresOf(doc));

  const have = new Set((await store.figureDates()).map(iso));
  const documents = (await store.documentDates()).map(iso);
  let backfilled = 0;
  for (const at of documents) {
    if (have.has(at)) continue;
    const parsed = parseScorecard(await store.loadDocument(new Date(at)));
    if (!parsed.ok) continue;
    await store.writeRun(new Date(at), figuresOf(parsed.doc));
    have.add(at);
    backfilled++;
  }

  const newest = documents[0] ?? iso(doc.generatedAt);
  const prune = datesToPrune([...have], nowMs).filter((d) => d !== newest);
  const pruned = prune.length > 0 ? await store.deleteRuns(prune) : 0;
  for (const d of prune) have.delete(d);

  const bases = pickBases(newest, [...have]);
  const wanted = [newest, ...Object.values(bases).filter((d): d is string => d !== null)];
  const runs = await store.readRuns([...new Set(wanted)]);
  const current = runs[newest] ?? {};
  const compare = (at: string | null) => (at && runs[at] ? compareRuns(current, runs[at], at) : null);
  const changes: StoredChanges = { v: CHANGES_VERSION, at: newest, previous: compare(bases.previous), week: compare(bases.week), month: compare(bases.month) };
  await store.saveChanges(new Date(newest), changes);

  return { runsKept: have.size, backfilled, pruned, compared: bases };
}

/** Every date as Postgres gives it back (milliseconds, Z), so a run is the same key whichever way it was read. */
function iso(value: string | Date): string {
  return new Date(value).toISOString();
}

export const prismaHistoryStore: HistoryStore = {
  async writeRun(at, run) {
    const data = Object.entries(run).map(([itemId, r]) => ({ generatedAt: at, itemId, name: r.name.slice(0, 120), figures: JSON.stringify(r.figures) }));
    await prisma.$transaction([prisma.scorecardFigures.deleteMany({ where: { generatedAt: at } }), prisma.scorecardFigures.createMany({ data })]);
  },
  async figureDates() {
    const groups = await prisma.scorecardFigures.groupBy({ by: ["generatedAt"], orderBy: { generatedAt: "desc" } });
    return groups.map((g) => g.generatedAt.toISOString());
  },
  async documentDates() {
    const runs = await prisma.scorecardRun.findMany({ orderBy: { generatedAt: "desc" }, select: { generatedAt: true } });
    return runs.map((r) => r.generatedAt.toISOString());
  },
  async loadDocument(at) {
    const row = await prisma.scorecardRun.findUnique({ where: { generatedAt: at }, select: { payload: true } });
    return row?.payload ?? null;
  },
  async readRuns(dates) {
    const rows = await prisma.scorecardFigures.findMany({ where: { generatedAt: { in: dates.map((d) => new Date(d)) } }, select: { generatedAt: true, itemId: true, name: true, figures: true } });
    const out: Record<string, RunFigures> = {};
    for (const row of rows) {
      const at = row.generatedAt.toISOString();
      (out[at] ??= {})[row.itemId] = { name: row.name, figures: readFigures(parseJson(row.figures)) };
    }
    return out;
  },
  async deleteRuns(dates) {
    const { count } = await prisma.scorecardFigures.deleteMany({ where: { generatedAt: { in: dates.map((d) => new Date(d)) } } });
    return count;
  },
  async saveChanges(at, changes) {
    await prisma.scorecardRun.updateMany({ where: { generatedAt: at }, data: { changes: JSON.stringify(changes) } });
  },
};
