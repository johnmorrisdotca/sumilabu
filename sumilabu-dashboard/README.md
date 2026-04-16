# SumiLabu Fleet Dashboard

Next.js + TypeScript + Prisma app for multi-device telemetry across SumiLabu projects.

This app is designed to be generic and shared: one Vercel app + one Neon DB can serve many projects.

## Stack

- Vercel-hosted Next.js app
- Neon Postgres
- Prisma ORM
- Device ingestion endpoint: `POST /api/device-stats`

## Local setup

1. Create environment file:

```bash
cp env/.env.example .env.local
```

2. Fill values in `.env.local`:

- `DATABASE_URL` (Neon pooled URL)
- `DIRECT_URL` (Neon direct URL)
- `INGEST_API_TOKEN` (must match device token)
- `DEFAULT_PROJECT_KEY` (default project partition, e.g. `inkyframe`)
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

## API contract

`POST /api/device-stats`

Headers:

- `Authorization: Bearer <INGEST_API_TOKEN>` (required if token is configured)
- `Content-Type: application/json`

Body fields (from device firmware/apps):

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

## Device config

On each device (`secrets.py` in firmware repo):

- `STATS_API_URL = "https://<your-vercel-domain>/api/device-stats"`
- `STATS_API_TOKEN = "<same token as INGEST_API_TOKEN>"`
- `STATS_DEVICE_ID = "unique-device-name"`
- `STATS_INTERVAL_SECONDS = 300`
