#!/usr/bin/env bash
# BoBe Agent — a single reflection run across ALL pairs (analogous to start-all.sh, but for the reflection-job).
# Reflection — the "recommendations only" mode (changes nothing active), runs once a day.
# It does not call GeckoTerminal, so no rate-limit risk; the default concurrency is gentle.
#
#   ./reflect-all.sh                 pairs from core/config.json
#   ./reflect-all.sh ETH/USDT        only the specified ones
#   CONCURRENCY=1 ./reflect-all.sh   sequentially
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR" || exit 1

# Self-sufficient PATH: cron gives a stripped-down PATH without ~/.local/bin (where claude is).
# The script locates node/claude itself (via reflect-pair.sh) — the cron line no longer needs a PATH= prefix.
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

set -a
[ -f .env ] && . ./.env
set +a

: "${CONCURRENCY:=3}"   # reflection does not touch GeckoTerminal; 3 in parallel — sparing on LLM cost

if [ "$#" -gt 0 ]; then
  PAIRS=("$@")
else
  PAIRS=()   # portable (bash 3.2, no mapfile); `|| [ -n "$line" ]` — do not lose the last line without \n
  while IFS= read -r line || [ -n "$line" ]; do [ -n "$line" ] && PAIRS+=("$line"); done \
    < <(node -e "const c=require('./core/config.json');process.stdout.write(Object.keys(c.pairs).join('\n'))" 2>/dev/null)
  [ "${#PAIRS[@]}" -eq 0 ] && PAIRS=("ETH/USDT")
fi

echo "===== reflect-all $(date -u +%FT%TZ) · pairs: ${#PAIRS[@]} · concurrency: $CONCURRENCY ====="
printf '%s\n' "${PAIRS[@]}" \
  | xargs -P "$CONCURRENCY" -I {} env PAIR="{}" "$PROJECT_DIR/bash/reflect-pair.sh"
echo "✓ reflection across all pairs completed $(date -u +%FT%TZ)"
