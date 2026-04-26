# SumiLabu Fleet Dashboard

Next.js + TypeScript + Prisma app for multi-device telemetry across SumiLabu projects.

This app is designed to be generic and shared: one Vercel app + one Neon DB can serve many projects.

## Stack

- Vercel-hosted Next.js app
- Neon Postgres
- Prisma ORM
- Device ingestion endpoint: `POST /api/device-stats`
- Daily telemetry email summary: `GET /api/cron/daily-summary`

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
- `EXPECTED_HEARTBEAT_SECONDS` (optional; default `300`)
- `RESEND_API_KEY` (Resend key; same email service/provider used by wazadb)
- `EMAIL_FROM` (verified Resend sender, e.g. `SumiLabu Telemetry <noreply@sumilabu.com>`)
- `TELEMETRY_SUMMARY_RECIPIENTS` (comma-separated email recipients)
- `CRON_SECRET` (secret used by Vercel Cron auth)
- `APP_BASE_URL` (public dashboard URL for email links)
- `SUMMARY_UTC_OFFSET_HOURS` (optional; default `-8` for permanent PST)

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
- `EXPECTED_HEARTBEAT_SECONDS` (optional)
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `TELEMETRY_SUMMARY_RECIPIENTS`
- `CRON_SECRET`
- `APP_BASE_URL`
- `SUMMARY_UTC_OFFSET_HOURS` (optional)

Dashboard project filtering:

- `/?project=inkyframe`
- `/?project=wanikami`

3. Deploy.

Recommended production hostnames:

- Dashboard UI: `https://app.sumilabu.com`
- Telemetry ingest: `https://api.sumilabu.com/api/device-stats`

If you want one Vercel project to serve both UI and ingest, point both hostnames at this same app.

## Daily telemetry email

This app uses Resend for email, matching the wazadb API email provider pattern (`RESEND_API_KEY` + `EMAIL_FROM`). Vercel Cron calls `/api/cron/daily-summary` once per day at `0 16 * * *` UTC, which is 08:00 permanent PST.

Setup checklist:

1. In Resend, verify the sender domain you want to use, such as `sumilabu.com`.
2. Create or reuse a Resend API key.
3. Add these Vercel env vars to this dashboard project:
	- `RESEND_API_KEY`
	- `EMAIL_FROM`
	- `TELEMETRY_SUMMARY_RECIPIENTS`
	- `CRON_SECRET`
	- `APP_BASE_URL`
	- `SUMMARY_UTC_OFFSET_HOURS=-8`
4. Redeploy so Vercel registers the cron from `vercel.json`.
5. Test manually by calling `GET /api/cron/daily-summary` with `Authorization: Bearer <CRON_SECRET>`.

The email is multi-project aware: it scans every `projectKey`, summarizes the last 24 hours, compares event volume to the previous 24 hours, and flags offline or heartbeat-gap-risk devices.

## Device config

On each device (`secrets.py` in firmware repo):

- `STATS_API_URL = "https://<your-vercel-domain>/api/device-stats"`
- `STATS_API_TOKEN = "<same token as INGEST_API_TOKEN>"`
- `STATS_PROJECT_KEY = "inkyframe"`
- `STATS_DEVICE_ID = "unique-device-name"`
- `STATS_INTERVAL_SECONDS = 300`
