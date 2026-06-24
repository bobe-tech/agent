#!/usr/bin/env bash
# BoBe Agent — refreshing live twak bid/ask quotes (all pairs) in the quotes table for the web dashboard.
# Called by cron once a minute (see install-cron.sh). The API reads quotes ONLY from the DB — the request
# path never calls twak (no rate-limit/latency for the user). The header and unrealized PnL use the latest row.
#
#   ./quotes-all.sh
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR" || exit 1

# Self-sufficient PATH: cron gives a stripped-down PATH without ~/.local/bin (where node/twak live).
# nvm: default node (>=22) at the front of PATH (twak CLI requires node>=22). Extra paths — at the END.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" >/dev/null 2>&1
export PATH="$PATH:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"

set -a
[ -f .env ] && . ./.env
set +a

# twak is required for quotes (node is required to run the script).
for bin in node twak; do
  command -v "$bin" >/dev/null 2>&1 || { echo "ERROR: '$bin' not found in PATH: $PATH" >&2; exit 127; }
done

echo "===== quotes $(date -u +%FT%TZ) ====="
exec node bin/refresh-quotes.mjs
