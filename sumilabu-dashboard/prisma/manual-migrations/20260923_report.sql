-- Report: a member's problem report, from any site (UmaKuma today; Itsutsu
-- is building against the same contract, docs/board/REPORTS_CONTRACT.md).
--
-- This repository applies prisma/schema.prisma with `pnpm db:push` and keeps
-- no prisma/migrations history, so Prisma never reads this file. It is the
-- SQL that `db push` runs for this change, from `prisma migrate diff` against
-- the schema before it, kept for review and for applying by hand.
--
-- Additive only: a new table, nothing existing changes. Safe to apply while
-- the old deployment is live; the new routes (/api/v1/projects/{key}/reports,
-- .../reports/{id}, .../reports/{id}/file, /api/v1/health) and the
-- REPORTS_TOKENS_JSON token map are what read and write it, and none of them
-- exist until this deploy's code is live too.
--
-- Note `projectKey` carries no default (unlike the telemetry tables): every
-- write here is already authenticated to one project, and a defaulted column
-- would let a row exist that no project owns.

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "path" VARCHAR(500),
    "appVersion" VARCHAR(40),
    "reporterRef" VARCHAR(200) NOT NULL,
    "reporterName" VARCHAR(80),
    "status" TEXT NOT NULL DEFAULT 'new',
    "filedTicketId" VARCHAR(40),
    "adminNote" VARCHAR(4000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_projectKey_status_createdAt_idx" ON "Report"("projectKey", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Report_projectKey_reporterRef_createdAt_idx" ON "Report"("projectKey", "reporterRef", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Report_createdAt_idx" ON "Report"("createdAt" DESC);
