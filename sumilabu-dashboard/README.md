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

2. Fill values in `.env.local`:

- `DATABASE_URL` (Neon pooled URL)
- `DIRECT_URL` (Neon direct URL)
- `INGEST_API_TOKEN` (must match device token)
- `DEFAULT_PROJECT_KEY` (default product partition, e.g. `inkyframe`)
- `PROJECT_TOKENS_JSON` (optional per-project token map)
- `STALE_AFTER_SECONDS` (optional)

3. Push Prisma schema:

```bash
pnpm db:push
```

4. Run app:

```bash
pnpm dev
```

Open `http://localhost:3000`.

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

## Vercel deployment

1. Import this folder as a Vercel project.
2. Set env vars in Vercel Project Settings:

- `DATABASE_URL`
- `DIRECT_URL`
- `INGEST_API_TOKEN`
- `DEFAULT_PROJECT_KEY`
- `PROJECT_TOKENS_JSON`
- `STALE_AFTER_SECONDS` (optional)

Dashboard project filtering:

- `/?project=inkyframe`
- `/?project=wanikami`

3. Deploy.

Recommended production hostnames:

- Dashboard UI: `https://app.sumilabu.com`
- Canonical telemetry ingest: `https://api.sumilabu.com/api/v1/telemetry/events`
- Legacy firmware telemetry ingest: `https://api.sumilabu.com/api/device-stats`
- Compatibility app/server telemetry ingest: `https://api.sumilabu.com/api/app-telemetry`
- API contract: `https://api.sumilabu.com/api/openapi.json`

If you want one Vercel project to serve both UI and ingest, point both hostnames at this same app.

## Device config

On each device (`secrets.py` in firmware repo):

- `STATS_API_URL = "https://<your-vercel-domain>/api/device-stats"`
- `STATS_API_TOKEN = "<same token as INGEST_API_TOKEN>"`
- `STATS_PROJECT_KEY = "inkyframe"`
- `STATS_DEVICE_ID = "unique-device-name"`
- `STATS_INTERVAL_SECONDS = 300`
