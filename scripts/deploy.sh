#!/usr/bin/env bash
# Updates the app on the Pi: backup, pull, install, build, restart, health check.
# Run from anywhere: ~/worlds-tipping/scripts/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE="${SERVICE:-worlds}"
cd "$ROOT"

PORT="$(grep -E '^PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)"
PORT="${PORT:-3000}"

if [ -f "${ROOT}/data/app.db" ]; then
  echo "==> Backing up the database"
  ./scripts/backup.sh
fi

echo "==> Pulling the latest code"
git pull --ff-only

echo "==> Installing dependencies"
npm ci --omit=dev
(cd web && npm ci && npm run build)

echo "==> Restarting $SERVICE"
sudo systemctl restart "$SERVICE"

echo "==> Waiting for the app"
for _ in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    echo "OK: the app is healthy"
    exit 0
  fi
  sleep 1
done

echo "The app did not become healthy. Check: journalctl -u $SERVICE -n 50" >&2
exit 1
