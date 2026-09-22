#!/usr/bin/env bash
# Keep the live deployment and the one before it; remove everything older, and
# every ERROR/CANCELED one. Every deployment Vercel keeps counts against the
# team's Functions Storage and Deployment Storage (10 GB each, shared by every
# project), which is how the account reached 144 GB on 2026-09-15.
#
# One address per `vercel remove`, never a list and never the project name:
# both hung for ten minutes on 2026-09-15, one URL answers in about two seconds.
# `--safe` refuses a deployment a domain still points at, by exiting 1, so each
# call is guarded and the no-progress check below decides when to stop.
#
# Usage: bash scripts/prune-deployments.sh [--dry-run]
# Needs a logged-in Vercel CLI (or VERCEL_TOKEN) and jq.
set -euo pipefail

PROJECT="sumilabu-dashboard"
DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

if command -v vercel >/dev/null 2>&1; then
  VERCEL=(vercel)
else
  VERCEL=(pnpm dlx vercel@latest)
fi
# macOS bash 3.2 treats an empty array as unset under `set -u`; the `+` form is how it is expanded safely.
TOKEN_ARG=()
[ -n "${VERCEL_TOKEN:-}" ] && TOKEN_ARG=(--token="$VERCEL_TOKEN")

list() {
  "${VERCEL[@]}" list "$PROJECT" --json --limit 100 ${TOKEN_ARG[@]+"${TOKEN_ARG[@]}"} 2>/dev/null | sed -n '/^{/,$p'
}

previous=""
for round in $(seq 1 20); do
  json=$(list)
  building=$(echo "$json" | jq -r '.deployments[] | select(.state == "BUILDING" or .state == "QUEUED" or .state == "INITIALIZING") | .url')
  if [ -n "$building" ]; then
    echo "A deployment is still building; not removing anything: $building"
    exit 1
  fi
  urls=$(echo "$json" | jq -r '(.deployments | map(select(.state == "READY")) | .[2:][]), (.deployments[] | select(.state == "ERROR" or .state == "CANCELED")) | .url')
  if [ -z "$urls" ]; then
    echo "Only the live deployment and the one before it are kept (round $round)."
    exit 0
  fi
  if [ "$urls" = "$previous" ]; then
    echo "WARNING: only aliased deployments remain, left in place: $(echo $urls)"
    exit 0
  fi
  for url in $urls; do
    if $DRY_RUN; then
      echo "would remove $url"
    else
      "${VERCEL[@]}" remove "$url" --safe --yes ${TOKEN_ARG[@]+"${TOKEN_ARG[@]}"} || echo "Kept $url: a domain still points at it."
    fi
  done
  $DRY_RUN && exit 0
  previous="$urls"
done
echo "ERROR: superseded deployments were still listed after 20 rounds."
exit 1
