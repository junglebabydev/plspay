#!/usr/bin/env bash
# SEC-11: encrypted Postgres backup. Nightly via launchd, and before every deploy.
# Keeps 14 days locally, copies off the machine to BACKUP_REMOTE (e.g. an rclone remote).
set -euo pipefail
source /Users/plspay/plspay/.env.local
LABEL=${1:-nightly}
DIR=/Users/plspay/backups; mkdir -p "$DIR"
FILE="$DIR/plspay-$(date +%Y%m%d-%H%M%S)-$LABEL.sql.gz.gpg"
pg_dump "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  --schema=public --schema=auth --no-owner | gzip \
  | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase "$BACKUP_PASSPHRASE" -o "$FILE"
find "$DIR" -name "plspay-*.gpg" -mtime +14 -delete
if [ -n "${BACKUP_REMOTE:-}" ]; then rclone copy "$FILE" "$BACKUP_REMOTE"; fi
echo "Backup written: $FILE"
