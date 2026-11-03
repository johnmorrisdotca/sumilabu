import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { parseJson, readChanges, type StoredChanges } from "./changes";
import { overallByItem, parseScorecard, type Scorecard } from "./contract";

/* How many runs stay in Postgres: the latest for the page and a handful behind
   it for the trend line. Neon is on the Free plan (0.5 GB); a run is well
   under 1 MB (MAX_BODY_BYTES in the route) so ten of them are a rounding error,
   but there is no reason for the table to grow without bound either. */
export const SCORECARD_KEEP_RUNS = 10;

/** Written by the upload route: one row per run, then everything past the newest ten is removed. */
export async function saveScorecardRun(doc: Scorecard, byteSize: number): Promise<{ pruned: number }> {
  const generatedAt = new Date(doc.generatedAt);
  const overall = overallByItem(doc) as Prisma.InputJsonValue;
  const payload = doc as unknown as Prisma.InputJsonValue;
  await prisma.scorecardRun.upsert({
    where: { generatedAt },
    create: { generatedAt, itemCount: doc.items.length, byteSize, overall, payload },
    update: { receivedAt: new Date(), itemCount: doc.items.length, byteSize, overall, payload },
  });
  const surplus = await prisma.scorecardRun.findMany({ orderBy: { generatedAt: "desc" }, skip: SCORECARD_KEEP_RUNS, select: { id: true } });
  if (surplus.length > 0) await prisma.scorecardRun.deleteMany({ where: { id: { in: surplus.map((r) => r.id) } } });
  return { pruned: surplus.length };
}

export type TrendPoint = { generatedAt: string; overall: Record<string, number | null> };

/** What the page draws. Dates are text because this crosses Next's data cache as JSON. */
export type ScorecardData = {
  doc: Scorecard;
  receivedAt: string;
  /** Oldest first, the latest run last. */
  trend: TrendPoint[];
  /** What moved since earlier runs, worked out when the run was uploaded (SUMILABU-14); null before the first comparison. */
  changes?: StoredChanges | null;
};

/**
 * The latest run and the trend behind it, or null when nothing has been
 * uploaded (or the stored document no longer passes the contract). Three small
 * queries in one function so the caller can cache the whole answer: the older
 * runs' payloads are never loaded, only their `overall` column.
 */
export async function readScorecard(): Promise<ScorecardData | null> {
  const runs = await prisma.scorecardRun.findMany({
    orderBy: { generatedAt: "desc" },
    take: SCORECARD_KEEP_RUNS,
    select: { id: true, generatedAt: true, receivedAt: true, overall: true },
  });
  if (runs.length === 0) return null;
  const latest = await prisma.scorecardRun.findUnique({ where: { id: runs[0].id }, select: { payload: true, changes: true } });
  if (!latest) return null;
  const parsed = parseScorecard(latest.payload);
  if (!parsed.ok) {
    console.error("stored scorecard run no longer passes the contract", parsed.problems);
    return null;
  }
  const trend: TrendPoint[] = runs
    .map((run) => ({ generatedAt: run.generatedAt.toISOString(), overall: (run.overall ?? {}) as Record<string, number | null> }))
    .reverse();
  /* Stored with the run by the upload: the page reads the comparison as it is and never looks at the history. */
  const changes = readChanges(parseJson(latest.changes));
  return { doc: parsed.doc, receivedAt: runs[0].receivedAt.toISOString(), trend, changes };
}
