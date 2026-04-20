#!/bin/sh
# Stock sync cron — runs every 5 minutes
CRON_URL="http://localhost:3000/api/cron/sync?secret=${CRON_SECRET}"

while true; do
  sleep 300
  echo "[$(date)] Running stock sync..."
  curl -s --max-time 240 "$CRON_URL" | head -c 500
  echo ""
done
