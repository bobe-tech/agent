#!/usr/bin/env bash
# BoBe Agent — refreshing the candles (1h for ALL pairs) in the candles table for the web dashboard.
# Called by cron once a minute (see install-cron.sh). The API reads candles ONLY from the DB — the request
# path is decoupled from Binance (no 429/502 for the user). 4h/1d are resampled from 1h on read.
#
#   ./candles-all.sh
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR" || exit 1

# Self-sufficient PATH: cron gives a stripped-down PATH without ~/.local/bin (where node is).
# nvm: default node (≥22) at the front of PATH (consistently with start-pair). Extra paths — at the END.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" >/dev/null 2>&1
export PATH="$PATH:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"

set -a
[ -f .env ] && . ./.env
set +a

echo "===== candles $(date -u +%FT%TZ) ====="
exec node bin/refresh-candles.mjs
