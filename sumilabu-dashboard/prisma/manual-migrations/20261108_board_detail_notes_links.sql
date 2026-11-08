-- BoardTicket.detail: the cap goes from 4,000 to 16,000 characters (SUMILABU-18,
-- BOARD_RULES.md invariant 6).
--
-- This repository applies prisma/schema.prisma with `pnpm db:push` and keeps no
-- prisma/migrations history, so Prisma never reads this file. It is the SQL
-- `db push` runs for this change, from `prisma migrate diff` against the schema
-- before it, kept for review. The deploy workflow runs the push itself; do not
-- run this against production by hand.
--
-- Additive only: a wider VARCHAR keeps every stored value and needs no table
-- rewrite in Postgres. Take the backup in AGENTS.md step 4 first all the same.

-- AlterTable
ALTER TABLE "BoardTicket" ALTER COLUMN "detail" SET DATA TYPE VARCHAR(16000);

