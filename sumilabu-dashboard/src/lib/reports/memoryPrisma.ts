/**
 * An in-memory stand-in for the two models the reports routes touch -
 * `prisma.report` and, for filing, `prisma.boardTicket` - plus
 * `$transaction`, so `POST reports/{id}/file`'s atomicity (create a ticket,
 * link the report, or neither) is exercised without a database.
 *
 * A test installs it with `vi.mock("@/lib/prisma", ...)`; leaving the mock
 * out and pointing `DATABASE_URL`/`DIRECT_URL` at a throwaway database runs
 * the same cases against Postgres.
 */

import { createRowStore, uniqueViolation, type Row } from "../board/memoryStore";

const REPORT_DEFAULTS: Row = { status: "new", path: null, appVersion: null, reporterName: null, filedTicketId: null, adminNote: null };
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

  return {
    report: reportStore,
    boardTicket: ticketStore,
    /**
     * Just enough of Prisma's interactive transaction to exercise
     * `fileReport`: run the callback against the same stores, and roll both
     * back to their pre-call snapshot if it throws - mirroring Postgres
     * undoing every statement in a transaction that does not commit.
     */
    async $transaction<T>(fn: (tx: { report: typeof reportStore; boardTicket: typeof ticketStore }) => Promise<T>): Promise<T> {
      const reportSnapshot = reportStore._snapshot();
      const ticketSnapshot = ticketStore._snapshot();
      try {
        return await fn({ report: reportStore, boardTicket: ticketStore });
      } catch (error) {
        reportStore._restore(reportSnapshot);
        ticketStore._restore(ticketSnapshot);
        throw error;
      }
    },
  };
}
