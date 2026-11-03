#!/usr/bin/env bash
# Send the package scorecard collector's latest run to app.sumilabu.com/packages.
#
#   pnpm scorecard:upload [file]
#
# The file is the collector's latest.json (default
# ~/Projects/backups/package-scorecard/latest.json). It is POSTed to
# /api/v1/scorecard, which checks it against the contract and clears the page's
# cache, so the new run shows with no deploy.
#
# The key is read from the macOS keychain item "sumilabu SCORECARD_TOKEN"
# (or $SCORECARD_TOKEN) and goes to curl on standard input as a header file, so
# it is never in the command line (`ps`), the output or a file.
#
# Environment: SCORECARD_FILE, SCORECARD_URL (https, or http on localhost for a
# dev server), SCORECARD_KEYCHAIN_ITEM.
set -euo pipefail

file="${1:-${SCORECARD_FILE:-$HOME/Projects/backups/package-scorecard/latest.json}}"
url="${SCORECARD_URL:-https://app.sumilabu.com/api/v1/scorecard}"
item="${SCORECARD_KEYCHAIN_ITEM:-sumilabu SCORECARD_TOKEN}"
limit=1048576 # the route's MAX_BODY_BYTES

if [ ! -f "$file" ]; then
  echo "scorecard-upload: no file at $file (has the collector run?)" >&2
  exit 2
fi
case "$url" in
  https://*|http://localhost:*|http://127.0.0.1:*) ;;
  *) echo "scorecard-upload: refusing to send the key to $url (https, or http on localhost only)" >&2; exit 2 ;;
esac
size="$(wc -c < "$file" | tr -d ' ')"
if [ "$size" -gt "$limit" ]; then
  echo "scorecard-upload: $file is $size bytes; the site accepts at most $limit" >&2
  exit 2
fi

token="${SCORECARD_TOKEN:-}"
if [ -z "$token" ]; then
  token="$(security find-generic-password -s "$item" -w 2>/dev/null || true)"
fi
if [ -z "$token" ]; then
  echo "scorecard-upload: no key. Set \$SCORECARD_TOKEN or the keychain item \"$item\" (see docs/scorecard.md)." >&2
  exit 2
fi

reply="$(mktemp)"
trap 'rm -f "$reply"' EXIT
code="$(printf 'Authorization: Bearer %s\n' "$token" | curl -sS --max-time 60 -o "$reply" -w '%{http_code}' \
  -X POST -H @- -H 'Content-Type: application/json' --data-binary @"$file" "$url")" || {
  echo "scorecard-upload: could not reach $url" >&2
  exit 1
}
unset token

echo "scorecard-upload: $code $(cat "$reply")"
[ "$code" = "200" ]
