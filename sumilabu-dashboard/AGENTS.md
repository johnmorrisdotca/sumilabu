<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

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

# Scripts

| Task | Command |
|---|---|
| Dev server (`http://localhost:3000`) | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Unit and route tests | `pnpm test` |
| **All gates** (what CI runs before it builds) | `pnpm check` |
| Production build | `pnpm build` |
| Apply `schema.prisma` to the database in `.env.local` | `pnpm db:push` |
| What the database in `DIRECT_URL` lacks vs `schema.prisma` (SQL; empty = in sync) | `pnpm db:drift` |
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
   only tracked template; `.env` and `.env.local` are ignored, and `.env`
   silently overrides a `DATABASE_URL` given inline to Prisma, so know which
   file you are editing.

   | Variable | Read by | Meaning |
   |---|---|---|
   | `DATABASE_URL`, `DIRECT_URL` | Prisma | Neon pooled and direct URLs. Locally, a Neon dev branch or a throwaway Postgres — never production. |
   | `INGEST_API_TOKEN` | ingest routes | Fallback bearer token for telemetry when the project key has none of its own. |
   | `PROJECT_TOKENS_JSON` | ingest routes | `{ "<projectKey>": "<token>" }` for telemetry, per product (`inkyframe`, `onibako`…). |
   | `DEFAULT_PROJECT_KEY` | ingest routes, dashboard | Partition used when a payload omits `project_key`. |
   | `EXPECTED_HEARTBEAT_SECONDS`, `STALE_AFTER_SECONDS` | `lib/heartbeat-thresholds.ts` | Fallback health thresholds for a device that reports no `heartbeat_interval_s`. |
   | `DASHBOARD_UTC_OFFSET_HOURS` | `app/page.tsx` | Clock and timestamps on the dashboard; default `-8`. |
   | `BOARD_TOKENS_JSON` | `lib/board/auth.ts` | `{ "<projectKey>": "<token>" }` for the ticket routes. Every agent worktree of a site holds its site's entry. |
   | `SETTINGS_TOKENS_JSON` | `lib/board/auth.ts` | Same shape, settings routes only. A site's production deployment holds it and nothing else does. |

   Three token maps, three purposes. Never reuse a value across them: they
   are kept apart so a leaked telemetry key cannot move tickets, and a leaked
   board key cannot change who may sign up.
3. `pnpm db:push` against the database in `.env.local`.
4. `pnpm dev`. The board routes answer 401 until `BOARD_TOKENS_JSON` has an
   entry for the project key in the URL; use `itsutsu-dev` / `umakuma-dev`,
   the projects that exist so nothing local ever touches a real board.

# Repo map

- `src/app/page.tsx` — the dashboard. `force-dynamic`: every load is a server
  render and a paid function call.
- `src/app/api/device-stats`, `api/app-telemetry`, `api/v1/telemetry/events` —
  ingest. The first two are what installed firmware and older apps call; they
  stay as they are.
- `src/app/api/openapi`, `api/openapi.json` — the telemetry contract siblings
  read. A constant, `force-static`, served without a function invocation.
- `src/app/api/v1/projects` — which project keys have a board token (names,
  never tokens).
- `src/app/api/v1/projects/[projectKey]/tickets/…`, `…/settings/…` — the board.
  Route handlers are thin: parse, `requireCaller`, call `lib/board/server.ts`,
  answer.
- `src/lib/board/rules.ts` — `docs/board/BOARD_RULES.md` as code; `server.ts`
  the writes; `auth.ts` the token maps; `http.ts` the shared responses;
  `memoryPrisma.ts` the in-memory stand-in the route tests run against.
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
  the legacy ingest routes are never removed. A new or changed board route
  updates the table in `README.md` and `BOARD_RULES.md` in the same commit;
  a telemetry change updates `api/openapi/route.ts`.
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
    `lib/auto-refresh.ts` is the reference, 5 minutes and idle-aware;
  - no per-row reads in a list, no reading whole event tables per render
    (`device-latest-event.ts` exists because `page.tsx` once did);
  - static or cached where nothing changes (`openapi` is `force-static`);
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

- **The branch is `master`.** Fetch and `git pull --ff-only` before starting;
  on 2026-09-22 a session spent its first twenty minutes concluding the
  ticket API did not exist because local `master` was six commits behind.
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
- **Batch the push.** Every push to `master` that touches `sumilabu-dashboard/`
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
- Small work goes straight to `master`. Open a branch and a PR when you want
  Copilot's review first (as on 2026-09-15); a PR's branch pushes deploy
  nothing, only the merge does.
- Several sessions may have this repository open. Work in a worktree of your
  own (`git worktree add ../sumilabu-worktrees/<name> -b work/<name>`), run
  `pnpm install` inside it, and never share one between agents.

# Releasing to production

**Pushing to `master` is the release.** `.github/workflows/vercel-deploy.yml`
runs on every push to `master` that touches `sumilabu-dashboard/**` (and on
`workflow_dispatch`): `verify` (`pnpm check`, `pnpm build`) then `deploy`
(`vercel pull` → push schema → `vercel build --prod` → function sizes →
`vercel deploy --prebuilt --prod` → one smoke request → prune deployments). The Vercel
project has **no Git integration, on purpose**: a Git integration deploys
every push of every branch and every firmware commit, each one a deployment
against the shared daily cap, and keeps every one of them. Before 2026-09-22
there was no workflow either, and production was deployed by hand with
`vercel deploy --prod` from this folder; that is still the manual fallback,
below.

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

    gh run list --workflow vercel-deploy.yml --branch master --commit $(git rev-parse HEAD) --json databaseId -q '.[0].databaseId'
    gh run view <id> --json jobs -q '.jobs[] | select(.name=="deploy") | "\(.status) \(.conclusion)"'

When it reads `completed success`, load the site **once** — the workflow has
already made its one smoke request. There is no version number on the site
(`package.json` stays `0.1.0`); the live commit is the `headSha` of the last
successful run:

    gh run list --workflow vercel-deploy.yml --branch master --status success --limit 1 --json headSha,createdAt

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
that still exists. Then fix forward on `master`; a rollback is not a release.

**Deployments kept: the live one and the one before it, nothing older.** The
workflow's last step runs `scripts/prune-deployments.sh`, one URL per
`vercel remove … --safe`, and stops with a warning rather than an error when
only aliased deployments remain. Run `pnpm deploy:prune --dry-run` any time
to see the list, and `pnpm deploy:prune` after a manual deploy. **Never
`vercel remove sumilabu-dashboard`** (the project name) and never several URLs
in one call: both hung for ten minutes on 2026-09-15.

**Manual fallback**, from a machine with `vercel login` done and this folder
as the working directory (the project has no Root Directory setting, so the
directory the CLI runs in is the project root):

    pnpm check && pnpm dlx vercel@latest deploy --prod --archive=tgz && pnpm deploy:prune

Use it when GitHub is down, not to skip the gates.

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
