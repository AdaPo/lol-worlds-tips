#!/usr/bin/env bash
# Backs up the SQLite database, keeps 14 days locally, and copies it off the
# device with rclone when BACKUP_REMOTE is set (e.g. "gdrive:worlds-tips").
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEEP_DAYS=14

# Reads a setting from the environment, else from .env.
env_get() {
  local value="${!1-}"
  if [ -z "$value" ] && [ -f "$ROOT/.env" ]; then
    value="$(grep -E "^$1=" "$ROOT/.env" | tail -1 | cut -d= -f2- || true)"
  fi
  printf '%s' "$value"
}

DB_PATH="$(env_get DB_PATH)"
DB_PATH="${DB_PATH:-$ROOT/data/app.db}"
case "$DB_PATH" in
  /*) ;;
  *) DB_PATH="$ROOT/${DB_PATH#./}" ;;
esac

REMOTE="$(env_get BACKUP_REMOTE)"
DEST="${BACKUP_DIR:-$HOME/backups}"

[ -f "$DB_PATH" ] || { echo "Database not found: $DB_PATH" >&2; exit 1; }

mkdir -p "$DEST"
FILE="$DEST/app-$(date +%F-%H%M).db"

# .backup is safe while the app is running; a plain cp is not.
sqlite3 "$DB_PATH" ".backup '$FILE'"

if [ "$(sqlite3 "$FILE" 'PRAGMA integrity_check')" != "ok" ]; then
  echo "Backup failed the integrity check: $FILE" >&2
  rm -f "$FILE"
  exit 1
fi

find "$DEST" -name 'app-*.db' -mtime "+$KEEP_DAYS" -delete

if [ -n "$REMOTE" ]; then
  rclone copy "$FILE" "$REMOTE"
  rclone delete "$REMOTE" --include 'app-*.db' --min-age "${KEEP_DAYS}d"
else
  echo "WARNING: BACKUP_REMOTE is not set; this backup only exists on this device." >&2
fi

echo "Backup OK: $FILE"
