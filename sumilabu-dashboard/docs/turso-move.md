# Moving Sumilabu's database from Neon to Turso (plan)

SUMILABU-15. John, 2026-11-03: "turso seems to be best choice for now". This is
the plan, written before anything moves; the move is its own piece of work,
done after the plan is reviewed. Nothing here has been run.

## Why: the numbers, 2026-11-03

Read with `neonctl` and the Vercel CLI (`~/Projects/handoffs/sumilabu-usage-check-2026-11-03.sh`
reads them again):

| | November so far (59 h) | month-end at this rate | Neon Free limit |
|---|---|---|---|
| Compute | 8.9 CU-hours (awake 35 h, at 0.25 CU) | about 108 CU-hours | 100 a month, then compute is suspended until the 1st |
| Egress | 544 MB | about 6.6 GB | 5 GB |
| Storage | 93 MB logical | | 1 GB a project |

- Requests in the 24 hours to 10:57Z on 2026-11-03: 3,758. Board calls were
  almost all of them: 1,247 `GET tickets`, 609 `PATCH tickets/{id}`, 474
  `GET tickets/{id}`, 379 `POST tickets`, 309 `ship`; then 222 telemetry
  events, 95 device-stats posts (every one a 500: SUMILABU-16), 61 settings
  reads, 46 dashboard views. By board: modules 1,180, itsutsu 424, spx-stats
  393, itsutsu-dev 344, kyogijo-stadiums 197, hotaru 171, kazoku-ui 165.
- Board sizes: spx-stats 907 tickets, 1.25 MB as a full list (85 KB
  unfinished); modules 256 tickets, 356 KB (171 KB unfinished).
- Neon is never billed on Free, so the risk is an outage: compute suspended
  for the rest of the month, which takes the board UmaKuma, Itsutsu and every
  agent use down with it. The caching that landed first (ETags, 304 with no
  query, the CLI's short-id lookup and local copy) lowers egress a lot; it
  cannot lower awake time much, because agents write about as often as they
  read and every write wakes Neon for five minutes.

Turso Free (pricing page, 2026-11-03): 5 GB storage, 500 million rows read
and 10 million rows written a month, 100 databases, point-in-time restore of
1 day, no compute hours. The org (`spxis`, logged in on the Mac Studio) is
already on it with `spx-stats`, `hotaru` and `hotaru-control`, **overages
disabled**, and on 2026-11-03 showed 208 MB, 7.1M rows read and 0.1M rows
written of this period. Limits are org-wide, so Sumilabu shares them.

## What Sumilabu would cost on Turso

Turso counts rows read (by the query plan), not queries. Estimated from the
day above, worst case (no read answered 304, every dashboard view a cache
miss):

| Work | Per day | Rows read each | Rows read a day |
|---|---|---|---|
| Board list read, 200 | 1,247 | about 100 (indexed by project and status; a full list of spx-stats is 907) | 125,000 to 370,000 |
| Board ticket read | 474 | 1 to 2 | 1,000 |
| Board version fill (only after a write) | at most 1,297 | the held tickets, by index: about 5 | 6,500 |
| Board writes (move, create, ship) | 1,297 | 3 to 6 | 8,000 |
| Dashboard view after new telemetry | 46 | about 5,030 (the newest 5,000 events) | 231,000 |
| Telemetry, settings, scorecard | 400 | 1 to 50 | 5,000 |
| **Total** | | | **about 0.4 to 0.6 million** |

That is 12 to 19 million rows read a month, 2 to 4% of 500 million (the org
is at about 70 million a month for its other databases). Rows written: about
5,000 a day, 150,000 a month, 1.5% of 10 million. Storage: 93 MB today; a
year adds about 80 MB of tickets at 150 a day (1.4 KB each), under 6 MB of
scorecard history (SUMILABU-14, docs/scorecard.md), and telemetry, which is
flat while `pnpm db:prune-telemetry --apply` runs and about 80 MB a year if it
does not. Under 300 MB in a year, 6% of the org's 5 GB.

Every query must use an index on Turso, because a scan counts every row it
touches. The board's are already indexed (`(projectKey, status, movedAt)`,
`(projectKey, claimedBy)`, `(projectKey, seq)`, `(projectKey, key)`); the
board's version reads held rows by `claimedBy` for this reason.

## The schema in SQLite terms

Prisma keeps the model; the provider becomes `sqlite` with the libSQL driver
adapter. What changes:

| Postgres today | On Turso |
|---|---|
| `@db.VarChar(n)` caps (invariant 6: a cap lives in TypeScript and in the column) | SQLite has no VarChar. The column cap becomes a `CHECK (length(col) <= n)` in the hand-written SQL (Prisma cannot write a CHECK), so the database still refuses an overlong value |
| `Json` columns: `DeviceEvent.raw`, `AppTelemetryEvent.tags/metrics/server/telemetry/raw`, `ScorecardRun.overall/payload` | `String`, written with `JSON.stringify` and read with the app's own parser, as SUMILABU-14's new columns already are |
| `seq.ts`: `UPDATE ... FROM (SELECT ... ROW_NUMBER() OVER ...)` with `::int` casts | SQLite has `UPDATE FROM` (3.33) and window functions (3.25); the casts become `CAST(... AS INTEGER)` |
| `device-latest-event.ts`: `CROSS JOIN LATERAL` | no LATERAL in SQLite: one correlated subquery per device (`... WHERE deviceRefId = d.id ORDER BY receivedAt DESC LIMIT 1`) with an index on `(deviceRefId, receivedAt)`, so it reads one row per device |
| `Int` is 32-bit (SUMILABU-16's overflow) | `INTEGER` is 64-bit |
| `Bytes` (ticket and report images, up to 512 KB) | `BLOB`, unchanged |
| `distinct` on `findMany` | Prisma does it in memory on both; the two tables are small |
| Interactive transactions (`nextSeq`, `fileReport`) and the counter's row lock | libSQL over HTTP keeps interactive transactions; SQLite takes one write lock for the whole database, which is stronger than the row lock the counter relies on |
| `prisma db push` from the deploy workflow, `pnpm db:drift` | Prisma Migrate does not talk to Turso. The SQL is generated once with `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`, kept in `prisma/turso/NNNN_name.sql`, and applied by a small `scripts/turso-migrate.mjs` (libSQL client, a `_migrations` table, each file once, stops on the first error). Drift: the same diff against the live schema read with `.schema` |

Nothing else in the code reads Postgres directly; the memory stand-ins the
tests use (`memoryPrisma.ts`, `memoryCache.ts`) are unchanged.

## The driver: Prisma with the libSQL adapter

Prisma 6 with `@prisma/adapter-libsql` and `@libsql/client` (HTTP), not plain
`@libsql/client`:

- the board's rules live in `lib/board/server.ts`, `seq.ts`,
  `lib/reports/server.ts` and the scorecard and dashboard readers, about 1,500
  lines of Prisma calls and the tests that pin them. With the adapter they
  stay as they are and only `src/lib/prisma.ts` changes (the adapter from
  `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`). Plain `@libsql/client` would
  mean rewriting every query by hand and every route test's stand-in;
- the function size gate: the adapter and client add a few MB; the Rust query
  engine (`rhel-openssl-3.0.x`, most of today's 21 MB) is still needed unless
  Prisma's engine-free client (`engineType = "client"`, the query compiler)
  is adopted, which is a separate change worth measuring then.

## The move, in order

1. **Caching first** (done on branch `work/usage`, 2026-11-03): board reads
   with ETags and 304s, the CLI's local copy and short-id lookup. Deploy it
   and read a day of logs with the usage check: the share of 304s and
   Neon's egress tell how much the move still matters.
2. **John's one script** (`bash ~/Projects/handoffs/sumilabu-turso-setup-2026-11-03.sh`):
   creates the database `sumilabu` in the org's default group
   (aws-us-east-1, beside Vercel's default iad1 functions; Neon is in
   us-west-2 today), with a 1 GB size limit; makes its token and keeps it in
   the keychain (`sumilabu TURSO_AUTH_TOKEN`) and as a Sensitive production
   variable on Vercel and a repository secret for the workflow, with
   `TURSO_DATABASE_URL` beside it. On stdin only. Unused until step 4.
3. **The code branch** `work/turso`: the schema changes above, `prisma.ts`,
   `scripts/turso-migrate.mjs`, the workflow's schema step replaced by it, and
   a local integration run of the route tests against `turso dev` (sqld) on a
   port of 6500 to 6599 with no token. `pnpm check` and `pnpm build` pass.
4. **The data move**, one script (`scripts/neon-to-turso.mjs`), at a quiet
   hour with the sessions told to pause board writes for fifteen minutes
   (`coord.py post`):
   1. `pg_dump -Fc` of Neon to `~/Projects/backups/sumilabu/<date>-before-turso.dump`
      (the command in AGENTS.md step 4); stop if it is missing or empty;
   2. every table read through the Postgres Prisma client and written as one
      JSON file per table beside the dump (also a backup, and readable);
   3. `turso-migrate.mjs` creates the schema on the empty database;
   4. the rows written through the libSQL Prisma client in batches of 500,
      parents first (Device, AppTelemetrySource, BoardTicket, then the rest),
      with `BoardTicketCounter` last;
   5. checked: the row count of every table, and every ticket's `id`, `seq`
      and `movedAt`, equal on both sides; any difference stops it.
   It never writes to Neon, and run twice it refuses a database that is not
   empty unless told to start over.
5. **Push the code** (one push; the workflow migrates, builds and deploys).
   One request each to `/api/openapi.json`, `/api/health` and one board list;
   `turso plan show` once to see rows read move.
6. **Neon stays, untouched, for 30 days** as the way back, then John may
   delete the project (it costs nothing either way on Free).

## Rollback

- Within the first hours: `pnpm dlx vercel@latest rollback` in
  `sumilabu-dashboard/` puts the previous deployment (Neon) back at once. Any
  board write made on Turso since the move is then missing on Neon:
  `scripts/neon-to-turso.mjs --back --since <time>` copies tickets, settings
  and reports changed since the move (by `movedAt`, `editedAt`, `updatedAt`,
  `createdAt`) back to Neon, after a fresh `pg_dump` of Neon. Fix forward on
  `main` after that; a rollback is not a release.
- Turso Free keeps one day of point-in-time restore, so the Mac takes its own
  copy: the monthly usage check can add `turso db shell sumilabu .dump` to
  `~/Projects/backups/sumilabu/` (a dump is text; gzip it).

## Cost of the move in work

About a day: the schema and SQL changes and their tests (half a day), the
migrate and move scripts with a dry run against a local copy of the Neon dump
(a few hours), the move itself with checks (an hour, mostly waiting), and the
copies of `BOARD_RULES.md` in UmaKuma and Itsutsu, which do not change (the
API contract is the same).
