#!/usr/bin/env bash
# BoBe Agent — a single fan-out run of ticks across ALL pairs (one agent per pair).
# Called by one cron every 20 min (see install-cron.sh) and distributes the work of start-pair.sh across pairs
# with a concurrency limit. start-pair.sh has its own per-pair lock — pairs do not interfere with each other.
#
#   ./start-all.sh                       pairs from core/config.json (all configured)
#   ./start-all.sh ETH/USDT ADA/USDT     only the specified pairs
#   CONCURRENCY=4 ./start-all.sh         limit concurrency (default 10 — all pairs at once)
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR" || exit 1

# Self-sufficient PATH: cron gives a stripped-down PATH without ~/.local/bin (where claude is).
# The script locates claude/node/twak/psql itself — the cron line no longer needs a PATH= prefix.
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

set -a
[ -f .env ] && . ./.env
set +a

: "${CONCURRENCY:=5}"   # pairs in parallel (gentler on the GeckoTerminal rate-limit); market.js does backoff on 429

# Pairs: from arguments, otherwise the config.json keys, otherwise the default.
if [ "$#" -gt 0 ]; then
  PAIRS=("$@")
else
  PAIRS=()   # portable (bash 3.2, no mapfile). `|| [ -n "$line" ]` — so as not to lose it
  while IFS= read -r line || [ -n "$line" ]; do [ -n "$line" ] && PAIRS+=("$line"); done \
    < <(node -e "const c=require('./core/config.json');process.stdout.write(Object.keys(c.pairs).join('\n'))" 2>/dev/null)
  [ "${#PAIRS[@]}" -eq 0 ] && PAIRS=("ETH/USDT")
fi

echo "===== start $(date -u +%FT%TZ) · pairs: ${#PAIRS[@]} · concurrency: $CONCURRENCY ====="
echo "pairs: ${PAIRS[*]}"

# Fan-out with a concurrency limit via xargs -P (available on both macOS and Ubuntu).
# Each line is a pair; for each one we run start-pair.sh with PAIR from the environment.
printf '%s\n' "${PAIRS[@]}" \
  | xargs -P "$CONCURRENCY" -I {} env PAIR="{}" "$PROJECT_DIR/bash/start-pair.sh"

echo "✓ tick fan-out completed $(date -u +%FT%TZ)"
