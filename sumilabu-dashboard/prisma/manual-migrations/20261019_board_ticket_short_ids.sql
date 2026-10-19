-- BoardTicket: a per-project number, the `n` in a short id like SPX-142
-- (BOARD_RULES.md invariant 14), and the counter that hands numbers out.
--
-- This repository applies prisma/schema.prisma with `pnpm db:push` and keeps no
-- prisma/migrations history, so Prisma never reads this file. Part 1 is the SQL
-- `db push` runs for this change, from `prisma migrate diff` against the schema
-- before it, kept for review. The deploy workflow runs the push itself; do not
-- run this against production by hand.
--
-- Additive only: one nullable column, one unique index and one new table. Every
-- existing row gets a null seq, and Postgres treats nulls as distinct in a
-- unique index, so the index cannot fail on existing rows. Take the backup in
-- AGENTS.md step 4 first all the same.

-- ---------------------------------------------------------------------------
-- Part 1: the schema (what `db push` runs).
-- ---------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "BoardTicket" ADD COLUMN     "seq" INTEGER;

-- CreateTable
CREATE TABLE "BoardTicketCounter" (
    "projectKey" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardTicketCounter_pkey" PRIMARY KEY ("projectKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoardTicket_projectKey_seq_key" ON "BoardTicket"("projectKey", "seq");

-- ---------------------------------------------------------------------------
-- Part 2: the backfill, OPTIONAL. The service numbers old rows itself, the
-- first time any board route reads or creates a ticket in a project
-- (src/lib/board/seq.ts, `settleSeqs`), in this same order. This is the same
-- numbering as SQL, for a person who wants to run and check it once, say on a
-- Neon branch, before the first request does it. It is idempotent: a row that
-- has a number is never touched, a rerun numbers nothing, and a new row (or a
-- row left unnumbered by a half-finished run) gets max + 1 in creation order.
-- Order: createdAt ascending, id ascending as the tie-break. Run it in one
-- transaction; it does not touch `updatedAt`.
-- ---------------------------------------------------------------------------

BEGIN;

LOCK TABLE "BoardTicket" IN SHARE ROW EXCLUSIVE MODE;

WITH base AS (
  SELECT "projectKey", MAX("seq") AS top FROM "BoardTicket" GROUP BY "projectKey"
), numbered AS (
  SELECT t."id",
         GREATEST(COALESCE(b.top, 0), COALESCE(c."last", 0))
           + ROW_NUMBER() OVER (PARTITION BY t."projectKey" ORDER BY t."createdAt", t."id") AS n
  FROM "BoardTicket" t
  JOIN base b ON b."projectKey" = t."projectKey"
  LEFT JOIN "BoardTicketCounter" c ON c."projectKey" = t."projectKey"
  WHERE t."seq" IS NULL
)
UPDATE "BoardTicket" t SET "seq" = numbered.n FROM numbered WHERE t."id" = numbered."id";

INSERT INTO "BoardTicketCounter" ("projectKey", "last", "updatedAt")
SELECT "projectKey", MAX("seq"), now() FROM "BoardTicket" WHERE "seq" IS NOT NULL GROUP BY "projectKey"
ON CONFLICT ("projectKey") DO UPDATE
  SET "last" = GREATEST("BoardTicketCounter"."last", EXCLUDED."last"), "updatedAt" = now();

COMMIT;
