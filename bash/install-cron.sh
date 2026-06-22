#!/usr/bin/env bash
# Installs the cron of the BoBe Agent project:
#   • ONE tick cron every 20 min (:05/:25/:45) → start-all.sh → fan-out of start-pair.sh across all pairs from config.json.
#     More often is pointless: indicators are on the closed H1 bar, within the hour only the live price changes (take-profit/averaging).
#   • the reflection-job once a day (00:30) — one line per pair.
#   • refresh-candles every minute — pulls 1h candles for all pairs into the DB (the source for the web dashboard).
# Paths and PATH are determined automatically. Run once per machine.
#
#   ./install-cron.sh                      pairs from core/config.json (for reflection)
#   ./install-cron.sh ETH/USDT ADA/USDT    an explicit list of pairs (for reflection)
#   ./install-cron.sh --remove             remove only the lines of this project
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
START="$PROJECT_DIR/bash/start-all.sh"
AGENT="$PROJECT_DIR/bash/start-pair.sh"
REFLECT="$PROJECT_DIR/bash/reflect-pair.sh"
CANDLES="$PROJECT_DIR/bash/candles-all.sh"

# Preserve someone else's crontab, minus our lines (start/agent/reflect/candles).
existing="$(crontab -l 2>/dev/null | grep -vF "$START" | grep -vF "$AGENT" | grep -vF "$REFLECT" | grep -vF "$CANDLES" || true)"

if [ "${1:-}" = "--remove" ]; then
  printf '%s\n' "$existing" | crontab -
  echo "✓ removed the project's cron lines ($START, $AGENT, $REFLECT, $CANDLES)"
  exit 0
fi

# Pairs for reflection: from arguments, otherwise from config.json, otherwise the default.
PAIRS=("$@")
if [ ${#PAIRS[@]} -eq 0 ]; then
  PAIRS=()   # portable (bash 3.2, no mapfile). `|| [ -n "$line" ]` — do not lose the last line without \n.
  while IFS= read -r line || [ -n "$line" ]; do [ -n "$line" ] && PAIRS+=("$line"); done \
    < <(node -e "const c=require('$PROJECT_DIR/core/config.json');process.stdout.write(Object.keys(c.pairs).join('\n'))" 2>/dev/null || true)
  [ ${#PAIRS[@]} -eq 0 ] && PAIRS=("ETH/USDT")
fi

# PATH for cron (cron has a minimal PATH — we locate the binaries).
bins=()
for b in node claude twak psql; do
  p="$(command -v "$b" 2>/dev/null || true)"
  [ -z "$p" ] && { echo "ERROR: '$b' not found in PATH. Load the environment / install it, then retry." >&2; exit 127; }
  bins+=("$(dirname "$p")")
done
CRON_PATH="$(printf '%s\n' "${bins[@]}" /usr/bin /bin | awk '!seen[$0]++' | paste -sd: -)"

# We embed PATH INLINE into each job (rather than as a separate PATH= line) — so that --remove
# and a repeated install do not leave an "orphaned" PATH line in someone else's crontab.
{
  [ -n "$existing" ] && printf '%s\n' "$existing"
  echo "5,25,45 * * * * PATH=$CRON_PATH $START"          # tick every 20 min — fan-out across all pairs
  echo "* * * * * PATH=$CRON_PATH $CANDLES >> $PROJECT_DIR/logs/candles-all.log 2>&1" # candles into the DB for the dashboard (once a minute)
  for pair in "${PAIRS[@]}"; do
    echo "30 0 * * * PATH=$CRON_PATH PAIR=$pair $REFLECT" # reflection once a day at 00:30
  done
} | crontab -

echo "✓ cron installed: tick every 20 min (start-all.sh) + reflection 00:30 for pairs: ${PAIRS[*]}"
echo "  PATH=$CRON_PATH"
crontab -l | grep -E "$PROJECT_DIR" || true
echo "View: crontab -l   ·   Remove: ./install-cron.sh --remove"
