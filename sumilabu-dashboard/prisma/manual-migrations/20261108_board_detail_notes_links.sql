-- BoardTicket.detail to 16,000 characters (SUMILABU-18), and the tables for
-- notes and edit history (SUMILABU-19; BOARD_RULES.md invariants 6, 15, 16).
--
-- This repository applies prisma/schema.prisma with `pnpm db:push` and keeps no
-- prisma/migrations history, so Prisma never reads this file. It is the SQL
-- `db push` runs for these changes, from `prisma migrate diff` against the schema
-- before them, kept for review. The deploy workflow runs the push itself; do not
-- run this against production by hand.
--
-- Additive only: a wider VARCHAR (every stored value kept, no table rewrite in
-- Postgres) and two new tables with an index each. Take the backup in AGENTS.md
-- step 4 first all the same.

-- AlterTable
ALTER TABLE "BoardTicket" ALTER COLUMN "detail" SET DATA TYPE VARCHAR(16000);

-- CreateTable
CREATE TABLE "BoardTicketEdit" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "field" VARCHAR(10) NOT NULL,
    "oldValue" VARCHAR(16000),
    "newValue" VARCHAR(16000),
    "editedBy" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardTicketEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardTicketNote" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "body" VARCHAR(16000) NOT NULL,
    "by" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardTicketNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoardTicketEdit_ticketId_createdAt_idx" ON "BoardTicketEdit"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "BoardTicketNote_ticketId_createdAt_idx" ON "BoardTicketNote"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "BoardTicketEdit" ADD CONSTRAINT "BoardTicketEdit_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "BoardTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardTicketNote" ADD CONSTRAINT "BoardTicketNote_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "BoardTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

