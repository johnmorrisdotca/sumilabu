# SumiLabu Fleet Dashboard

Next.js + TypeScript + Prisma app for telemetry across SumiLabu products.

This app is designed to be generic and shared: one Vercel app + one Neon DB can serve many product partitions. SumiLabu is the top-level monitoring hub; sibling projects choose a `project_key` such as `inkyframe` for SumiLabu Clock or `onibako` for Onibako.

## Stack

- Vercel-hosted Next.js app
- Neon Postgres
- Prisma ORM
- Device ingestion endpoint: `POST /api/device-stats`
- Generic app/server ingestion endpoint: `POST /api/app-telemetry`
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

Auth is shared across ingest endpoints:

- If `PROJECT_TOKENS_JSON` contains a token for the payload `project_key`, that token is required.
- Otherwise `INGEST_API_TOKEN` is used as the fallback.
- If neither token is configured, local/dev ingest is accepted without auth.

Example product token map shape:

```json
{"inkyframe":"device-product-token","onibako":"app-product-token"}
```

### Hardware/firmware telemetry

`POST /api/device-stats`

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

### Generic app/server telemetry

`POST /api/app-telemetry`

Use this endpoint for sibling products, backend services, deployments, jobs, health checks, and server-side app telemetry. It is separate from the microcontroller hardware stream used by SumiLabu Clock / InkyFrame.

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
- Telemetry ingest: `https://api.sumilabu.com/api/device-stats`
- App/server telemetry ingest: `https://api.sumilabu.com/api/app-telemetry`
- API contract: `https://api.sumilabu.com/api/openapi.json`

If you want one Vercel project to serve both UI and ingest, point both hostnames at this same app.

## Device config

On each device (`secrets.py` in firmware repo):

- `STATS_API_URL = "https://<your-vercel-domain>/api/device-stats"`
- `STATS_API_TOKEN = "<same token as INGEST_API_TOKEN>"`
- `STATS_PROJECT_KEY = "inkyframe"`
- `STATS_DEVICE_ID = "unique-device-name"`
- `STATS_INTERVAL_SECONDS = 300`
