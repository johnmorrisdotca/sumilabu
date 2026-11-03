-- SUMILABU-6: the package scorecard. Additive: one new table, nothing else touched.
-- Applied by `prisma db push` from the deploy workflow; kept here for review.
CREATE TABLE "ScorecardRun" (
    "id" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itemCount" INTEGER NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "overall" JSONB NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "ScorecardRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScorecardRun_generatedAt_key" ON "ScorecardRun"("generatedAt");
