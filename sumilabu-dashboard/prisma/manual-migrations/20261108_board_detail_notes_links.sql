-- The board gets longer details, notes, edit history, parents and related links
-- (SUMILABU-18, 19 and 20; BOARD_RULES.md invariants 6 and 15 to 18).
--
-- This repository applies prisma/schema.prisma with `pnpm db:push` and keeps no
-- prisma/migrations history, so Prisma never reads this file. It is the SQL
-- `db push` runs for these changes, from `prisma migrate diff` against the schema
-- before them, kept for review. The deploy workflow runs the push itself; do not
-- run this against production by hand.
--
-- Additive only: a wider VARCHAR (every stored value kept, no table rewrite in
-- Postgres), one nullable column with its index and a self-referencing foreign
-- key (every existing row gets a null parent), and three new tables with their
-- indexes. Take the backup in AGENTS.md step 4 first all the same.

-- AlterTable
ALTER TABLE "BoardTicket" ADD COLUMN     "parentId" TEXT,
ALTER COLUMN "detail" SET DATA TYPE VARCHAR(16000);

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

-- CreateTable
CREATE TABLE "BoardTicketLink" (
    "id" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "lowId" TEXT NOT NULL,
    "highId" TEXT NOT NULL,
    "by" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardTicketLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoardTicketEdit_ticketId_createdAt_idx" ON "BoardTicketEdit"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "BoardTicketNote_ticketId_createdAt_idx" ON "BoardTicketNote"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "BoardTicketLink_highId_idx" ON "BoardTicketLink"("highId");

-- CreateIndex
CREATE UNIQUE INDEX "BoardTicketLink_lowId_highId_key" ON "BoardTicketLink"("lowId", "highId");

-- CreateIndex
CREATE INDEX "BoardTicket_parentId_idx" ON "BoardTicket"("parentId");

-- AddForeignKey
ALTER TABLE "BoardTicket" ADD CONSTRAINT "BoardTicket_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "BoardTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardTicketEdit" ADD CONSTRAINT "BoardTicketEdit_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "BoardTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardTicketNote" ADD CONSTRAINT "BoardTicketNote_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "BoardTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardTicketLink" ADD CONSTRAINT "BoardTicketLink_lowId_fkey" FOREIGN KEY ("lowId") REFERENCES "BoardTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardTicketLink" ADD CONSTRAINT "BoardTicketLink_highId_fkey" FOREIGN KEY ("highId") REFERENCES "BoardTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

