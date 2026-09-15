-- BoardTicket: an optional per-project ticket key (BOARD_RULES.md invariant 11),
-- and who last revised a ticket's title or detail (invariant 12).
--
-- This repository applies prisma/schema.prisma with `pnpm db:push` and keeps no
-- prisma/migrations history, so Prisma never reads this file. It is the SQL that
-- `db push` runs for this change, from `prisma migrate diff` against the schema
-- before it, kept for review and for applying by hand.
--
-- Additive only: three nullable columns and one unique index. Every existing row
-- gets a null key, and Postgres treats nulls as distinct in a unique index, so
-- the index cannot fail on existing rows. Take a Neon branch first all the same.

-- AlterTable
ALTER TABLE "BoardTicket" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "editedBy" VARCHAR(80),
ADD COLUMN     "key" VARCHAR(80);

-- CreateIndex
CREATE UNIQUE INDEX "BoardTicket_projectKey_key_key" ON "BoardTicket"("projectKey", "key");
