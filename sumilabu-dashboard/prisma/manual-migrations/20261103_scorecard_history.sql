-- SUMILABU-14: changes since the last scorecard run. Additive: one nullable
-- column and one new table, nothing renamed or dropped.
-- Applied by `prisma db push` from the deploy workflow; kept here for review.
-- Portable on purpose (SUMILABU-15, the move to Turso): text and timestamp
-- columns only, JSON kept as text and read by the app, no Postgres-only type.
-- Expected size: see docs/scorecard.md, "Changes since an earlier run".

-- AlterTable
ALTER TABLE "ScorecardRun" ADD COLUMN     "changes" TEXT;

-- CreateTable
CREATE TABLE "ScorecardFigures" (
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "figures" TEXT NOT NULL,

    CONSTRAINT "ScorecardFigures_pkey" PRIMARY KEY ("generatedAt","itemId")
);
