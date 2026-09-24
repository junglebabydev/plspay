#!/usr/bin/env bash
# Prints the app's Supabase variables from the running local stack, in .env format.
#   scripts/supabase-env.sh > .env.local && chmod 600 .env.local          (laptop)
#   scripts/supabase-env.sh >> "$GITHUB_ENV"                               (CI)
set -euo pipefail
status=$(npx supabase status -o env)
get() { echo "$status" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" | head -1; }
url=$(get API_URL); anon=$(get ANON_KEY); svc=$(get SERVICE_ROLE_KEY)
[ -n "$url" ] && [ -n "$anon" ] && [ -n "$svc" ] || { echo "supabase status did not return API_URL/ANON_KEY/SERVICE_ROLE_KEY" >&2; exit 1; }
printf 'SUPABASE_URL=%s\nSUPABASE_ANON_KEY=%s\nSUPABASE_SERVICE_ROLE_KEY=%s\nREDIS_URL=%s\n' "$url" "$anon" "$svc" "${REDIS_URL:-redis://127.0.0.1:6379}"
