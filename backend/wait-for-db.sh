#!/bin/sh
# wait-for-db.sh  — waits for MySQL to be ready before starting the app
# Usage: ./wait-for-db.sh <host> <port> <max_attempts>
set -e

HOST="${1:-db}"
PORT="${2:-3306}"
MAX="${3:-30}"
WAIT=2

echo "[wait-for-db] Waiting for MySQL at ${HOST}:${PORT} (max ${MAX} attempts)..."

i=0
while ! nc -z "${HOST}" "${PORT}" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge "$MAX" ]; then
    echo "[wait-for-db] ERROR: MySQL not available after ${MAX} attempts. Exiting."
    exit 1
  fi
  echo "[wait-for-db] Attempt ${i}/${MAX} — not ready yet, sleeping ${WAIT}s..."
  sleep "$WAIT"
done

echo "[wait-for-db] MySQL is up! Starting backend..."
exec node app.js
