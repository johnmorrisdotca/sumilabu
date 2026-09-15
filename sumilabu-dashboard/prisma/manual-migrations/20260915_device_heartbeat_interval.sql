-- Device: the heartbeat interval a device reports (`heartbeat_interval_s` on
-- /api/device-stats), so the dashboard judges each device's silence by its own
-- cadence instead of one global STALE_AFTER_SECONDS.
--
-- This repository applies prisma/schema.prisma with `pnpm db:push` and keeps no
-- prisma/migrations history, so Prisma never reads this file. It is the SQL that
-- `db push` runs for this change, from `prisma migrate diff` against the schema
-- before it, kept for review and for applying by hand.
--
-- Additive only: one nullable column, no default, no index. Every existing row
-- reads null and falls back to the global values, and the code running before
-- this change never names the column, so it is safe to apply while the old
-- deployment is live.
--
-- ORDER: apply this BEFORE deploying the code that reads it. The new Prisma
-- client selects "heartbeatIntervalSeconds" on every Device read, so the
-- dashboard fails until the column exists. Take a Neon branch first.

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "heartbeatIntervalSeconds" INTEGER;
