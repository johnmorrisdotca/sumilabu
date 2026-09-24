-- ReportImage: the one optional screenshot a Report may carry
-- (docs/board/REPORTS_CONTRACT.md, "Screenshots"), and Report.imageBytes,
-- its size, so a list can say "has a screenshot" and the image byte budget
-- can be summed without reading any image.
--
-- This repository applies prisma/schema.prisma with `pnpm db:push` and keeps
-- no prisma/migrations history, so Prisma never reads this file. It is the
-- SQL that `db push` runs for this change, from `prisma migrate diff` against
-- the schema before it, kept for review and for applying by hand.
--
-- Additive only: a nullable column and a new table. Safe to apply while the
-- old deployment is live; it never reads or writes either.
--
-- The bytes are stored here, in Postgres, rather than in blob storage: no
-- paid add-on, and one image per report at most 1 MiB, under a per-reporter
-- and per-project byte budget. Deleting a report deletes its image through
-- the foreign key.

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "imageBytes" INTEGER;

-- CreateTable
CREATE TABLE "ReportImage" (
    "reportId" TEXT NOT NULL,
    "contentType" VARCHAR(20) NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportImage_pkey" PRIMARY KEY ("reportId")
);

-- AddForeignKey
ALTER TABLE "ReportImage" ADD CONSTRAINT "ReportImage_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
