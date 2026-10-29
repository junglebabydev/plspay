#!/usr/bin/env bash
# LOCAL DEV ONLY. Creates or updates three logins in the running docker compose backend:
#   - a PocketBase superuser, for the admin UI (http://localhost:<BACKEND_PORT>/_/)
#   - two organisers (A and B), for signing in to the app and checking that each one
#     sees only their own collections
# Passwords are random and saved in ./.env.seed (gitignored). They are never printed.
# (Not .env.local: Next.js loads that file, and this script rewrites its file on every run.)
# Safe to re-run: the passwords already in .env.seed are reused.
# (Production: create the superuser from the Coolify terminal instead, see README.)
#
# Usage: docker compose up -d --build && ./scripts/dev-seed.sh
# Optional: DEV_SUPERUSER_EMAIL / DEV_USER_A_EMAIL / DEV_USER_B_EMAIL to choose the emails.
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=.env.seed

die() { echo "dev-seed: $*" >&2; exit 1; }

# KEY's value in .env.seed, or "" (the file is read, never sourced).
read_var() { if [ -f "$ENV_FILE" ]; then sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1; fi; }

SUPERUSER_EMAIL="${DEV_SUPERUSER_EMAIL:-$(read_var DEV_SUPERUSER_EMAIL)}"
SUPERUSER_EMAIL="${SUPERUSER_EMAIL:-admin@example.com}"
SUPERUSER_PASSWORD="$(read_var DEV_SUPERUSER_PASSWORD)"
SUPERUSER_PASSWORD="${SUPERUSER_PASSWORD:-$(openssl rand -hex 16)}"
USER_A_EMAIL="${DEV_USER_A_EMAIL:-$(read_var DEV_USER_A_EMAIL)}"
USER_A_EMAIL="${USER_A_EMAIL:-organiser-a@example.com}"
USER_A_PASSWORD="$(read_var DEV_USER_A_PASSWORD)"
USER_A_PASSWORD="${USER_A_PASSWORD:-$(openssl rand -hex 16)}"
USER_B_EMAIL="${DEV_USER_B_EMAIL:-$(read_var DEV_USER_B_EMAIL)}"
USER_B_EMAIL="${USER_B_EMAIL:-organiser-b@example.com}"
USER_B_PASSWORD="$(read_var DEV_USER_B_PASSWORD)"
USER_B_PASSWORD="${USER_B_PASSWORD:-$(openssl rand -hex 16)}"

# The backend's host address, whatever BACKEND_PORT the stack was started with.
addr="$(docker compose port backend 8090 2>/dev/null || true)"
[ -n "$addr" ] || die "the backend is not running. Start it first: docker compose up -d --build"
PB="http://$addr"

echo "Waiting for PocketBase at $PB ..."
for i in $(seq 1 60); do
  curl -fsS -o /dev/null "$PB/api/health" 2>/dev/null && break
  [ "$i" -lt 60 ] || die "PocketBase did not become healthy. Check: docker compose logs backend"
  sleep 1
done

# Save the logins first, so a failure below never loses them.
(
  umask 077
  cat >"$ENV_FILE" <<EOF
# Local dev logins, managed by scripts/dev-seed.sh (rewritten on every run).
# Gitignored. Only valid for the local docker compose backend, never for production.
DEV_SUPERUSER_EMAIL=$SUPERUSER_EMAIL
DEV_SUPERUSER_PASSWORD=$SUPERUSER_PASSWORD
DEV_USER_A_EMAIL=$USER_A_EMAIL
DEV_USER_A_PASSWORD=$USER_A_PASSWORD
DEV_USER_B_EMAIL=$USER_B_EMAIL
DEV_USER_B_PASSWORD=$USER_B_PASSWORD
EOF
)

# 1. Superuser, with the same CLI command as production. The password reaches the
#    container through env (-e NAME copies it from this shell), not this host's argv.
#    Its output (PocketBase's startup log lines) is only shown if it fails.
if ! out="$(PB_SEED_EMAIL="$SUPERUSER_EMAIL" PB_SEED_PASSWORD="$SUPERUSER_PASSWORD" \
  docker compose exec -T -e PB_SEED_EMAIL -e PB_SEED_PASSWORD backend \
  sh -c '/pb/pocketbase superuser upsert "$PB_SEED_EMAIL" "$PB_SEED_PASSWORD"' 2>&1)"; then
  printf '%s\n' "$out" >&2
  die "superuser upsert failed"
fi

# pb METHOD PATH [JSON] [extra curl args]: calls the local PocketBase API and prints the
# response body. The JSON body goes through stdin, so passwords never show up in `ps`.
TOKEN=""
pb() {
  local method="$1" path="$2" body="${3:-}" out code attempt
  shift 2
  [ $# -gt 0 ] && shift
  local args=(-sS -X "$method" -w '\n%{http_code}')
  [ -n "$TOKEN" ] && args+=(-H "Authorization: $TOKEN")
  [ -n "$body" ] && args+=(-H "Content-Type: application/json" --data-binary @-)
  for attempt in 1 2 3; do
    out="$(curl "${args[@]}" "$@" "$PB$path" <<<"$body")" || die "can't reach $PB"
    code="${out##*$'\n'}"
    out="${out%$'\n'*}"
    [ "$code" = 429 ] || break
    sleep 3 # PocketBase's rate limiter allows 2 auth requests per 3s per IP
  done
  [ "$code" -lt 400 ] || die "$method $path failed with HTTP $code: $out"
  printf '%s\n' "$out"
}

# 2. Log in as the superuser (regular users have no CLI command).
TOKEN="$(pb POST /api/collections/_superusers/auth-with-password \
  "$(printf '{"identity":"%s","password":"%s"}' "$SUPERUSER_EMAIL" "$SUPERUSER_PASSWORD")" \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
[ -n "$TOKEN" ] || die "superuser login failed"

# 3. Create a test user, or reset its password to the one in .env.seed
#    (a reset logs that user out of open sessions). Prints "created" or "updated".
upsert_user() {
  local email="$1" password="$2" user_json user_id
  user_json="$(printf '{"email":"%s","password":"%s","passwordConfirm":"%s","verified":true}' \
    "$email" "$password" "$password")"
  user_id="$(pb GET /api/collections/users/records "" -G \
    --data-urlencode "filter=email='$email'" --data-urlencode "fields=id" \
    | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
  if [ -n "$user_id" ]; then
    pb PATCH "/api/collections/users/records/$user_id" "$user_json" >/dev/null
    echo "updated"
  else
    pb POST /api/collections/users/records "$user_json" >/dev/null
    echo "created"
  fi
}
user_a_action="$(upsert_user "$USER_A_EMAIL" "$USER_A_PASSWORD")"
user_b_action="$(upsert_user "$USER_B_EMAIL" "$USER_B_PASSWORD")"

echo
echo "Local logins ready (passwords are in ./$ENV_FILE, not printed):"
echo "  PocketBase admin  http://${addr/127.0.0.1/localhost}/_/   $SUPERUSER_EMAIL  (DEV_SUPERUSER_PASSWORD)"
echo "  App organiser A   http://localhost:3000/signin   $USER_A_EMAIL  (DEV_USER_A_PASSWORD, $user_a_action)"
echo "  App organiser B   http://localhost:3000/signin   $USER_B_EMAIL  (DEV_USER_B_PASSWORD, $user_b_action)"
