#!/usr/bin/env bash
# The end-to-end run of the page gate and the Google sign-in (SUMILABU-7), on
# this Mac only: a throwaway Postgres in Docker, a fake Google
# (fake-google.mjs), `next dev`, then check.mjs (HTTP checks and a headless
# Chrome that signs in and takes the pictures). Nothing reaches Google, Vercel
# or Neon; every secret is made fresh for the run and thrown away.
#
#   bash scripts/auth-e2e/run.sh [<folder for the pictures>]
#
# Ports come from Sumilabu's block (6500-6599); override with
# E2E_WEB_PORT, E2E_PG_PORT, E2E_GOOGLE_PORT, E2E_CHROME_PORT. Stop any
# `pnpm dev` in this folder first, and run the build gate before, not during.
# Everything it starts is stopped by its own PID or container name at the end.
set -euo pipefail

cd "$(dirname "$0")/../.."
SHOTS="${1:-${TMPDIR:-/tmp}/sumilabu-auth-e2e}"
WEB_PORT="${E2E_WEB_PORT:-6510}"
PG_PORT="${E2E_PG_PORT:-6550}"
GOOGLE_PORT="${E2E_GOOGLE_PORT:-6551}"
CHROME_PORT="${E2E_CHROME_PORT:-6552}"
PROD_PORT="${E2E_PROD_PORT:-6512}"
CHROME="${E2E_CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PG_NAME="sumilabu-auth-e2e-pg"

for port in "$WEB_PORT" "$PG_PORT" "$GOOGLE_PORT" "$CHROME_PORT" "$PROD_PORT"; do
  if lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "port $port is in use; set E2E_*_PORT to free ones in 6500-6599" >&2
    exit 1
  fi
done
if docker ps -a --format '{{.Names}}' | grep -qx "$PG_NAME"; then
  echo "a container named $PG_NAME already exists; another run may be going" >&2
  exit 1
fi

GOOGLE_PID=""
WEB_PID=""
PROD_PID=""
cleanup() {
  [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null || true
  [ -n "$PROD_PID" ] && kill "$PROD_PID" 2>/dev/null || true
  [ -n "$GOOGLE_PID" ] && kill "$GOOGLE_PID" 2>/dev/null || true
  docker rm -f "$PG_NAME" >/dev/null 2>&1 || true
  rm -rf "$SHOTS/.chrome-profile"
}
trap cleanup EXIT

rand() { openssl rand -hex "$1"; }
PG_PASSWORD="$(rand 12)"
DB_URL="postgresql://postgres:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/sumilabu"
BASE="http://localhost:${WEB_PORT}"
CLIENT_ID="e2e-client.apps.googleusercontent.com"
CLIENT_SECRET="$(rand 16)"
BOARD_TOKEN="$(rand 16)"
INGEST_TOKEN="$(rand 16)"
SCORECARD_TOKEN="$(rand 16)"
AUTH_SECRET="$(rand 32)"

mkdir -p "$SHOTS"
echo "== Postgres on 127.0.0.1:$PG_PORT (every statement logged, for the no-database check)"
docker run -d --name "$PG_NAME" -e POSTGRES_PASSWORD="$PG_PASSWORD" -e POSTGRES_DB=sumilabu \
  -p "127.0.0.1:${PG_PORT}:5432" postgres:17-alpine -c log_statement=all >/dev/null
for _ in $(seq 1 60); do
  docker exec "$PG_NAME" pg_isready -U postgres -d sumilabu >/dev/null 2>&1 && break
  sleep 1
done
DATABASE_URL="$DB_URL" DIRECT_URL="$DB_URL" pnpm exec prisma db push --skip-generate >/dev/null

echo "== fake Google on 127.0.0.1:$GOOGLE_PORT"
node scripts/auth-e2e/fake-google.mjs "$GOOGLE_PORT" "$CLIENT_ID" "$CLIENT_SECRET" "$BASE/api/auth/callback/google" >"$SHOTS.fake-google.log" 2>&1 &
GOOGLE_PID=$!

echo "== next dev on $BASE"
env -u VERCEL \
  NODE_ENV=development \
  DATABASE_URL="$DB_URL" DIRECT_URL="$DB_URL" \
  AUTH_SECRET="$AUTH_SECRET" \
  GOOGLE_CLIENT_ID="$CLIENT_ID" GOOGLE_CLIENT_SECRET="$CLIENT_SECRET" \
  SUMILABU_ADMIN_EMAILS="john@spxis.com,john@johnmorris.ca" \
  NEXTAUTH_URL="$BASE" \
  SUMILABU_GOOGLE_TEST_ISSUER="http://127.0.0.1:${GOOGLE_PORT}" \
  INGEST_API_TOKEN="$INGEST_TOKEN" SCORECARD_TOKEN="$SCORECARD_TOKEN" \
  BOARD_TOKENS_JSON="{\"itsutsu-dev\":\"$BOARD_TOKEN\"}" \
  ./node_modules/.bin/next dev -p "$WEB_PORT" >"$SHOTS.next-dev.log" 2>&1 &
WEB_PID=$!
for _ in $(seq 1 90); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/signin" || true)" = "200" ] && break
  sleep 2
done

echo "== seed: one device and one scorecard run, through the API with their tokens"
curl -sf -o /dev/null -X POST "$BASE/api/device-stats" -H "Authorization: Bearer $INGEST_TOKEN" -H 'Content-Type: application/json' \
  -d '{"project_key":"e2e-secret-project","event":"heartbeat","device_id":"e2e-secret-device-7","app_version":"1.0.0","mode":"clock"}'
curl -sf -o /dev/null -X POST "$BASE/api/v1/scorecard" -H "Authorization: Bearer $SCORECARD_TOKEN" -H 'Content-Type: application/json' \
  --data-binary @src/lib/scorecard/fixtures/sample.json

echo "== checks against next dev, with the fake Google"
DEV_RESULT=0
E2E_BASE="$BASE" E2E_GOOGLE="http://127.0.0.1:${GOOGLE_PORT}" E2E_PG_CONTAINER="$PG_NAME" E2E_SHOTS="$SHOTS" \
  E2E_BOARD_TOKEN="$BOARD_TOKEN" E2E_CHROME="$CHROME" E2E_CHROME_PORT="$CHROME_PORT" \
  node scripts/auth-e2e/check.mjs || DEV_RESULT=$?

# The dev server must be gone before a build in the same folder (AGENTS.md).
kill "$WEB_PID" 2>/dev/null || true
for _ in $(seq 1 30); do lsof -iTCP:"$WEB_PORT" -sTCP:LISTEN >/dev/null 2>&1 || break; sleep 1; done
WEB_PID=""

echo "== production build, then next start on localhost:$PROD_PORT"
DATABASE_URL="$DB_URL" DIRECT_URL="$DB_URL" pnpm build >"$SHOTS.build.log" 2>&1
PROD_BASE="http://localhost:${PROD_PORT}"
env -u VERCEL \
  DATABASE_URL="$DB_URL" DIRECT_URL="$DB_URL" \
  AUTH_SECRET="$AUTH_SECRET" \
  GOOGLE_CLIENT_ID="$CLIENT_ID" GOOGLE_CLIENT_SECRET="$CLIENT_SECRET" \
  SUMILABU_ADMIN_EMAILS="john@spxis.com,john@johnmorris.ca" \
  NEXTAUTH_URL="$PROD_BASE" \
  BOARD_TOKENS_JSON="{\"itsutsu-dev\":\"$BOARD_TOKEN\"}" \
  ./node_modules/.bin/next start -p "$PROD_PORT" >"$SHOTS.next-start.log" 2>&1 &
PROD_PID=$!
for _ in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$PROD_BASE/signin" || true)" = "200" ] && break
  sleep 1
done
PROD_RESULT=0
E2E_PROD_BASE="$PROD_BASE" E2E_AUTH_SECRET="$AUTH_SECRET" E2E_BOARD_TOKEN="$BOARD_TOKEN" E2E_PG_CONTAINER="$PG_NAME" \
  node scripts/auth-e2e/prod-checks.mjs || PROD_RESULT=$?

[ "$DEV_RESULT" = 0 ] && [ "$PROD_RESULT" = 0 ]
