# SumiLabu Fleet Dashboard

Next.js + TypeScript + Prisma app for telemetry across SumiLabu products.

This app is designed to be generic and shared: one Vercel app + one Neon DB can serve many product partitions. SumiLabu is the top-level monitoring hub; sibling projects choose a `project_key` such as `inkyframe` for SumiLabu Clock or `onibako` for Onibako.

## Stack

- Vercel-hosted Next.js app
- Neon Postgres
- Prisma ORM
- Canonical telemetry ingestion endpoint: `POST /api/v1/telemetry/events`
- Legacy device ingestion endpoint: `POST /api/device-stats`
- Compatibility app/server ingestion endpoint: `POST /api/app-telemetry`
- Machine-readable API contract: `GET /api/openapi` or `GET /api/openapi.json`

## Local setup

1. Create environment file:

```bash
cp env/.env.example .env.local
```

2. Fill values in `.env.local` (`env/.env.example` is the only tracked template):

- `DATABASE_URL` (Neon pooled URL)
- `DIRECT_URL` (Neon direct URL)
- `INGEST_API_TOKEN` (must match device token)
- `DEFAULT_PROJECT_KEY` (default product partition, e.g. `inkyframe`)
- `PROJECT_TOKENS_JSON` (optional per-project token map)
- `EXPECTED_HEARTBEAT_SECONDS`, `STALE_AFTER_SECONDS` (optional)
- `DASHBOARD_UTC_OFFSET_HOURS` (optional, default `-8`)
- `BOARD_TOKENS_JSON`, `SETTINGS_TOKENS_JSON` (the board; see below)

3. Push Prisma schema:

```bash
pnpm db:push
```

4. Run app:

```bash
pnpm dev
```

Open `http://localhost:6500` (Sumilabu's local port block is 6500–6599; override with `WEB_PORT`).

5. Before committing:

```bash
pnpm check
```

`AGENTS.md` beside this file is the full guide: setup, tests, conventions,
schema changes, and how a push becomes a production release.

## API contracts

Sibling projects should discover the current API contracts from:

- `GET /api/openapi`
- `GET /api/openapi.json`

The OpenAPI document is safe to share with consuming projects. It describes the JSON payloads, bearer-token auth, and the split between hardware device telemetry and generic app/server telemetry. Do not put secrets in the contract; pass tokens only through environment variables or deployment secret stores.

New sibling projects should treat the versioned endpoint as canonical:

- `POST /api/v1/telemetry/events`

The older endpoints stay online as compatibility adapters:

- `POST /api/device-stats` for already-deployed hardware/firmware devices.
- `POST /api/app-telemetry` for the short-lived pre-v1 generic app telemetry shape.

Versioning rule: keep `/api/v1/...` stable for existing consumers. If the contract needs a breaking change later, add `/api/v2/...` and leave v1 running.

Auth is shared across ingest endpoints:

- If `PROJECT_TOKENS_JSON` contains a token for the payload `project_key`, that token is required.
- Otherwise `INGEST_API_TOKEN` is used as the fallback.
- If neither token is configured, local/dev ingest is accepted without auth.

Example product token map shape:

```json
{"inkyframe":"device-product-token","onibako":"app-product-token"}
```

### Canonical v1 telemetry

`POST /api/v1/telemetry/events`

Use this endpoint for new SumiLabu sibling projects, including Onibako apps, servers, deployment scripts, jobs, and future producers. It is the preferred, guessable API contract.

Headers:

- `Authorization: Bearer <PROJECT_OR_FALLBACK_TOKEN>` (required if token is configured)
- `Content-Type: application/json`

Recommended body fields:

- `api_version` (`v1`, optional because the path is authoritative)
- `project_key` (product partition, e.g. `onibako`)
- `source_type` (`app` | `server` | `job` | `deploy` | `device` | `service`)
- `source_id` (stable producer identifier, e.g. `onibako`, `ds15`, `deploy-script`)
- `display_name`
- `environment`
- `host`
- `service`
- `event`
- `status`
- `severity`
- `message`
- `duration_ms`
- `metric_name`
- `metric_value`
- `metric_unit`
- `tags`
- `metrics`
- `server`
- `telemetry`
- `occurred_at` (optional ISO timestamp, Unix seconds, or Unix milliseconds)

Example without printing a real secret:

```bash
curl -sS https://app.sumilabu.com/api/v1/telemetry/events \
	-H "Authorization: Bearer $SUMILABU_INGEST_TOKEN" \
	-H "Content-Type: application/json" \
	-d '{
		"api_version": "v1",
		"project_key": "onibako",
		"source_type": "app",
		"source_id": "onibako",
		"display_name": "Onibako",
		"environment": "ds15",
		"host": "10.0.0.161",
		"service": "compose",
		"event": "deploy",
		"status": "ok",
		"severity": "info",
		"message": "Remote deploy completed",
		"duration_ms": 77000,
		"metric_name": "remote_deploy",
		"metric_value": 77,
		"metric_unit": "seconds",
		"tags": {},
		"metrics": {},
		"server": {},
		"telemetry": {}
	}'
```

### Legacy hardware/firmware telemetry

`POST /api/device-stats`

Existing SumiLabu Clock / InkyFrame firmware devices can keep using this endpoint. Do not break already-deployed devices just to move them to the canonical v1 contract.

Headers:

- `Authorization: Bearer <INGEST_API_TOKEN>` (required if token is configured)
- `Content-Type: application/json`

Body fields (from hardware/firmware devices):

- `event` (`boot` | `mode_change` | `refresh` | `heartbeat`)
- `project_key` (optional; defaults to `DEFAULT_PROJECT_KEY`)
- `device_id`
- `app_version`
- `mode`
- `ntp_ok`
- `bitmap_assets_ok`
- `mem_free`
- `mem_alloc`
- `uptime_s`
- `unix_ts`
- `wifi`
- `sync`

### Compatibility app/server telemetry

`POST /api/app-telemetry`

This endpoint is a compatibility adapter for the first generic app/server shape. New integrations should prefer `POST /api/v1/telemetry/events`.

Headers:

- `Authorization: Bearer <PROJECT_OR_FALLBACK_TOKEN>` (required if token is configured)
- `Content-Type: application/json`

Recommended body fields:

- `project_key` (product partition, e.g. `onibako`)
- `app_id` (stable app identifier, e.g. `onibako`)
- `display_name`
- `environment`
- `host`
- `service`
- `event`
- `status`
- `severity`
- `message`
- `duration_ms`
- `metric_name`
- `metric_value`
- `metric_unit`
- `tags`
- `metrics`
- `server`
- `telemetry`
- `occurred_at` (optional ISO timestamp, Unix seconds, or Unix milliseconds)

Example without printing a real secret:

```bash
curl -sS https://app.sumilabu.com/api/app-telemetry \
	-H "Authorization: Bearer $SUMILABU_INGEST_TOKEN" \
	-H "Content-Type: application/json" \
	-d '{
		"project_key": "onibako",
		"app_id": "onibako",
		"display_name": "Onibako",
		"environment": "ds15",
		"host": "10.0.0.161",
		"service": "compose",
		"event": "deploy",
		"status": "ok",
		"severity": "info",
		"message": "Remote deploy completed",
		"duration_ms": 77000,
		"metric_name": "remote_deploy",
		"metric_value": 77,
		"metric_unit": "seconds",
		"tags": {},
		"metrics": {},
		"server": {},
		"telemetry": {}
	}'
```

## Production

**A push to `master` that touches this folder is the release.**
`.github/workflows/vercel-deploy.yml` runs the gates (`pnpm check`,
`pnpm build`), pushes the schema to Neon, builds and deploys with the Vercel
CLI, makes one smoke request, and removes every deployment but the live one
and the one before it. The Vercel project (`sumilabu-dashboard`, team
`spxis-projects-0d6306b4`) has no Git integration on purpose — see
`AGENTS.md`, "Releasing to production", for the secrets it needs, how to
know a deploy landed, the daily cap, rollback and the manual fallback.

Environment, set in Vercel Project Settings (the database URLs as Sensitive):

- `DATABASE_URL`, `DIRECT_URL`
- `INGEST_API_TOKEN`, `PROJECT_TOKENS_JSON`, `DEFAULT_PROJECT_KEY`
- `BOARD_TOKENS_JSON`, `SETTINGS_TOKENS_JSON`
- `EXPECTED_HEARTBEAT_SECONDS` (optional, default `1800`)
- `STALE_AFTER_SECONDS` (optional, default `5400`)
- `DASHBOARD_UTC_OFFSET_HOURS` (optional, default `-8`)

A device that sends `heartbeat_interval_s` on `/api/device-stats` is judged
by it: a beat is expected at that interval, and the device is offline after
three missed, never sooner than `STALE_AFTER_SECONDS`. These two values are
the fallback for a device that reports no interval (InkyFrames flashed
before 2026-09-15, and any client that omits it).

Dashboard project filtering:

- `/?project=inkyframe`
- `/?project=wanikami`

Production hostnames, all aliases of the one deployment:

- Dashboard UI: `https://app.sumilabu.com`
- Canonical telemetry ingest: `https://api.sumilabu.com/api/v1/telemetry/events`
- Legacy firmware telemetry ingest: `https://api.sumilabu.com/api/device-stats`
- Compatibility app/server telemetry ingest: `https://api.sumilabu.com/api/app-telemetry`
- API contract: `https://api.sumilabu.com/api/openapi.json`
- Board, settings and reports: `https://api.sumilabu.com/api/v1/projects/…`
- Health: `https://api.sumilabu.com/api/v1/health`

## Device config

On each device (`secrets.py` in firmware repo):

- `STATS_API_URL = "https://<your-vercel-domain>/api/device-stats"`
- `STATS_API_TOKEN = "<same token as INGEST_API_TOKEN>"`
- `STATS_PROJECT_KEY = "inkyframe"`
- `STATS_DEVICE_ID = "unique-device-name"`
- `STATS_INTERVAL_SECONDS = 1800` (the firmware raises anything under 900 to 900)

## Board and settings API (v1)

One tickets board and one settings store for every site, scoped by
`projectKey`, enforcing `docs/board/BOARD_RULES.md` once. Auth is a per-project
token sent as `Authorization: Bearer <token>`, from one of two maps: the
ticket routes take `BOARD_TOKENS_JSON` (`{ "umakuma": "…", "itsutsu": "…" }`,
the key every agent's worktree holds) and the settings routes take
`SETTINGS_TOKENS_JSON` (same shape; only a site's production deployment holds
it, because a setting decides who may sign up). Neither accepts the other. A
project with no token has no board. Each site also has a `<key>-dev` project
(`umakuma-dev`, `itsutsu-dev`) with its own entry in both maps, so local and
test runs never touch the real rows. Every write also sends
`X-Board-Actor: <who>` - there is no anonymous move.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/v1/projects` | | any project's board token; `{ projects: ["itsutsu", "umakuma", …] }` — names only, no write access implied |
| GET | `/api/v1/projects/{key}/tickets` | `?status=open,inProgress`, `?unfinished=1`, or `?key=<slug>` alone | with `heldNow` computed; unfinished includes lapsed holds; `?key=` answers as `tickets/{id}` does |
| POST | `/api/v1/projects/{key}/tickets` | `{ title, detail?, area?, kind?, askedBy?, key? }` | 422 with `problems[]` on a cap; 409 `key_taken` |
| GET | `/api/v1/projects/{key}/tickets/{id}` | | |
| PATCH | `/api/v1/projects/{key}/tickets/{id}` | `{ status?, priority?, effort?, title?, detail?, area?, askedBy?, kind? }` | `status` is `open`, `inProgress` or `dropped`; words checked, then move (carrying the words), then grade; 422 on a cap, 409 `{ error: "illegal" \| "held" \| "done", heldBy }`; a body naming `key` is 400 `key_immutable` |
| POST | `/api/v1/projects/{key}/tickets/bulk` | `{ updates: [{ id, …same fields as PATCH }] }` (≤ 100) | each row independently, as its own PATCH; `{ results: [{ id, ok, ticket \| error }] }` — no rollback across rows |
| POST | `/api/v1/projects/{key}/tickets/{id}/ship` | `{ version, entryId?, releasedAt? }` | release tools only; from `open` or `inProgress` under the claim condition; writes `done` |
| POST | `/api/v1/projects/{key}/tickets/import` | `{ tickets: [row…] }` | one-time move of a client's board, ids and dates kept; upserts by id; 422 if an id already belongs to another project |
| POST | `/api/v1/projects/{key}/tickets/{id}/unship` | `{ reason }` | only for a stamp the client's main never saw |
| POST | `/api/v1/projects/{key}/tickets/{id}/stamp` | `{ version, entryId?, releasedAt }` | backfill only, for a row already `done` with no release recorded; never moves the row; 409 `notDone` off any other status, 409 `alreadyStamped` rather than overwrite a `releasedIn` that is already there; `releasedAt` is required, unlike `ship`'s |
| GET | `/api/v1/projects/{key}/settings` | | settings token; `{ settings: { key: value }, entries: [{ key, value, setBy, updatedAt }] }` |
| GET/PUT | `/api/v1/projects/{key}/settings/{key}` | `{ value }` | settings token; key `[a-z0-9_.-]{1,80}`, value ≤ 4000; returns `{ key, value, setBy, updatedAt }` |
| DELETE | `/api/v1/projects/{key}/settings/{key}` | | settings token; back to the client's default; `{ deleted }` says whether a row was there |

Statuses are canonical (`open`, `inProgress`, `done`, `dropped`); kinds
`feature`, `fix`, `chore`; priority `high`/`normal`/`low`; effort
`small`/`medium`/`large`, both null until graded. The lease is six hours.

## Reports API (v1)

A member's problem reports, from any site, under the same `projectKey`
scoping and enforcing `docs/board/REPORTS_CONTRACT.md`. Auth is a third
token map, `REPORTS_TOKENS_JSON` (same shape as the other two) - except
filing, which takes the board token instead, so a leaked reports key can
never create or move a board ticket. `<key>-dev` projects work the same way
as they do for the board.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/v1/projects/{key}/reports` | `?status=new,read`, `?limit=`, `?offset=` | reports token; newest first |
| POST | `/api/v1/projects/{key}/reports` | `{ body, path?, appVersion?, reporterRef, reporterName?, image? }` | reports token; `reporterRef` required (signed-out reporting); `image` is one optional screenshot, plain base64, JPEG/PNG/WebP by its bytes, at most 1 MiB; 422 with `problems[]` on a cap; 429 `rate_limited` with `scope`, `limit` (`reports` or `image_bytes`) and `retryAfterMs` |
| GET | `/api/v1/projects/{key}/reports/{id}` | | reports token; a report says `hasImage`, never the bytes |
| GET | `/api/v1/projects/{key}/reports/{id}/image` | | the project's reports **or** board token; the screenshot's bytes with its stored `Content-Type`, `Cache-Control: private, no-store`; 404 when there is none |
| PATCH | `/api/v1/projects/{key}/reports/{id}` | `{ status?, adminNote? }` | reports token; `status` is `read` or `closed` only - `filed` is not a legal value here; 409 off an illegal move |
| DELETE | `/api/v1/projects/{key}/reports/{id}` | | reports token; hard delete, for a spurious report |
| POST | `/api/v1/projects/{key}/reports/{id}/file` | `{ title?, detail?, kind? }` | **board token**, not the reports token; creates a `BoardTicket` and links it (`status = "filed"`, `filedTicketId`) in one transaction; 409 `not_fileable` off `filed`/`closed` |
| POST | `/api/v1/projects/{key}/reports/import` | `{ reports: [row…] }` | reports token; one-time move of a client's own reports table, ids and `createdAt` kept; upserts by id; 422 if an id already belongs to another project |
| GET | `/api/v1/health` | | any reports token; one `SELECT 1`; `Cache-Control: no-store`; see `REPORTS_CONTRACT.md` for the client-side caching/timeout a caller is expected to do |

