# Onibako Telemetry Handoff

Purpose: machine-readable handoff for integrating Onibako with the SumiLabu telemetry dashboard.

## Canonical API

Use this endpoint for all new Onibako telemetry:

- Method: `POST`
- Path: `/api/v1/telemetry/events`
- Production URL: `https://app.sumilabu.com/api/v1/telemetry/events`
- Alternate API-host URL if configured: `https://api.sumilabu.com/api/v1/telemetry/events`
- Contract version: `v1`

Do not use `/api/device-stats` for Onibako. That endpoint remains online only for existing SumiLabu Clock / InkyFrame firmware devices.

`/api/app-telemetry` exists as a compatibility adapter, but new consumers should use `/api/v1/telemetry/events`.

## Dashboard

Onibako dashboard view:

- `https://app.sumilabu.com/?project=onibako`

Expected initial state:

- Product filter for `onibako` may be visible after first telemetry ingest.
- App/server telemetry sections may be empty until Onibako posts an event.
- Hardware device sections are separate and may remain empty for Onibako.

## OpenAPI Discovery

Fetch the contract before integrating or generating clients:

- `GET https://app.sumilabu.com/api/openapi.json`
- `GET https://app.sumilabu.com/api/openapi`
- Alternate API host: `GET https://api.sumilabu.com/api/openapi.json`

The OpenAPI document is the source of truth for request/response shape.

## Auth

Auth strategy: bearer token.

Header:

```http
Authorization: Bearer <token>
Content-Type: application/json
```

Onibako should read the token from environment only.

Recommended Onibako env vars:

```env
SUMILABU_TELEMETRY_URL="https://app.sumilabu.com/api/v1/telemetry/events"
SUMILABU_INGEST_TOKEN="replace-with-secret-from-deployment-env"
SUMILABU_PROJECT_KEY="onibako"
```

Rules:

- Do not commit real tokens.
- Do not print tokens.
- Do not include tokens in telemetry payloads.
- If `PROJECT_TOKENS_JSON` on SumiLabu contains `onibako`, that per-project token is required.
- Otherwise SumiLabu falls back to `INGEST_API_TOKEN`.

## Canonical Payload

Required fields:

- `source_type`
- `source_id`
- `event`

Recommended fields for Onibako:

```json
{
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
}
```

Field meanings:

| Field | Meaning |
| --- | --- |
| `api_version` | Optional explicit version. Use `v1`. Path version is authoritative. |
| `project_key` | Product partition. Use `onibako`. |
| `source_type` | Producer class: `app`, `server`, `job`, `deploy`, `device`, or `service`. |
| `source_id` | Stable producer id, e.g. `onibako`, `ds15`, `deploy-script`, `compose`. |
| `display_name` | Human-readable product/source name. |
| `environment` | Runtime/deploy environment, e.g. `ds15`, `prod`, `staging`. |
| `host` | Hostname or IP, if available. |
| `service` | Subsystem, service, container group, script, or job name. |
| `event` | Short event name: `deploy_start`, `deploy`, `deploy_failed`, `health_check`, `job_complete`. |
| `status` | Short status: `ok`, `failed`, `warning`, `degraded`. |
| `severity` | Severity: `info`, `warn`, `error`, `critical`. |
| `message` | Human summary. No secrets. |
| `duration_ms` | Duration in milliseconds, if known. |
| `metric_name` | Primary metric name for simple events. |
| `metric_value` | Primary metric value. |
| `metric_unit` | Unit for metric value: `seconds`, `ms`, `count`, `bytes`, etc. |
| `tags` | Flat or nested JSON object for labels. No secrets. |
| `metrics` | Structured metrics object. No secrets. |
| `server` | Server/runtime context. No secrets. |
| `telemetry` | Product-specific structured telemetry. No secrets. |
| `occurred_at` | Optional ISO timestamp, Unix seconds, or Unix milliseconds. |

## Suggested Events

Emit at least these Onibako events:

1. `deploy_start`
   - `source_type`: `deploy`
   - `source_id`: `deploy-script` or host-specific id
   - `status`: `ok`
   - `severity`: `info`

2. `deploy`
   - completion event
   - `status`: `ok`
   - include `duration_ms`
   - include deploy metadata in `telemetry`

3. `deploy_failed`
   - `status`: `failed`
   - `severity`: `error`
   - include safe failure context in `message` and `telemetry`

4. `health_check`
   - `source_type`: `service`
   - `source_id`: service name or `onibako`
   - `status`: `ok`, `degraded`, or `failed`

5. `job_complete` / `job_failed`
   - `source_type`: `job`
   - include duration and job metrics

## Client Behavior Requirements

Onibako telemetry helper should:

- Default endpoint to `https://app.sumilabu.com/api/v1/telemetry/events`.
- Allow endpoint override via `SUMILABU_TELEMETRY_URL`.
- Read token from `SUMILABU_INGEST_TOKEN`.
- Add `Authorization` only when token exists.
- Send JSON with `Content-Type: application/json`.
- Use short timeout.
- Use limited retry/backoff if appropriate.
- Never block deploy/app success if telemetry fails.
- Never throw uncaught telemetry errors from deploy hooks.
- Log telemetry failures without secrets.
- Never send secrets in `message`, `tags`, `metrics`, `server`, or `telemetry`.

## Manual Test

Run from Onibako environment with token set:

```bash
curl -sS "${SUMILABU_TELEMETRY_URL:-https://app.sumilabu.com/api/v1/telemetry/events}" \
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
    "event": "telemetry_test",
    "status": "ok",
    "severity": "info",
    "message": "Onibako telemetry integration test",
    "metric_name": "integration_test",
    "metric_value": 1,
    "metric_unit": "count",
    "tags": {},
    "metrics": {},
    "server": {},
    "telemetry": {}
  }'
```

Expected response:

```json
{
  "ok": true,
  "api_version": "v1",
  "projectKey": "onibako",
  "sourceType": "app",
  "sourceId": "onibako",
  "environment": "ds15"
}
```

Then check:

- `https://app.sumilabu.com/?project=onibako`

## SumiLabu Implementation Notes

Current SumiLabu files of interest:

- `sumilabu-dashboard/src/app/api/v1/telemetry/events/route.ts` — canonical v1 ingest route.
- `sumilabu-dashboard/src/lib/app-telemetry-ingest.ts` — shared v1 validation and persistence.
- `sumilabu-dashboard/src/app/api/openapi/route.ts` — OpenAPI contract.
- `sumilabu-dashboard/src/app/api/device-stats/route.ts` — legacy firmware route; do not target for Onibako.
- `sumilabu-dashboard/prisma/schema.prisma` — `AppTelemetrySource` and `AppTelemetryEvent` storage.

## Non-Goals

- Do not migrate SumiLabu Clock firmware as part of Onibako integration.
- Do not send Onibako telemetry to `/api/device-stats`.
- Do not expose secrets in docs, logs, payloads, or generated clients.
