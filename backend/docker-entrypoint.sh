#!/bin/sh
# Starts PocketBase with flags built from env vars.
# `exec` replaces this shell, so PocketBase is PID 1 and receives SIGTERM directly
# (and its execve-based restart after a backup restore works).
set -eu

# Anything that isn't a flag is run as-is, e.g. `docker run <image> /pb/pocketbase --help`.
if [ "$#" -gt 0 ] && [ "${1#-}" = "$1" ]; then
  exec "$@"
fi

# --automigrate only takes true/false (Go ParseBool); accept the same words as the hooks do.
case "$(printf '%s' "${PB_AUTOMIGRATE:-false}" | tr -d ' \t\r' | tr 'A-Z' 'a-z')" in
  1 | true | yes | on) automigrate=true ;;
  0 | false | no | off | "") automigrate=false ;;
  *)
    echo "[template] WARNING: PB_AUTOMIGRATE must be true or false; using false" >&2
    automigrate=false
    ;;
esac

# Extra flags passed to the container are appended to `serve`.
exec /pb/pocketbase serve \
  --http=0.0.0.0:8090 \
  --dir=/pb/pb_data \
  --migrationsDir=/pb/pb_migrations \
  --hooksDir=/pb/pb_hooks \
  --automigrate="$automigrate" \
  --origins="${PB_ORIGINS:-*}" \
  "$@"
