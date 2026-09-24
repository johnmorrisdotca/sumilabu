/**
 * An in-memory stand-in for the three models the reports routes touch -
 * `prisma.report`, `prisma.reportImage` and, for filing, `prisma.boardTicket` -
 * plus `$transaction`, so `POST reports/{id}/file`'s atomicity (create a
 * ticket, link the report, or neither) and a create's report-plus-image write
 * are exercised without a database. Deleting a report deletes its image, as
 * `ReportImage`'s `onDelete: Cascade` foreign key does in Postgres.
 *
 * A test installs it with `vi.mock("@/lib/prisma", ...)`; leaving the mock
 * out and pointing `DATABASE_URL`/`DIRECT_URL` at a throwaway database runs
 * the same cases against Postgres.
 */

import { createRowStore, uniqueViolation, type Row } from "../board/memoryStore";

const REPORT_DEFAULTS: Row = { status: "new", path: null, appVersion: null, reporterName: null, filedTicketId: null, adminNote: null, imageBytes: null };
const TICKET_DEFAULTS: Row = { key: null, detail: null, area: null, kind: "feature", status: "open", askedBy: null };

export function memoryPrisma() {
  const reportStore = createRowStore({
    defaults: REPORT_DEFAULTS,
    idPrefix: "report",
    assertUnique(candidate, rows, self) {
      for (const row of rows) {
        if (row !== self && row.id === candidate.id) throw uniqueViolation(["id"]);
      }
    },
  });
  const ticketStore = createRowStore({
    defaults: TICKET_DEFAULTS,
    idPrefix: "ticket",
    assertUnique(candidate, rows, self) {
      for (const row of rows) {
        if (row !== self && row.id === candidate.id) throw uniqueViolation(["id"]);
      }
    },
  });

  const imageStore = createRowStore({
    defaults: {},
    idPrefix: "image",
    assertUnique(candidate, rows, self) {
      for (const row of rows) {
        if (row !== self && row.reportId === candidate.reportId) throw uniqueViolation(["reportId"]);
      }
    },
  });

  /* The foreign key's cascade: whatever report rows a delete removes, their
     images go with them. */
  const report = {
    ...reportStore,
    async deleteMany(args: Parameters<typeof reportStore.deleteMany>[0] = {}) {
      const removed = await reportStore.findMany({ where: args.where, select: { id: true } });
      const outcome = await reportStore.deleteMany(args);
      if (removed.length > 0) await imageStore.deleteMany({ where: { reportId: { in: removed.map((row) => row.id) } } });
      return outcome;
    },
  };

  type Tx = { report: typeof report; reportImage: typeof imageStore; boardTicket: typeof ticketStore };

  return {
    report,
    reportImage: imageStore,
    boardTicket: ticketStore,
    /**
     * Just enough of Prisma's interactive transaction to exercise
     * `fileReport` and `createReport`: run the callback against the same
     * stores, and roll every one back to their pre-call snapshot if it throws - mirroring Postgres
     * undoing every statement in a transaction that does not commit.
     */
    async $transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
      const reportSnapshot = reportStore._snapshot();
      const imageSnapshot = imageStore._snapshot();
      const ticketSnapshot = ticketStore._snapshot();
      try {
        return await fn({ report, reportImage: imageStore, boardTicket: ticketStore });
      } catch (error) {
        reportStore._restore(reportSnapshot);
        imageStore._restore(imageSnapshot);
        ticketStore._restore(ticketSnapshot);
        throw error;
      }
    },
  };
}
