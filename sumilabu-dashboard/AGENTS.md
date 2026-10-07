<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Making a change and shipping it (read this first)

**A push to `main` that touches `sumilabu-dashboard/**` IS the production
deploy.** There is no staging and no review step after the push. GitHub
Actions (`.github/workflows/vercel-deploy.yml`) checks, pushes the schema,
builds and deploys with the Vercel CLI. The Vercel project is not connected
to GitHub, on purpose. The repository is **public**.

`api.sumilabu.com` is the ticket board and settings store for **UmaKuma and
Itsutsu**: their `pnpm task`, `release:take` and admin pages call it. If you
break a board route, you break their releases too.

Run every step in order. Do not skip one because the change "is small".

1. **Make your own worktree.** Never edit `/Users/john/Projects/sumilabu`
   itself, and never share a worktree with another agent.

       git -C /Users/john/Projects/sumilabu fetch origin
       git -C /Users/john/Projects/sumilabu worktree add ../sumilabu-worktrees/<name> -b work/<name> origin/main
       cd /Users/john/Projects/sumilabu-worktrees/<name>/sumilabu-dashboard
       pnpm install

   A dev server, if you need one: `WEB_PORT=<6501-6599, free> pnpm dev`
   (check with `lsof -iTCP:<port> -sTCP:LISTEN`). Sumilabu owns 6500–6599.
2. **Build the change with its tests**, beside the code
   (`src/**/*.test.ts`; see Testing below). A board or reports route change
   also updates `README.md` and `docs/board/BOARD_RULES.md` or
   `REPORTS_CONTRACT.md` in the same commit. A board contract change also
   needs the copies in UmaKuma and Itsutsu, and you tell those sessions
   before you push.
3. **Run the gate.** Both must exit 0 (read the exit code, not the output):

       pnpm check
       DATABASE_URL=postgresql://build:build@localhost:5432/build \
       DIRECT_URL=postgresql://build:build@localhost:5432/build pnpm build

   The placeholder URLs are what CI uses; the build never opens a database.
   Stop any `pnpm dev` in the same folder first, or the build corrupts
   `.next`.
4. **Schema change only** (`prisma/schema.prisma` changed). Additive only: a
   nullable or defaulted column, a new table or index. Never rename or drop.
   1. Save the SQL as `prisma/manual-migrations/YYYYMMDD_name.sql`.
   2. **Back up production first**, outside the repository (a dump in the
      repo could be committed to a public repository):

          mkdir -p ~/Backups/sumilabu
          pg_dump "$(neonctl connection-string --project-id square-snow-29043019)" \
            -Fc -f ~/Backups/sumilabu/sumilabu-$(date -u +%Y%m%dT%H%M%SZ).dump
          ls -l ~/Backups/sumilabu   # the new file is there and not empty

      If the backup fails, stop and tell John.
   3. Do **not** run `pnpm db:push` against production. The workflow pushes
      the schema when your commit lands (step 7), before the new code goes
      live. A change that would lose data fails that step, and then John
      decides; you do not add `--accept-data-loss`.
5. **Commit**, staging files by name (never `git add -A`):

       git add <file> <file>
       git -c user.name="John Morris" -c user.email=john@spxis.com commit

   Message: `type(scope): summary`, subject at most 50 characters (`feat`,
   `fix`, `perf`, `chore`, `docs`; scopes `board`, `dashboard`, `firmware`,
   `ui`, `ci`). The body says why. **No trailers**: no `Co-Authored-By`, no
   "Generated with", nothing that names an AI. One feature per commit.
6. **Rebase on the latest `main`** and re-run step 3 if anything came in:

       git fetch origin && git rebase origin/main

7. **Push to `main`. This deploys.** Only with a green gate, and only when
   you were asked to ship. Batch: several finished commits go in one push
   (every push is one of the account's 100 deployments a day).

       git push origin HEAD:main

   A push that changes only `*.md`, `sumilabu-dashboard/docs/**` or
   `firmware/**` starts no deploy.
8. **Watch the `deploy` job, one `gh` call a minute, never faster** (use the
   full 40-character sha):

       gh run list --workflow vercel-deploy.yml --branch main --commit $(git rev-parse HEAD) --json databaseId -q '.[0].databaseId'
       gh run view <id> --json jobs -q '.jobs[] | select(.name=="deploy") | "\(.status) \(.conclusion)"'

   - `completed success`: go to step 9.
   - `completed failure`: `gh run view <id> --log-failed`, fix it, and push
     the fix. A flaky step, or a refusal for the daily cap
     (`api-deployments-free-per-day`), is retried with
     `gh run rerun <id> --failed`, never with a new push.
   - `cancelled`: a newer push superseded it. Check
     `git merge-base --is-ancestor <your sha> origin/main` and follow that
     newer run instead.
9. **Check the live site once.** One request each, no loop:

       curl -sS -o /dev/null -w '%{http_code}\n' https://api.sumilabu.com/api/openapi.json

   plus one request to the page or route you changed. The workflow already
   checked `/api/health`.
10. **Clean up:**

        cd /Users/john/Projects/sumilabu
        git worktree remove ../sumilabu-worktrees/<name>
        git branch -D work/<name>

**Never:**

- push to `main` without a green step 3;
- run `vercel deploy` yourself, and never `vercel deploy --prebuilt` from a
  Mac (it packs the Mac's native binaries; only the workflow's Linux runner
  uses `--prebuilt`). The workflow is the only way to production;
- commit a secret, a `.env` file, a token or a database dump: this
  repository is public;
- change the production schema without a backup taken first (step 4), or
  run `pnpm db:push` against production yourself;
- open a pull request without John's permission;
- change a board, settings or reports route, status word or error code
  without telling the UmaKuma and Itsutsu sessions first;
- `git stash` (every worktree shares one stash list): commit WIP to your
  own branch instead;
- load the live site in a loop, or poll anything faster than once a minute.

# What this is

One Vercel app and one Neon database that every SPXIS site reports into and
reads from:

- **Telemetry** — firmware devices (`/api/device-stats`), apps and servers
  (`/api/v1/telemetry/events`, and the older `/api/app-telemetry`), shown on
  the dashboard at `app.sumilabu.com`.
- **The board** — the one tickets board and settings store that itsutsu and
  umakuma use instead of tables of their own (`/api/v1/projects/…`), reached
  at `api.sumilabu.com`. Same deployment, same code; the hostnames are aliases.

This folder is the site. `../firmware` is the device code and has its own
deploy path; the repository root's `AGENTS.md` maps the two. The repository is
public — no secret ever goes in a file here, an example or a test.

# Stack

- Next.js 16 (App Router), React 19, TypeScript 5, Tailwind v4, Zod 4.
- Prisma 6 on Neon Postgres. Schema applied with `db push` (no migrations dir).
- Vitest 5 for unit and route tests.
- Node 24.x, **pnpm** (never npm/yarn; `packageManager` is pinned in `package.json`).
- Vercel team `spxis-projects-0d6306b4`, project `sumilabu-dashboard`, Hobby
  plan shared with itsutsu, umakuma, wazadb and ridemuseum — its limits are
  account-wide, and this project's waste is everybody's.
- Sumilabu's local port block is **6500–6599** (`~/.claude/CLAUDE.md`, "Local
  ports"): 6500 is the dev server, a worktree takes the next free port up
  from 6501. Local Postgres containers are numbered separately in that same
  file and Sumilabu has none yet — check there for the next free one, rather
  than assuming a number here, before adding one.

# Scripts

| Task | Command |
|---|---|
| Dev server (`http://localhost:6500`, override with `WEB_PORT`) | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Unit and route tests | `pnpm test` |
| **All gates** (what CI runs before it builds) | `pnpm check` |
| Production build | `pnpm build` |
| Apply `schema.prisma` to the database in `.env` (Prisma's CLI reads `.env`, never `.env.local`) | `pnpm db:push` |
| What the database in `DIRECT_URL` lacks vs `schema.prisma` (SQL; empty = in sync). Read-only; the URL must be exported in the shell (`set -a; . ./.env; set +a`) | `pnpm db:drift` |
| Prisma Studio | `pnpm db:studio` |
| Remove superseded Vercel deployments (`--dry-run` to list) | `pnpm deploy:prune` |
| Server function sizes against their limits, after a `vercel build` (`--record` to rewrite the baseline) | `pnpm functions:size` |

Run `pnpm check` before every commit. It is the same three gates the deploy
workflow runs, so a red push is a red push you could have seen locally.

# Getting up and running

1. `pnpm install`. Its `postinstall` runs `prisma generate`. **Until it has
   run, `tsc` reports `Property 'boardTicket' does not exist on type
   'PrismaClient'` and `Cannot find module 'vitest'`.** Those are not bugs in
   the code; a fresh clone or a worktree that skipped install looks exactly
   like this (2026-09-22).
2. `cp env/.env.example .env.local` and fill it. `env/.env.example` is the
   only tracked template; `.env` and `.env.local` are ignored. Next reads
   `.env.local`; **Prisma's CLI (`db:push`, `db:studio`) reads `.env` only**,
   and `.env` silently overrides a `DATABASE_URL` given inline to Prisma, so
   know which file you are editing. **The main checkout's `.env` and
   `.env.local` point at the production database** (the Neon project
   `sumilabu` has one branch, `production`). `pnpm check` and the build need
   no database at all, so a worktree needs neither file unless you run the
   dev server; copy them in only when you must, and never run `pnpm db:push`
   with them.

   | Variable | Read by | Meaning |
   |---|---|---|
   | `DATABASE_URL`, `DIRECT_URL` | Prisma | Neon pooled and direct URLs. Locally, a Neon dev branch or a throwaway Postgres — never production. |
   | `INGEST_API_TOKEN` | ingest routes | Fallback bearer token for telemetry when the project key has none of its own. |
   | `PROJECT_TOKENS_JSON` | ingest routes | `{ "<projectKey>": "<token>" }` for telemetry, per product (`inkyframe`, `onibako`…). |
   | `DEFAULT_PROJECT_KEY` | ingest routes, dashboard | Partition used when a payload omits `project_key`. |
   | `EXPECTED_HEARTBEAT_SECONDS`, `STALE_AFTER_SECONDS` | `lib/heartbeat-thresholds.ts` | Fallback health thresholds for a device that reports no `heartbeat_interval_s`. |
   | `DASHBOARD_UTC_OFFSET_HOURS` | `app/page.tsx` | Clock and timestamps on the dashboard; default `-8`. |
   | `BOARD_TOKENS_JSON` | `lib/board/auth.ts` | `{ "<projectKey>": "<token>" }` for the ticket routes, and for `POST reports/{id}/file`. Every agent worktree of a site holds its site's entry. |
   | `SETTINGS_TOKENS_JSON` | `lib/board/auth.ts` | Same shape, settings routes only. A site's production deployment holds it and nothing else does. |
   | `REPORTS_TOKENS_JSON` | `lib/board/auth.ts` | Same shape, the reports routes (create/list/get/patch/delete) and `GET /api/v1/health` - but not filing, which needs the board token instead. |
   | `TELEMETRY_DROP_EVENTS` | `lib/telemetry-drop.ts` | Events acknowledged with `{ ok: true, dropped: true }` and not stored: comma list of `event` or `project:event`; `none` stores all. Unset means UmaKuma's `api_route`, `study_review_history` and `reading_signoffs_get_perf`. |
   | `CALENDAR_ICS_URL`, `CALENDAR_TOKEN` | `api/v1/calendar/upcoming` | A published iCal feed and the one bearer token the MagTag presents for it. Read through the data cache every 15 minutes; never touches Neon. |

   Four token maps, four purposes. Never reuse a value across them: they are
   kept apart so a leaked telemetry key cannot move tickets, a leaked
   reports key cannot file a ticket or read settings, and a leaked board key
   cannot change who may sign up.
3. `pnpm db:push` against a throwaway database in `.env` (a local Postgres
   or a Neon branch you made), never production.
4. `pnpm dev`. The board routes answer 401 until `BOARD_TOKENS_JSON` has an
   entry for the project key in the URL; use `itsutsu-dev` / `umakuma-dev`,
   the projects that exist so nothing local ever touches a real board.

# Repo map

- `src/app/page.tsx` — the dashboard. `force-dynamic`: every load is a server
  render and a paid function call, but its database reads come from
  `lib/dashboard-data.ts` (Next's data cache, one tag, cleared by every
  telemetry write), so a load when nothing has arrived does not wake Neon.
  A made-up `?project=` is answered empty with no query.
- `scripts/prune-telemetry.mjs` (`pnpm db:prune-telemetry`) — retention:
  AppTelemetryEvent 14 days, DeviceEvent 30. A dry run unless `--apply`;
  it never touches the board, reports, devices or sources.
- `src/app/api/device-stats`, `api/app-telemetry`, `api/v1/telemetry/events` —
  ingest. The first two are what installed firmware and older apps call; they
  stay as they are.
- `src/app/api/openapi`, `api/openapi.json` — the telemetry contract siblings
  read. A constant, `force-static`, served without a function invocation.
- `src/app/api/v1/projects` — which project keys have a board token (names,
  never tokens).
- `src/app/api/v1/projects/[projectKey]/tickets/…`, `…/settings/…`,
  `…/reports/…` — the board. Route handlers are thin: parse, `requireCaller`,
  call `lib/board/server.ts` or `lib/reports/server.ts`, answer.
- `src/app/api/v1/health` — one `SELECT 1`, gated on any reports token; what
  a reporting client checks before it lets a member type into the form.
- `src/app/api/v1/calendar/upcoming` — the next meetings from a published
  iCal feed, for the MagTag (`firmware/magtag/`); `lib/calendar/ics.ts` is
  the parser, with the recurrence subset a work calendar uses, and its test.
- `src/lib/board/rules.ts` — `docs/board/BOARD_RULES.md` as code; `server.ts`
  the writes; `auth.ts` the token maps (board, settings and reports scopes);
  `http.ts` the shared responses; `memoryPrisma.ts` the ticket in-memory
  stand-in the route tests run against; `memoryStore.ts` the generic row
  store `reports/memoryPrisma.ts` also builds on (board's own double
  predates it and was left as it was, to avoid touching passing ticket
  tests for a refactor).
- `src/lib/reports/rules.ts` — `docs/board/REPORTS_CONTRACT.md` as code;
  `server.ts` the writes, including `fileReport`'s transaction into
  `BoardTicket`; `http.ts` the shared responses; `memoryPrisma.ts`, built on
  `board/memoryStore.ts`, a `report` + `boardTicket` stand-in with a
  `$transaction` so the file route's atomicity is tested without a
  database.
- `src/lib/auto-refresh.ts`, `heartbeat-thresholds.ts`,
  `device-latest-event.ts` — dashboard logic, each with a test beside it.
- `prisma/schema.prisma`, `prisma/manual-migrations/` — the schema, and the
  SQL each `db push` ran, kept for review.
- `docs/board/BOARD_RULES.md` — the board contract. Copies live in the itsutsu
  and umakuma repositories; a change here is a change there in the same pass.
- `scripts/prune-deployments.sh` — the deployment cleanup, run by the deploy
  workflow and by `pnpm deploy:prune`.
- `scripts/check-function-sizes.mjs`, `scripts/function-sizes.baseline.json`,
  `src/lib/function-size-gate.mjs` — the function-size gate, its recorded
  sizes and its rules (see Function size, below).
- `env/.env.example` — the environment template.

# Testing

`pnpm test` runs vitest over `src/**/*.test.ts` in a node environment. Three
kinds, and a feature ships with the ones that apply, beside the code:

- **Pure rules** — `lib/board/rules.test.ts` is the board gate (invariant 10):
  every status, move, cap and vocabulary word the contract names, asserted.
  `lib/heartbeat-thresholds.test.ts`, `lib/auto-refresh.test.ts` likewise.
- **Route tests** — `api/v1/projects/[projectKey]/tickets/tickets.test.ts`
  calls the handlers as Next calls them: a `NextRequest` and
  `{ params: Promise.resolve({ … }) }`. `@/lib/prisma` is mocked with
  `memoryPrisma()`, which enforces the schema's unique indexes by throwing
  Prisma's own P2002, so a route's handling of a taken key is exercised, not
  assumed. Leave the mock out and point `DATABASE_URL`/`DIRECT_URL` at a
  throwaway database to run the same cases against Postgres; the projects
  are the `-dev` ones, so even that never touches a real board.
- **Auth** — `lib/board/auth.test.ts` and `api/v1/projects/projects.test.ts`,
  with `vi.stubEnv` for the token maps.

Coverage tooling is not installed; when you add a branch, add the test that
walks it. The PATCH move outcomes (`illegal`, `held`) had no route test until
2026-09-22 despite being the contract's whole point.

# Building a feature

- **The API is a contract other repositories build against.** itsutsu's and
  umakuma's `pnpm task` and `release:take`, their CI, Onibako's deploy script
  and every installed InkyFrame call these routes. Changes are additive:
  `/api/v1/…` stays stable, a breaking change is `/api/v2/…` beside it, and
  the legacy ingest routes are never removed. A new or changed board or
  reports route updates the table in `README.md` and `BOARD_RULES.md` or
  `REPORTS_CONTRACT.md` (whichever it belongs to) in the same commit; a
  telemetry change updates `api/openapi/route.ts`.
- **Route handler shape:** a Zod schema generous on the wire (caps × 4, so a
  long body is refused as a payload before it is read as a draft), then
  `requireCaller(req, projectKey, needsActor[, scope])`, then one function in
  `lib/board/server.ts`, then `{ ok: true, … }` or `{ ok: false, error, … }`:
  400 `invalid_payload`, 401 `unauthorized`, 404 `missing`, 409 for a state the
  move cannot be made from, 422 with `problems[]` for a cap. The words in
  `problems` are what a person acts on; the `error` is what a client switches on.
- **The board has a written contract.** `docs/board/BOARD_RULES.md` numbers its
  invariants so a comment and a test can cite them (`invariant 4`, `invariant
  12`); `rules.ts` is those invariants as code and nothing else; `server.ts`
  never reads-then-writes a move (invariant 4: one conditional `updateMany`,
  then a re-read only to say why). Read the file before touching a board route.
- **Caps live in two places** — `TICKET_LIMITS` and `@db.VarChar` — because a
  cap that lives only in TypeScript is another door (invariant 6).
- **Server CPU is metered and shared** (Vercel Hobby, 4 h a month for every
  project together). Before building anything ask what runs on the server,
  how often, and for how many open tabs, rows or devices:
  - no client polling under about 15 s; never from a hidden tab (revalidate
    on focus); stop when nobody has done anything for a while —
    `lib/auto-refresh.ts` is the reference, 30 minutes by default (nothing
    under 5, which is also Neon's scale-to-zero wait) and idle-aware;
  - no per-row reads in a list, no reading whole event tables per render
    (`device-latest-event.ts` exists because `page.tsx` once did);
  - static or cached where nothing changes (`openapi` is `force-static`;
    settings reads come from Next's data cache, tagged per project and
    cleared by that project's PUT/DELETE, because on 2026-09-28 they were
    most of the calls keeping Neon awake — a write that bypasses
    `lib/board/server.ts` is not seen for up to a day);
  - **Neon is on the Free plan (2026-10-07): 0.5 GB and about 100 compute
    hours a month**, and compute is awake time: every query wakes it for five
    minutes. On 2026-10-07 a crawler's `GET /` every ~20 minutes (six queries
    each) kept it awake all month and 215,000 telemetry rows filled the
    storage. So nothing on a timer may reach Postgres unless something
    changed: the dashboard reads through the data cache, noisy telemetry is
    dropped before the database (`TELEMETRY_DROP_EVENTS`), and old events are
    pruned. A new reader of Postgres that a bot or a device can hit unprompted
    is a review finding. `GET /api/health` is the deploy's own smoke check,
    once per deploy, never a monitor target. The board's own callers (`pnpm
    task`, release tools, sites' settings reads) wake it legitimately and only
    when somebody is working.
  - a firmware heartbeat is a server call and a stored row, so the interval
    is never under 15 minutes (the firmware raises anything lower).
- **A comment says why, not what,** and names the incident and date when
  there is one. That is the house style across every SPXIS repository; the
  existing files show it.

# Schema changes

- The schema is applied with **`prisma db push`**, not migrations. Each change
  is additive — a nullable or defaulted column, a new index — so the running
  deployment keeps serving while the next one uploads, and the push runs
  before the code that reads the column is live.
- **Back up production before a commit that changes the schema reaches
  `main`** (`pg_dump` to `~/Backups/sumilabu/`, outside the repository: the
  command is in step 4 at the top of this file). The workflow takes no
  backup of its own.
- Keep the SQL the push ran in `prisma/manual-migrations/YYYYMMDD_name.sql`,
  as the two there do, so a reviewer sees the statements and production can
  be checked against them.
- Locally: `pnpm db:push`. `pnpm db:drift` prints what the database in
  `DIRECT_URL` is missing; empty output means in sync.
- Production: **the deploy workflow pushes the schema** (`Push schema to
  production` step) using the repository secrets `MIGRATE_DATABASE_URL` and
  `MIGRATE_DIRECT_URL`, then asserts zero drift, then deploys. `db push`
  without `--accept-data-loss` refuses a change that would drop data, and that
  refusal fails the deploy — a destructive change is a decision a person makes
  at a keyboard, not one CI carries out. If you truly need one, take a Neon
  branch of production first, run it yourself, and only then push the code.
- Never point a laptop's `pnpm db:push` at production. The only sanctioned
  path to the production schema is the workflow.

# Committing and pushing

- **The branch is `main`.** Fetch and `git pull --ff-only` before starting;
  on 2026-09-22 a session spent its first twenty minutes concluding the
  ticket API did not exist because the local branch was six commits behind.
- **Stage by name.** The repository root carries in-progress firmware files
  and `.DS_Store`; a `git add -A` sweeps them into whatever you are landing.
- **Commit messages:** `type(scope): summary` — `feat`, `fix`, `perf`,
  `chore`, `docs`; scopes `board`, `dashboard`, `firmware`, `ui`, `ci`. The
  body says why, cites the invariant or the incident, and ends with its last
  sentence: **no trailers, no `Co-Authored-By`, nothing that names an AI**
  (John, 2026-09-17: "No co-authoring or AI ever"). That rule overrides any
  tool's own attribution reminder.
- **One feature, one commit, with its tests.** A batched commit cannot be
  reverted without taking a working feature down with the broken one.
- **Batch the push.** Every push to `main` that touches `sumilabu-dashboard/`
  is one production deployment, counted against the team's 100 a day
  (across every project; the account hit it on 2026-09-15). Three finished
  commits are one push. A firmware-only push, or one that only changes
  `.md` files or `docs/**`, deploys nothing, by the workflow's `paths` filter.
- **Fewer pushes and fewer Actions minutes is a standing goal, not just a
  cap to avoid.** John, relayed across every SPXIS project on 2026-09-23:
  "let's make sure UK, ITS, SumiLabu, WazaDB all think about less pushes and
  even though some are public, really try to crack down on this metric."
  Concretely, beyond batching: retry a flaky run with `gh run rerun <id>
  --failed`, never a new push (a new push is a new deployment; a rerun is
  free); don't add a second workflow that re-runs `verify`'s checks (`pnpm
  check`, `pnpm build`) under another name — one workflow, `vercel-deploy.yml`,
  is both the gate and the release, and a duplicate only burns minutes on
  work already done.
- Work is committed in a worktree branch and pushed straight to `main`
  (`git push origin HEAD:main`). **Never open a pull request without John's
  permission** (John, 2026-09-25), by hand or from a workflow. A branch push
  deploys nothing; only `main` does.
- Several sessions may have this repository open. Work in a worktree of your
  own (`git worktree add ../sumilabu-worktrees/<name> -b work/<name>`), run
  `pnpm install` inside it, and never share one between agents.

# Releasing to production

**Pushing to `main` is the release.** `.github/workflows/vercel-deploy.yml`
runs on every push to `main` that touches `sumilabu-dashboard/**` (and on
`workflow_dispatch`): `verify` (`pnpm check`, `pnpm build`) then `deploy`
(`vercel pull` → push schema → `vercel build --prod` → function sizes →
`vercel deploy --prebuilt --prod` → one smoke request → prune deployments). The Vercel
project has **no Git integration, on purpose**: a Git integration deploys
every push of every branch and every firmware commit, each one a deployment
against the shared daily cap, and keeps every one of them. Before 2026-09-22
there was no workflow either, and production was deployed by hand with
`vercel deploy --prod` from this folder. That is no longer done: see "No
manual deploys", below.

**Secrets the workflow needs** (Settings → Secrets and variables → Actions):
`VERCEL_TOKEN` (a token made at vercel.com/account/tokens, scoped to the
team), `VERCEL_ORG_ID` (`team_3B0yHsuwmVZw2RDT0ar7k07l`), `VERCEL_PROJECT_ID`
(`prj_mmPacyB11osc1Oq9Hq2Wn8dBJ2Oy`), `MIGRATE_DATABASE_URL` and
`MIGRATE_DIRECT_URL` (the Neon connection strings — the same two values that
are Sensitive in Vercel, which is why the workflow cannot pull them). The two
ids are in `.vercel/project.json` after `vercel pull`; itsutsu and umakuma
hold the same set under the same names.

**Knowing it landed.** Wait on the run's `deploy` job, one `gh` call a minute,
never a tighter loop (`--commit` wants the full 40-character sha; a short one
matches nothing and reads like "no run"):

    gh run list --workflow vercel-deploy.yml --branch main --commit $(git rev-parse HEAD) --json databaseId -q '.[0].databaseId'
    gh run view <id> --json jobs -q '.jobs[] | select(.name=="deploy") | "\(.status) \(.conclusion)"'

When it reads `completed success`, load the site **once** — the workflow has
already made its one smoke request. There is no version number on the site
(`package.json` stays `0.1.0`); the live commit is the `headSha` of the last
successful run:

    gh run list --workflow vercel-deploy.yml --branch main --status success --limit 1 --json headSha,createdAt

**Never load the site in a loop.** Every page is a server render — one load
is real CPU and data on a metered account.

**A deploy refused for the cap** (`api-deployments-free-per-day`) creates
nothing, costs nothing and names its reset time. Rerun the job then with
`gh run rerun <id> --failed`; do not push again to retry. If the schema step
had already run, that is fine: the change was additive and the old code
ignores the new column.

**Rolling back** (needs a logged-in Vercel CLI on your machine, or
`--token`): `pnpm dlx vercel@latest rollback` in this folder returns the
domains to the deployment before the live one — which is exactly why the
prune keeps one previous. `vercel promote <url>` moves them to any deployment
that still exists. Then fix forward on `main`; a rollback is not a release.

**Deployments kept: the live one and the one before it, nothing older.** The
workflow's last step runs `scripts/prune-deployments.sh`, one URL per
`vercel remove … --safe`, and stops with a warning rather than an error when
only aliased deployments remain. Run `pnpm deploy:prune --dry-run` any time
to see the list, and `pnpm deploy:prune` after a manual deploy. **Never
`vercel remove sumilabu-dashboard`** (the project name) and never several URLs
in one call: both hung for ten minutes on 2026-09-15.

**No manual deploys.** Never run `vercel deploy` from a laptop, and never
`vercel deploy --prebuilt` from a Mac: a build made on a Mac packs that
machine's native binaries rather than the Linux ones Vercel runs (it has
broken UmaKuma deploys, and a wrong Prisma engine took every database route
here down on 2026-09-22 — see the note above `binaryTargets` in
`prisma/schema.prisma`). A manual deploy also skips the schema push, the
size gate and the prune. If GitHub Actions is down, wait, or ask John. A
rollback (above) is the only production change made from a laptop.

**Domains:** `sumilabu.com`, `app.sumilabu.com` and `api.sumilabu.com` are
aliases of the same production deployment; `vercel alias ls` shows which.

# Function size

Every server function counts against the Functions Storage the whole Vercel
account shares, multiplied by every deployment kept, and Vercel refuses a
function over 250 MB only after the whole build has been uploaded. So the
deploy job checks sizes right after `vercel build --prod`, before the upload,
with `scripts/check-function-sizes.mjs` (stat only, about a tenth of a second).

- **No function over 120 MB, and none more than 20% over its recorded size**
  (and more than 5 MB over it, below). John, 2026-09-23: "no more than 20% sounds reasonable." The sizes are in
  `scripts/function-sizes.baseline.json`, each with a sample of the routes it
  holds, because Vercel names a bundle after its alphabetically first route
  and a new route can rename it; the gate matches by routes, not by name. A
  function the baseline does not know has the 120 MB ceiling alone. The rules
  are `src/lib/function-size-gate.mjs` and its test; umakuma holds the same.
- **Growth fails only when it is both more than 20% and more than 5 MB** over
  the record. Every function here is small enough that 20% is under 5 MB,
  and the two smallest have under half a megabyte of room at 20% (2.1 MB has
  0.4 MB), which ordinary build noise can use up; a real creep on a big function is far past the floor (90 MB at 20%
  is 18 MB). So today the two 21 MB functions may reach about 26 MB and the
  small ones about 7.
- **A deliberate change in size is recorded in the same commit as the
  change**, with `pnpm functions:size --record` after a local build, so the
  jump is in the diff a reviewer reads. Never record afterwards to turn a red
  deploy green: find what grew first, in `.next/server/**/*.nft.json`.
- **Local build, no secrets:** write `.vercel/project.json` as
  `{"projectId":"local","orgId":"local","settings":{"framework":"nextjs","nodeVersion":"24.x"}}`,
  run `vercel build --yes` in this folder, then `pnpm functions:size`. A Mac's
  build measures the same as the CI runner's, within a fraction of a MB.
  `.vercel/` is gitignored and lint-ignored. Delete that `project.json`
  before any real `vercel pull` or deploy from this folder.
- **Prisma ships one engine.** `outputFileTracingExcludes` in `next.config.ts`
  keeps only `runtime/library.js` and the `rhel-openssl-3.0.x` query engine
  Vercel runs. Without it every database route carried about 80 MB of engines
  for other machines: 102 MB a function, now 21. A Prisma upgrade that moves
  those files shows up here as growth; widen the excludes rather than
  recording it.
- **A file read off disk names its folder in a string.** Next's tracer follows
  `join(process.cwd(), "data/x.json")` and cannot follow
  `join(process.cwd(), file)`, so it packs the whole project to be safe; in
  umakuma one page reached 278 MB that way. `src/lib/server-file-tracing.test.ts`
  fails on a join to a variable or a read rooted at the whole of `src` or
  `public`.

# Sibling projects, and what breaks them

- **itsutsu** and **umakuma** keep their queues on this board: their `pnpm
  task`, `release:take` and admin pages call `api.sumilabu.com` with their
  `BOARD_TOKENS_JSON` entries (`itsutsu`, `umakuma`), and their CI's browser
  suite runs against `itsutsu-dev` / `umakuma-dev` with the dev board and
  settings tokens held as their repository secrets. A change to a board route's
  shape, status word or error code lands in their CI within the hour.
- **Onibako** posts to `/api/v1/telemetry/events` with project key `onibako`;
  the InkyFrames and Pico devices post to `/api/device-stats` under
  `inkyframe`, `inkyframe-japan`, `pico-unicorn`, on firmware that cannot be
  updated over the air.
- Rotating any token means Vercel's environment here **and** the holder's
  `.env` or repository secrets there, in the same hour.

# Things that look like bugs and are not

- `tsc` errors about `boardTicket`, `boardSetting` or `vitest` — run
  `pnpm install` (see "Getting up and running").
- vitest's warning that `vitest.config.ts` is ESM loaded as CommonJS — harmless.
- A route test answering 404 for a ticket you just created — the projects are
  `itsutsu-dev` and `umakuma-dev` and `beforeEach` deletes their rows; create
  inside the test.
- `pnpm build` in a directory where `pnpm dev` is running corrupts the
  Turbopack cache (every route 404s until `.next` is cleared). Build in a
  worktree, or stop the dev server first.
