import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

import { backfillSeqs, nextSeq } from "./seq";

/*
 * Invariant 14, the backfill. Runs against the in-memory board (memoryPrisma.ts),
 * whose $executeRaw applies the one statement settleSeqs issues (the set-based
 * ROW_NUMBER() numbering) in JS. The SQL itself was run against a scratch
 * Postgres 17 with the schema as Prisma generates it; that run is in the
 * change's report, not here.
 *
 * Each test gets a project of its own, so counters never leak between tests.
 */
vi.mock("@/lib/prisma", async () => {
  const { memoryPrisma } = await import("@/lib/board/memoryPrisma");
  return { prisma: memoryPrisma() };
});

let n = 0;
let P = "";

beforeEach(() => {
  n += 1;
  P = `seq-${n}`;
});

/** Legacy rows: no seq, a creation time of the test's choosing, and an updatedAt that must survive numbering. */
async function legacyRows(project: string, count: number, updatedAt: Date) {
  const base = Date.UTC(2026, 0, 1);
  /* Inserted in reverse creation order, so the numbering cannot rely on insertion order. */
  for (let i = count - 1; i >= 0; i -= 1) {
    await prisma.boardTicket.create({
      data: {
        id: `${project}:${String(i).padStart(5, "0")}`,
        projectKey: project,
        title: `Legacy ticket ${i} row`,
        kind: "feature",
        status: "open",
        createdAt: new Date(base + i * 1000),
        movedAt: new Date(base + i * 1000),
        updatedAt,
      },
    });
  }
}

describe("numbering old rows in one statement", () => {
  it("numbers a few thousand unnumbered rows in creation order and leaves updatedAt alone", async () => {
    const stamp = new Date("2026-10-20T09:00:00.000Z");
    await legacyRows(P, 3000, stamp);
    await prisma.boardTicket.create({
      data: { id: `${P}:other`, projectKey: `${P}-other`, title: "Another project's old row", kind: "feature", status: "open", createdAt: new Date(0), movedAt: new Date(0) },
    });

    expect(await backfillSeqs(P)).toBe(3000);

    const rows = await prisma.boardTicket.findMany({ where: { projectKey: P } });
    expect(rows).toHaveLength(3000);
    for (const row of rows) {
      /* createdAt was i * 1000 ms from the base, so the number is i + 1. */
      const i = (row.createdAt as Date).getTime() / 1000 - Date.UTC(2026, 0, 1) / 1000;
      expect(row.seq).toBe(i + 1);
      expect(row.updatedAt).toEqual(stamp);
    }
    expect(rows.map((row) => row.seq).sort((a, b) => (a as number) - (b as number))).toEqual(Array.from({ length: 3000 }, (_, i) => i + 1));

    const other = await prisma.boardTicket.findFirst({ where: { projectKey: `${P}-other` } });
    expect(other?.seq).toBeNull();
  });

  it("starts after the counter when the counter is ahead of the rows", async () => {
    await prisma.boardTicketCounter.upsert({ where: { projectKey: P }, create: { projectKey: P, last: 10 }, update: {} });
    await prisma.boardTicket.create({ data: { id: `${P}:numbered`, projectKey: P, title: "Already numbered row", kind: "feature", status: "open", seq: 4, createdAt: new Date(0), movedAt: new Date(0) } });
    await legacyRows(P, 2, new Date(0));

    expect(await backfillSeqs(P)).toBe(2);
    const first = await prisma.boardTicket.findFirst({ where: { id: `${P}:00000` } });
    const second = await prisma.boardTicket.findFirst({ where: { id: `${P}:00001` } });
    expect([first?.seq, second?.seq]).toEqual([11, 12]);
    expect((await prisma.boardTicketCounter.findUnique({ where: { projectKey: P } }))?.last).toBe(12);
  });

  it("is a no-op the second time, and the next create takes the number after the last row", async () => {
    await legacyRows(P, 50, new Date(0));
    expect(await backfillSeqs(P)).toBe(50);
    expect(await backfillSeqs(P)).toBe(0);

    const next = await prisma.$transaction((tx) => nextSeq(tx, P));
    expect(next).toBe(51);
    expect((await prisma.boardTicketCounter.findUnique({ where: { projectKey: P } }))?.last).toBe(51);
  });
});
