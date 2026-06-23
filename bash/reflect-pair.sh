#!/usr/bin/env bash
# BoBe Agent reflection-job — self-learning for the pair PAIR (once a day). Does NOT trade.
#
#   PAIR=ETH/USDT ./reflect-pair.sh        quietly to the logs (cron); stream to the screen if there is a terminal
#   PAIR=ETH/USDT ./reflect-pair.sh --dev  live stream to the terminal
#
# Config from .env (REFLECTION_MODEL, DB_*, CMC_API_KEY, TELEGRAM_*). The default pair is ETH/USDT.
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR" || exit 1

# Self-sufficient PATH: cron gives a stripped-down PATH without ~/.local/bin (where claude is).
# nvm: puts the default node (≥22) at the front of PATH. The twak CLI requires node≥22 (under v18 — ERR_REQUIRE_ESM).
# Extra paths — at the END, so that an old /usr/local/bin/node v18 does not override the nvm node.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" >/dev/null 2>&1
export PATH="$PATH:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"

set -a
[ -f .env ] && . ./.env
set +a
: "${DB_HOST:=localhost}"; : "${DB_PORT:=5432}"; : "${DB_DATABASE:=bobe_agent}"
export DB_HOST DB_PORT DB_DATABASE DB_USERNAME DB_PASSWORD
: "${REFLECTION_MODEL:=claude-sonnet-4-6}"
: "${PAIR:=ETH/USDT}"
export PAIR

# Single-instance lock PER PAIR (separate from the tick-agent).
SAFE_PAIR="$(printf '%s' "$PAIR" | tr '/' '-')"
LOCK="/tmp/bobe-reflect-$SAFE_PAIR"
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK.lock"
  flock -n 9 || { echo "reflection for $PAIR is already running — skipping"; exit 0; }
else
  mkdir "$LOCK.lockd" 2>/dev/null || {
    [ -n "$(find "$LOCK.lockd" -maxdepth 0 -mmin +30 2>/dev/null)" ] \
      && rmdir "$LOCK.lockd" 2>/dev/null && mkdir "$LOCK.lockd" 2>/dev/null \
      || { echo "reflection for $PAIR is already running — skipping"; exit 0; }
  }
  trap 'rmdir "$LOCK.lockd" 2>/dev/null' EXIT
fi

for bin in claude node psql; do
  command -v "$bin" >/dev/null 2>&1 || { echo "ERROR: '$bin' not found in PATH: $PATH" >&2; exit 127; }
done

# Reflection whitelist — "RECOMMENDATIONS ONLY" MODE: reading the journal + proposing INACTIVE params
# versions (propose_params, always auto_apply=false) + a performance log (record_params_perf).
# DELIBERATELY EXCLUDED are the tools that change what the tick-agent reads: activate_params, rollback_params
# (switch the active version), upsert_lesson/deactivate_lesson, upsert_regime_stats (the tick-agent reads them).
# Reflection does NOT trade and changes NOTHING active — it only advises a human (a summary in Telegram).
TOOLS="mcp__bobe__get_time,mcp__bobe__get_trades,mcp__bobe__get_ticks,mcp__bobe__get_params_history,mcp__bobe__propose_params,mcp__bobe__record_params_perf,mcp__bobe__log_reflection"

run_claude() {
  claude -p "Run today's reflection analysis for $PAIR right now. Follow the strict §0 procedure from your instructions. Begin immediately with mcp__bobe__get_time (set the 24h analysis window from it) and finish with mcp__bobe__log_reflection. Recommendations only — never change active state (any parameter idea is filed with propose_params auto_apply=false). Do not ask questions, do not summarize the rules — act through the tools. Output only the final summary." \
    --append-system-prompt "$(cat prompts/reflection.md)

Pair under analysis: $PAIR. Substitute it as pair in all mcp__bobe__* tools." \
    --model "$REFLECTION_MODEL" \
    --mcp-config .mcp.json --strict-mcp-config \
    --allowedTools "$TOOLS" \
    "$@"
}

if [ "${1:-}" = "--dev" ]; then
  echo "===== dev reflection $PAIR · $(date -u +%FT%TZ) · model $REFLECTION_MODEL ====="
  run_claude --output-format stream-json --verbose | node bin/stream-format.js
  echo "--- notify ---"
  REFLECTION=1 node mcp/notify.js
else
  mkdir -p logs
  LOG="logs/reflect-pair-$SAFE_PAIR-$(date +%Y%m%d).log"
  RAW="$(mktemp)"
  echo "===== reflection $PAIR · $(date -u +%FT%TZ) · model $REFLECTION_MODEL =====" >> "$LOG"

  if [ -t 1 ]; then
    run_claude --output-format stream-json --verbose | tee "$RAW" | node bin/stream-format.js | tee -a "$LOG"
  else
    run_claude --output-format stream-json --verbose | tee "$RAW" | node bin/stream-format.js >> "$LOG" 2>&1
  fi
  rm -f "$RAW"

  {
    echo "--- notify ---"
    REFLECTION=1 node mcp/notify.js
    echo
  } >> "$LOG" 2>&1

  echo "✓ $(date '+%Y-%m-%d %H:%M:%S') — reflection $PAIR completed · log: $LOG"
fi
