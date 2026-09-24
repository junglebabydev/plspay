#!/usr/bin/env bash
# SEC-10: fail if app, database, Supabase or Redis ports accept connections from the LAN.
set -euo pipefail
PORTS="3000 54321 54322 54323 54324 6379"
LAN_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || true)
fail=0
if [ -n "$LAN_IP" ]; then
  for p in $PORTS; do
    if nc -z -G 2 "$LAN_IP" "$p" 2>/dev/null; then echo "EXPOSED: port $p reachable on $LAN_IP"; fail=1; fi
  done
fi
[ "$fail" = 0 ] && echo "Exposure check OK: only reachable via tunnel" || exit 1
