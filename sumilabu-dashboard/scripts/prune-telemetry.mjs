// Delete old telemetry rows, and give the space back to Postgres.
//
// WHY: on 2026-10-07 AppTelemetryEvent held 215,000 rows and 498 MB, which is
// the whole 0.5 GB a Neon Free project may keep. Raw events older than a couple
// of weeks are read by nobody: the dashboard draws the latest 24 events, and
// each source and device already carries its own last-seen summary (the
// AppTelemetrySource and Device rows), which this never touches.
//
// RETENTION (the default, John, 2026-10-07: "trimmed immensely"):
//   AppTelemetryEvent   14 days
//   DeviceEvent         30 days
// Never touched: BoardTicket, BoardSetting, Report, ReportImage, Device,
// AppTelemetrySource. The board is other sites' working data.
//
// USAGE (a dry run unless told otherwise, and it names the database it reached):
//   DATABASE_URL=... DIRECT_URL=... node scripts/prune-telemetry.mjs
//   ... node scripts/prune-telemetry.mjs --apply [--events-days 14] [--device-days 30]
//
// DELETE only returns space to Postgres for reuse, it does not shrink the files,
// and Neon bills the files. So --apply ends with VACUUM FULL on the two tables,
// which rewrites them (an exclusive lock for a few seconds on a table this
// small after the delete; ingest retries on the next heartbeat).
//
// Take a Neon branch and a dump first (itsutsu's AGENTS.md, "Back It Up Before
// You Migrate It"). Production is Neon project square-snow-29043019.
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const n = Number(args[at + 1]);
  if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} needs a whole number of days, 1 or more`);
  return n;
};
const apply = args.includes("--apply");
const eventsDays = flag("events-days", 14);
const deviceDays = flag("device-days", 30);

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) throw new Error("Set DIRECT_URL (or DATABASE_URL) explicitly: this never reads a .env file.");
const prisma = new PrismaClient({ datasources: { db: { url } } });

const size = async () =>
  (await prisma.$queryRaw`SELECT pg_size_pretty(pg_database_size(current_database())) AS db,
     pg_size_pretty(pg_total_relation_size('"AppTelemetryEvent"')) AS app,
     pg_size_pretty(pg_total_relation_size('"DeviceEvent"')) AS dev`)[0];

const rows = async (table, days) =>
  Number((await prisma.$queryRawUnsafe(`SELECT count(*) AS n FROM "${table}" WHERE "receivedAt" < now() - ($1 || ' days')::interval`, String(days)))[0].n);

try {
  console.log(`database host: ${new URL(url).host}`);
  console.log("before:", await size());
  const toDelete = { AppTelemetryEvent: await rows("AppTelemetryEvent", eventsDays), DeviceEvent: await rows("DeviceEvent", deviceDays) };
  console.log(`would delete: AppTelemetryEvent older than ${eventsDays} days = ${toDelete.AppTelemetryEvent}; DeviceEvent older than ${deviceDays} days = ${toDelete.DeviceEvent}`);
  if (!apply) {
    console.log("dry run: nothing deleted. Add --apply to delete and reclaim space.");
  } else {
    const a = await prisma.$executeRawUnsafe(`DELETE FROM "AppTelemetryEvent" WHERE "receivedAt" < now() - ($1 || ' days')::interval`, String(eventsDays));
    const d = await prisma.$executeRawUnsafe(`DELETE FROM "DeviceEvent" WHERE "receivedAt" < now() - ($1 || ' days')::interval`, String(deviceDays));
    console.log(`deleted: AppTelemetryEvent ${a}, DeviceEvent ${d}`);
    await prisma.$executeRawUnsafe('VACUUM FULL "AppTelemetryEvent"');
    await prisma.$executeRawUnsafe('VACUUM FULL "DeviceEvent"');
    console.log("after:", await size());
  }
} finally {
  await prisma.$disconnect();
}
