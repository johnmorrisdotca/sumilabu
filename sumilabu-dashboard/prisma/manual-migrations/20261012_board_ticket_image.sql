-- BoardTicketImage: screenshots attached to a board ticket
-- (docs/board/BOARD_RULES.md, "Ticket images").
--
-- This repository applies prisma/schema.prisma with `pnpm db:push` and keeps
-- no prisma/migrations history, so Prisma never reads this file. It is the
-- SQL that `db push` runs for this change, from `prisma migrate diff` against
-- the schema before it, kept for review and for applying by hand.
--
-- Additive only: a new table. Safe to apply while the old deployment is
-- live; it never reads or writes it.
--
-- The bytes are stored here, in Postgres, rather than in blob storage: no
-- paid add-on. Each image is at most 512 KB, a ticket holds at most four,
-- a project at most 50 MB in all, and images on a ticket done or dropped for
-- 30 days are deleted the next time anybody in the project attaches one.
-- Deleting a ticket deletes its images through the foreign key.

-- CreateTable
CREATE TABLE "BoardTicketImage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "contentType" VARCHAR(20) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "addedBy" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardTicketImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoardTicketImage_ticketId_createdAt_idx" ON "BoardTicketImage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "BoardTicketImage_projectKey_idx" ON "BoardTicketImage"("projectKey");

-- AddForeignKey
ALTER TABLE "BoardTicketImage" ADD CONSTRAINT "BoardTicketImage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "BoardTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
