#!/usr/bin/env bash
# BoBe Agent tick-agent — performs ONE tick for the pair PAIR. Portable (macOS dev + Ubuntu server).
#
#   PAIR=ETH/USDT ./start-pair.sh        quietly — writes to logs/ (cron); streams to the screen if there is a terminal
#   PAIR=ETH/USDT ./start-pair.sh --dev  live stream of the agent's actions to the terminal
#
# Config from .env (AGENT_MODEL, DB_*, CMC_API_KEY, TELEGRAM_*). The default pair is ETH/USDT.
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR" || exit 1

# Self-sufficient PATH: cron gives a stripped-down PATH without ~/.local/bin (where claude is).
# nvm: puts the default node (≥22) at the front of PATH. The twak CLI requires node≥22 — under the old
# /usr/local/bin/node v18 it crashes with ERR_REQUIRE_ESM (require of the ESM @inquirer/prompts), and claude
# does not register mcp__twak__*. Extra paths — at the END, so that node v18 does not override the nvm node.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" >/dev/null 2>&1
export PATH="$PATH:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"

# Config / secrets (we export them so that child processes and ${VARS} in .mcp.json see them)
set -a
[ -f .env ] && . ./.env
set +a
: "${DB_HOST:=localhost}"; : "${DB_PORT:=5432}"; : "${DB_DATABASE:=bobe_agent}"
export DB_HOST DB_PORT DB_DATABASE DB_USERNAME DB_PASSWORD
: "${AGENT_MODEL:=claude-sonnet-4-6}"
: "${PAIR:=ETH/USDT}"
export PAIR

# Single-instance lock PER PAIR (ticks of different pairs do not block each other).
SAFE_PAIR="$(printf '%s' "$PAIR" | tr '/' '-')"
LOCK="/tmp/bobe-$SAFE_PAIR"
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK.lock"
  flock -n 9 || { echo "tick for $PAIR is already running — skipping"; exit 0; }
else
  mkdir "$LOCK.lockd" 2>/dev/null || {
    [ -n "$(find "$LOCK.lockd" -maxdepth 0 -mmin +15 2>/dev/null)" ] \
      && rmdir "$LOCK.lockd" 2>/dev/null && mkdir "$LOCK.lockd" 2>/dev/null \
      || { echo "tick for $PAIR is already running — skipping"; exit 0; }
  }
  trap 'rmdir "$LOCK.lockd" 2>/dev/null' EXIT
fi

# Required binaries (a clear error if PATH on the server is wrong)
for bin in claude node twak psql; do
  command -v "$bin" >/dev/null 2>&1 || { echo "ERROR: '$bin' not found in PATH: $PATH" >&2; exit 127; }
done

# Whitelist of tick tools. twak swap is always allowed (trades are real on-chain swaps).
# BOBE: the full set including fill_order/cancel_order. CMC: global metrics. TWAK: quote + swap.
BOBE="mcp__bobe__get_time,mcp__bobe__get_market,mcp__bobe__get_params,mcp__bobe__get_state,mcp__bobe__log_tick,mcp__bobe__open_position,mcp__bobe__add_to_position,mcp__bobe__close_position,mcp__bobe__fill_order,mcp__bobe__cancel_order"
CMC="mcp__cmc__get_global_metrics_latest,mcp__cmc__get_global_crypto_derivatives_metrics"
TWAK="mcp__twak__get_swap_quote,mcp__twak__swap"
TOOLS="$BOBE,$CMC,$TWAK"

run_claude() {
  claude -p "$(cat prompts/strategy.md)" \
    --append-system-prompt "Pair being traded: $PAIR. Substitute it as pair in all mcp__bobe__* tools." \
    --model "$AGENT_MODEL" \
    --mcp-config .mcp.json --strict-mcp-config \
    --allowedTools "$TOOLS" \
    "$@"
}

if [ "${1:-}" = "--dev" ]; then
  echo "===== dev tick $PAIR · $(date -u +%FT%TZ) · model $AGENT_MODEL ====="
  run_claude --output-format stream-json --verbose | node bin/stream-format.js
  echo "--- notify ---"
  node mcp/notify.js
else
  mkdir -p logs
  LOG="logs/start-pair-$SAFE_PAIR-$(date +%Y%m%d).log"
  RAW="$(mktemp)"
  echo "===== $PAIR · $(date -u +%FT%TZ) · model $AGENT_MODEL =====" >> "$LOG"

  # Event stream: raw → to a temporary file (for usage), formatted → to the log, and to the screen,
  # if the run is interactive (there is a terminal). In cron (no TTY) — quietly.
  if [ -t 1 ]; then
    run_claude --output-format stream-json --verbose | tee "$RAW" | node bin/stream-format.js | tee -a "$LOG"
  else
    run_claude --output-format stream-json --verbose | tee "$RAW" | node bin/stream-format.js >> "$LOG" 2>&1
  fi

  node mcp/record-usage.js < "$RAW" >> "$LOG" 2>&1
  rm -f "$RAW"

  {
    echo "--- notify ---"
    node mcp/notify.js
    echo
  } >> "$LOG" 2>&1

  # A brief summary to stdout (visible in cron output and on a manual run)
  export PGHOST="$DB_HOST" PGPORT="$DB_PORT"
  [ -n "${DB_USERNAME:-}" ] && export PGUSER="$DB_USERNAME"
  [ -n "${DB_PASSWORD:-}" ] && export PGPASSWORD="$DB_PASSWORD"
  ESC_PAIR="${PAIR//\'/\'\'}"   # escape single quotes for safe substitution into SQL
  action="$(psql -tA -d "$DB_DATABASE" -c \
    "SELECT action FROM tick_log WHERE pair = '$ESC_PAIR' ORDER BY id DESC LIMIT 1" 2>/dev/null | tr -d '[:space:]')"
  echo "✓ $(date '+%Y-%m-%d %H:%M:%S') — tick $PAIR completed · action: ${action:-?} · log: $LOG"
fi
