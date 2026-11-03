/* eslint-disable @typescript-eslint/no-explicit-any -- tests change a copy of a typed fixture on purpose */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import type { RunFigures, StoredChanges } from "./changes";
import { parseScorecard, type Scorecard } from "./contract";
import sample from "./fixtures/sample.json";

const { recordHistory } = await import("./history");
type Store = Parameters<typeof recordHistory>[1] & object;

const DAY = 24 * 60 * 60 * 1000;

function run(at: string, edit: (d: any) => void = () => {}): Scorecard {
  const copy = structuredClone(sample) as any;
  copy.generatedAt = at;
  edit(copy);
  const parsed = parseScorecard(copy);
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));
  return parsed.doc;
}

/** The two tables in memory: figures by run, and the stored runs (documents and changes) as the upload left them. */
function memoryStore(documents: Scorecard[] = []) {
  const figures = new Map<string, RunFigures>();
  const docs = new Map(documents.map((d) => [new Date(d.generatedAt).toISOString(), d as unknown]));
  const changes = new Map<string, StoredChanges>();
  const calls = { loadDocument: 0, readRuns: [] as string[][] };
  const store: Store = {
    async writeRun(at, r) {
      figures.set(at.toISOString(), structuredClone(r));
    },
    async figureDates() {
      return [...figures.keys()];
    },
    async documentDates() {
      return [...docs.keys()].sort((a, b) => Date.parse(b) - Date.parse(a));
    },
    async loadDocument(at) {
      calls.loadDocument++;
      return docs.get(at.toISOString()) ?? null;
    },
    async readRuns(dates) {
      calls.readRuns.push([...dates]);
      return Object.fromEntries(dates.filter((d) => figures.has(d)).map((d) => [d, figures.get(d) as RunFigures]));
    },
    async deleteRuns(dates) {
      let n = 0;
      for (const d of dates) if (figures.delete(d)) n++;
      return n;
    },
    async saveChanges(at, c) {
      changes.set(at.toISOString(), structuredClone(c));
    },
  };
  /** What the upload route does: the run row first (saveScorecardRun), then the history. */
  const upload = async (doc: Scorecard, nowMs = Date.parse(doc.generatedAt) + 60_000) => {
    docs.set(new Date(doc.generatedAt).toISOString(), doc);
    return recordHistory(doc, store, nowMs);
  };
  return { store, figures, docs, changes, calls, upload };
}

const T0 = "2026-10-05T06:00:00.000Z";
const at = (days: number) => new Date(Date.parse(T0) + days * DAY).toISOString();

describe("the history kept by each upload", () => {
  it("the first run has nothing to compare with", async () => {
    const m = memoryStore();
    const result = await m.upload(run(T0));
    expect(m.figures.get(T0)?.["kazoku-ui"].figures.score).toBe(8);
    expect(result.compared).toEqual({ previous: null, week: null, month: null });
    expect(m.changes.get(T0)).toMatchObject({ v: 1, at: T0, previous: null, week: null, month: null });
  });

  it("the second run is compared with the first, and the comparison is stored with it", async () => {
    const m = memoryStore();
    await m.upload(run(T0));
    await m.upload(run(at(7), (d) => (d.items[0].grades.overall = 9)));
    const stored = m.changes.get(at(7));
    expect(stored?.previous?.at).toBe(T0);
    expect(stored?.week?.at).toBe(T0);
    expect(stored?.month).toBeNull();
    expect(stored?.previous?.items["kazoku-ui"]).toMatchObject({ rank: [2, 1], score: [8, 9] });
  });

  it("finds the week and the month back as runs pile up, and reads only those runs", async () => {
    const m = memoryStore();
    for (let d = 0; d <= 35; d += 1) await m.upload(run(at(d), (x) => (x.items[3].popularity.npmDownloadsWeek = 10 + d)));
    const stored = m.changes.get(at(35));
    expect(stored?.previous?.at).toBe(at(34));
    expect(stored?.week?.at).toBe(at(29));
    expect(stored?.month?.at).toBe(at(8));
    expect(stored?.month?.items.kyogijo).toEqual({ downloads: [18, 45] });
    expect(m.calls.readRuns.at(-1)).toEqual([at(35), at(34), at(29), at(8)]);
  });

  it("prunes to every run for 30 days, then one a week", async () => {
    const m = memoryStore();
    for (let d = 0; d <= 70; d += 1) await m.upload(run(at(d)));
    const kept = [...m.figures.keys()];
    const recent = kept.filter((k) => Date.parse(at(70)) - Date.parse(k) <= 30 * DAY);
    expect(recent).toHaveLength(31);
    expect(kept.length).toBeLessThan(31 + 7);
  });

  it("the same run sent twice replaces itself", async () => {
    const m = memoryStore();
    await m.upload(run(T0));
    await m.upload(run(at(1)));
    await m.upload(run(at(1), (d) => (d.items[1].grades.overall = 3)));
    expect(m.figures.size).toBe(2);
    expect(m.changes.get(at(1))?.previous?.items.chizu?.score).toEqual([7.5, 3]);
  });

  it("a late upload of an older run leaves the newest run's comparison right", async () => {
    const m = memoryStore();
    await m.upload(run(at(7)));
    await m.upload(run(T0, (d) => (d.items[1].grades.overall = 3)));
    expect(m.changes.get(at(7))?.previous?.at).toBe(T0);
    expect(m.changes.get(at(7))?.previous?.items.chizu?.score).toEqual([3, 7.5]);
  });

  it("fills in, once, the figures of runs uploaded before the history existed", async () => {
    const old = run(at(-7), (d) => (d.items[0].grades.overall = 6));
    const m = memoryStore([old]);
    const result = await m.upload(run(T0));
    expect(result.backfilled).toBe(1);
    expect(m.changes.get(T0)?.previous?.items["kazoku-ui"]?.score).toEqual([6, 8]);
    await m.upload(run(at(1)));
    expect(m.calls.loadDocument).toBe(1);
  });

  it("skips a stored document that no longer passes the contract", async () => {
    const m = memoryStore();
    m.docs.set(at(-3), { schemaVersion: 9 });
    const result = await m.upload(run(T0));
    expect(result.backfilled).toBe(0);
    expect(m.changes.get(T0)?.previous).toBeNull();
  });
});
