#!/usr/bin/env bash
# John's one command for the Google sign-in on app.sumilabu.com (SUMILABU-7).
#
#   pnpm auth:setup <client_secret_….json> [--delete-source]
#
# Reads the Web OAuth client that the Google Cloud console downloaded (never
# printed), keeps its id and secret in the keychain items
# "sumilabu GOOGLE_CLIENT_ID" and "sumilabu GOOGLE_CLIENT_SECRET", keeps a
# session key in "sumilabu AUTH_SECRET" (made once; reused when it is already
# there, so running this again signs nobody out), and adds to the Vercel
# project's production environment:
#
#   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET, SUMILABU_ADMIN_EMAILS
#   (Sensitive) and NEXTAUTH_URL=https://app.sumilabu.com (plain).
#
# Every value goes to `security -i` and `vercel env add` on standard input,
# never in a command line (`ps`), the output or a file. The new values reach
# the site at the next deploy (the next push to main).
#
# Environment: SUMILABU_ADMIN_EMAILS (default John's two addresses),
# SUMILABU_VERCEL_PROJECT, SUMILABU_VERCEL_SCOPE.
set -euo pipefail

say() { printf 'auth-setup: %s\n' "$*"; }
die() { printf 'auth-setup: %s\n' "$*" >&2; exit 2; }

source_file=""
delete_source=0
for arg in "$@"; do
  case "$arg" in
    --delete-source) delete_source=1 ;;
    -*) die "unknown option $arg" ;;
    *) [ -z "$source_file" ] || die "one client_secret file, please"; source_file="$arg" ;;
  esac
done
[ -n "$source_file" ] || die "usage: pnpm auth:setup <client_secret_….json> [--delete-source]"
[ -f "$source_file" ] || die "no file at $source_file"

project="${SUMILABU_VERCEL_PROJECT:-sumilabu-dashboard}"
scope="${SUMILABU_VERCEL_SCOPE:-spxis-projects-0d6306b4}"
admins="${SUMILABU_ADMIN_EMAILS:-john@spxis.com,john@johnmorris.ca}"
pages="https://app.sumilabu.com"
callback="$pages/api/auth/callback/google"

# plutil reads JSON on every Mac; a Desktop client ("installed") is the wrong kind.
client_id="$(plutil -extract web.client_id raw -o - "$source_file" 2>/dev/null || true)"
client_secret="$(plutil -extract web.client_secret raw -o - "$source_file" 2>/dev/null || true)"
[ -n "$client_id" ] && [ -n "$client_secret" ] || die "that file is not a Web application client (no web.client_id and web.client_secret)"
# Checked shapes, so neither value can carry a quote or a space into the keychain command below.
[[ "$client_id" =~ ^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$ ]] || die "the client id does not look like Google's"
[[ "$client_secret" =~ ^[A-Za-z0-9_-]{10,100}$ ]] || die "the client secret does not look like Google's"
listed=0
for i in 0 1 2 3 4 5 6 7 8 9; do
  [ "$(plutil -extract "web.redirect_uris.$i" raw -o - "$source_file" 2>/dev/null || true)" = "$callback" ] && listed=1
done
[ "$listed" = 1 ] || say "warning: the downloaded client does not list $callback as a redirect URI; add it in the console or the sign-in will fail"
[[ "$admins" =~ ^[A-Za-z0-9._%+@,-]+$ ]] || die "SUMILABU_ADMIN_EMAILS must be a comma list of addresses"

keep() { # keep <item> <value>: into the keychain through `security -i` on stdin, then checked without reading it back
  printf 'add-generic-password -U -a "%s" -s "%s" -w "%s"\n' "$USER" "$1" "$2" | security -i >/dev/null 2>&1 || true
  security find-generic-password -s "$1" >/dev/null 2>&1 || die "could not keep \"$1\" in the keychain"
}
keep "sumilabu GOOGLE_CLIENT_ID" "$client_id"
keep "sumilabu GOOGLE_CLIENT_SECRET" "$client_secret"

auth_secret="$(security find-generic-password -s "sumilabu AUTH_SECRET" -w 2>/dev/null || true)"
if [[ "$auth_secret" =~ ^[0-9a-f]{64}$ ]]; then
  say "AUTH_SECRET: using the one already in the keychain"
else
  auth_secret="$(openssl rand -hex 32)"
  keep "sumilabu AUTH_SECRET" "$auth_secret"
  say "AUTH_SECRET: made a new one and kept it in the keychain"
fi

add() { # add <name> <sensitive|plain> <value>: onto Vercel production, the value on stdin
  local kind="--sensitive"
  [ "$2" = plain ] && kind="--no-sensitive"
  printf '%s' "$3" | vercel env add "$1" production "$kind" --force --project "$project" --scope "$scope" >/dev/null
  say "added $1 to $project production"
}
add GOOGLE_CLIENT_ID sensitive "$client_id"
add GOOGLE_CLIENT_SECRET sensitive "$client_secret"
add AUTH_SECRET sensitive "$auth_secret"
add SUMILABU_ADMIN_EMAILS sensitive "$admins"
add NEXTAUTH_URL plain "$pages"

if [ "$delete_source" = 1 ]; then
  rm -f "$source_file"
  say "deleted $source_file"
fi
say "done: keychain items sumilabu GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET; Vercel production has all five. They take effect at the next deploy."
