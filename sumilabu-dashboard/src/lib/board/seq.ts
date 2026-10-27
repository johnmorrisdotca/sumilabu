import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { parseShortId } from "./rules";

/**
 * Invariant 14: the numbers behind short ids like `SPX-142`.
 *
 * A project's tickets are numbered 1, 2, 3 in creation order and never
 * renumbered or reused. `BoardTicketCounter` holds the last number a project
 * has used; taking the next one writes that row inside the create's own
 * transaction, so two creates in one project queue on its row lock and cannot
 * draw the same number (the unique index on `(projectKey, seq)` is the
 * second wall, not the first). Rows that predate the column are numbered the
 * first time anything needs a number, in `createdAt` order with the id as
 * the tie-break, by the same code, so the backfill needs no deploy step and
 * is safe to run twice: a numbered row is never touched.
 */

type Tx = Prisma.TransactionClient;

/** Interactive transactions on Neon: a cold database may need a moment to take the first connection. */
export const SEQ_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

/**
 * Locks the project's counter row, numbers every unnumbered ticket in
 * creation order, and returns the last number used. Everything a caller
 * does after this inside the same transaction sees a settled project.
 */
export async function settleSeqs(tx: Tx, projectKey: string): Promise<{ last: number; numbered: number }> {
  /* An upsert that writes (increment by zero) takes the row lock either way,
     including the first time, when it creates the row. */
  const counter = await tx.boardTicketCounter.upsert({
    where: { projectKey },
    create: { projectKey, last: 0 },
    update: { last: { increment: 0 } },
  });
  const top = await tx.boardTicket.aggregate({ where: { projectKey }, _max: { seq: true } });
  const start = Math.max(counter.last, top._max.seq ?? 0);

  /* One statement numbers every unnumbered row of the project, in creation
     order, after `start`. Raw SQL leaves updatedAt alone, so numbering a row
     is not an edit. One statement, not one update per row: a few thousand
     old rows used to outlast the transaction's 30 s and roll it back. */
  const numbered = await tx.$executeRaw`
    UPDATE "BoardTicket" AS t
    SET seq = n.seq
    FROM (
      SELECT id, (${start}::int + ROW_NUMBER() OVER (ORDER BY "createdAt", id))::int AS seq
      FROM "BoardTicket"
      WHERE "projectKey" = ${projectKey} AND seq IS NULL
    ) AS n
    WHERE t.id = n.id AND t."projectKey" = ${projectKey} AND t.seq IS NULL`;
  const last = start + numbered;
  if (last !== counter.last) await tx.boardTicketCounter.update({ where: { projectKey }, data: { last } });
  return { last, numbered };
}

/** The number for a ticket about to be created, inside the create's transaction. */
export async function nextSeq(tx: Tx, projectKey: string): Promise<number> {
  const { last } = await settleSeqs(tx, projectKey);
  const next = last + 1;
  await tx.boardTicketCounter.update({ where: { projectKey }, data: { last: next } });
  return next;
}

/** Numbers every ticket of a project that has no number yet. Idempotent; returns how many it numbered. */
export async function backfillSeqs(projectKey: string): Promise<number> {
  const { numbered } = await prisma.$transaction((tx) => settleSeqs(tx, projectKey), SEQ_TX_OPTIONS);
  return numbered;
}

/**
 * The cuid a path or body names: a short id of this project is looked up by
 * its number, anything else (a cuid, a client's own imported id) is returned
 * as it came, so every old id keeps working. A short id of another project
 * has no match here and so names nothing: the caller's usual lookup by
 * `(id, projectKey)` then finds no row and answers 404.
 */
export async function resolveTicketId(projectKey: string, input: string): Promise<string> {
  const seq = parseShortId(projectKey, input);
  if (seq === null) return input;
  const find = () => prisma.boardTicket.findFirst({ where: { projectKey, seq }, select: { id: true } });
  let row = await find();
  if (!row && (await prisma.boardTicket.findFirst({ where: { projectKey, seq: null }, select: { id: true } }))) {
    await backfillSeqs(projectKey);
    row = await find();
  }
  return row?.id ?? input;
}

/** Numbers the project if this row (read before the backfill ever ran) has no number, and returns the row as it now stands. */
export async function settledRow<T extends { id: string; seq: number | null }>(
  projectKey: string,
  row: T,
  reread: () => Promise<T | null>,
): Promise<T> {
  if (row.seq != null) return row;
  await backfillSeqs(projectKey);
  return (await reread()) ?? row;
}
