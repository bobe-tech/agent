#!/usr/bin/env bash
# Initial project seeding: params (all configured pairs, long-only) + warming up the candles. Run ONCE after the migrations.
#   ./bash/install.sh
set -uo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR" || exit 1
# nvm: default node (≥22) at the front of PATH (consistently with start-pair). Extra paths — at the END.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" >/dev/null 2>&1
export PATH="$PATH:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
set -a
[ -f .env ] && . ./.env
set +a
echo "===== install $(date -u +%FT%TZ) ====="
exec node bin/install.js
