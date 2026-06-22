# BoBe Agent

> An autonomous, LLM-driven crypto trading agent — strategy, market reading and execution all run inside [Claude Code](https://docs.anthropic.com/en/docs/claude-code) over [MCP](https://modelcontextprotocol.io) tools.

[![CoinMarketCap API Hackathon](https://img.shields.io/badge/CoinMarketCap-API_Hackathon-3861FB?logo=coinmarketcap&logoColor=white)](https://coinmarketcap.com/api/hackathon/)
[![BNB Chain](https://img.shields.io/badge/BNB_Chain-BSC-F0B90B?logo=binance&logoColor=black)](https://www.bnbchain.org/)
[![Claude Code](https://img.shields.io/badge/Claude_Code-MCP-D97757?logo=anthropic&logoColor=white)](https://docs.anthropic.com/en/docs/claude-code)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-%E2%89%A512-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**BoBe Agent** is an autonomous trading agent built for the **[CoinMarketCap API Hackathon](https://coinmarketcap.com/api/hackathon/)** (BNB HACK · CoinMarketCap × Trust Wallet × BNB Chain). It trades **a configurable set of BSC pairs, LONG only**, with a **no-stop DCA** strategy — averaging down without a stop-loss plus a dynamic, volatility-scaled take-profit. A separate daily *reflection-job* reviews the trade journal and recommends parameter tweaks (it never trades or changes the live config itself).

Every decision is made by an LLM: a Claude Code agent runs each tick, reads live market data and prices, and calls MCP tools to open / average / close positions. Live prices come from a real twak quote (bid/ask), and every trade executes as a **real on-chain swap** via twak.

- 📈 **Strategy details** → [`prompts/strategy.md`](prompts/strategy.md) · reflection prompt → [`prompts/reflection.md`](prompts/reflection.md)
- 🖥️ **Web dashboard** → read-only observation UI (React + Fastify), see [Web dashboard](#web-dashboard-ui)
- ⚙️ **Install / run / deploy / test** → below

> [!WARNING]
> This agent executes **real on-chain swaps with real funds** on BNB Smart Chain. See the [Disclaimer](#-disclaimer) before running it.

## Table of contents

- [Architecture](#architecture)
- [Strategy (concept)](#strategy-concept)
- [Experience analysis (reflection-job)](#experience-analysis-reflection-job-recommendations-only-mode)
- [MCP tools (the `bobe` server)](#mcp-tools-the-bobe-server)
- [Installation](#installation-from-scratch)
- [Running (manually)](#running-manually)
- [Web dashboard (UI)](#web-dashboard-ui)
- [Tests](#tests)
- [Deployment to a server](#deployment-to-a-server)
- [Operation](#operation)
- [Stack](#stack)
- [Security](#security)
- [Disclaimer](#-disclaimer)
- [License](#-license)

## Architecture

```
cron (*/10 * * * *) → bash/start-all.sh → fan-out of bash/start-pair.sh across all pairs (CONCURRENCY, default 10)
bash/start-pair.sh (PAIR) → claude -p (tick-agent, monolithic):
  1. mcp__bobe__get_time      — server UTC (finish timing, bar-close check)
  2. mcp__bobe__get_market    — indicators for the closed H1 bar: hv (ATR%), dv (daily vol),
                               high_24h, ADX/adx_mult, CRSI + crsi_min_3h; + base/quote/token_address. Anti-repaint.
  3. mcp__cmc__*             — Fear & Greed, BTC dominance, (opt.) derivatives — regime tilt
  4. mcp__bobe__get_params    — active configuration (JSONB config)
  5. mcp__bobe__get_state     — active positions (LONG) with nested orders, last_trade_at, lessons, stats
  6. mcp__twak__get_swap_quote — live quote by token address, both legs → bid/ask
  7. decision per side: OPEN / ADD / CLOSE / HOLD
  8. mcp__bobe__open/add/close_position
  9. mcp__bobe__log_tick      — tick journal (always, + live_bid/live_ask)
  → record-usage.js → notify.js (Telegram)

cron (00:30) → bash/reflect-pair.sh (PAIR) → claude -p (reflection-job, does not trade)
```

## Strategy (concept)

BoBe is an autonomous long-only, no-stop DCA agent on BNB Smart Chain. Each 10-minute tick it
reads market indicators, decides, and executes real on-chain swaps via MCP tools. Entries and
averagings are gated by an ATR volatility filter (scaled by an ADX multiplier) plus a Connors-RSI
crossing; exits are take-profit only (it never sells at a loss voluntarily). The full, authoritative
rules live in `prompts/strategy.md`; tunable thresholds live per-pair in the `params` table.

## Experience analysis (reflection-job, "recommendations only" mode)

Once a day it reads the journal (`positions`+nested `orders` / `tick_log`) and **only recommends** to the human what is worth
changing in `config` (net PnL, time to take-profit, averagings, open drawdowns → advice on the take-profit, ADX, Connors-RSI and averaging-depth thresholds).
**It changes NOTHING active itself:** proposals are created as INACTIVE params versions
(`propose_params auto_apply=false`), activated by a human. It does not activate/roll back versions, does not write
lessons/statistics. Its own analysis (what it looked at, conclusions, recommendations) it writes to `reflection_log` via
`log_reflection` — from there a summary goes to the human in Telegram. The strategy type (no-stop DCA) does not change.

## MCP tools (the `bobe` server)

- **Tick:** `get_time`, `get_market`, `get_params`, `get_state` (active positions with nested `orders`), `log_tick`, `open_position`, `add_to_position`, `close_position` (with `force`), `fill_order` (confirm the swap fill: `comp_*`/`tx_id`), `cancel_order` (swap did not go through). Lifecycle: open/add/close create an `active` order → swap → `fill_order`/`cancel_order`.
- **Reflection (the server has all of them, but the job in "recommendations only" mode uses a subset):** reading — `get_time`, `get_trades`, `get_ticks`, `get_params_history`; writing — `propose_params` (inactive candidates, `auto_apply=false`), `record_params_perf` and `log_reflection` (an analysis summary into the `reflection_log` table → Telegram). The tools that change the active policy (`activate_params`, `rollback_params`, `upsert_lesson`, `deactivate_lesson`, `upsert_regime_stats`) are NOT included in the reflection allow-list.

Privilege separation is via `--allowedTools`: the tick-agent sees only the tick tools, reflection — only reading + recommendations.

## Installation (from scratch)

**Requirements:** PostgreSQL **≥ 12**; **Node.js ≥ 22** (the twak CLI requires node≥22 — under 18 it crashes); in PATH — `node`, `claude` (CLI), `twak`, `psql`. The `bash/*` scripts pick up nvm (default ≥22) themselves.

1. `createdb bobe_agent` — create the DB.
2. `cp .env.example .env` and fill it in:
   - `AGENT_MODEL` / `REFLECTION_MODEL` — the Claude models for the tick-agent and reflection-job.
   - `DB_*` — PostgreSQL connection (and `DB_TEST_*` if you will run the DB tests).
   - `WALLET_ADDRESS` / `BSC_RPC_URL` / `TATUM_API_KEY` — the trading wallet and the BSC RPC used to read swap receipts in `fill_order` (`core/blockchain.js`). `TATUM_API_KEY` only if the RPC is a Tatum gateway.
   - `CMC_API_KEY` — CoinMarketCap MCP (market regime).
   - `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — trade/closure/error notifications.
   - The twak wallet itself is configured in the `twak` MCP (see `.mcp.json`). Trades are real on-chain swaps, so fund the wallet only when you are ready to trade.
3. `npm ci` — project dependencies (a single `node_modules` at the root).
4. `./db/migrate.sh bobe_agent` — apply the migrations (9 tables; idempotent, `--status` — what is applied).
5. `bash/install.sh` — seed the parameters for all configured pairs (long-only) and warm up the candles.
6. `bash/install-cron.sh` — install cron (tick */10 + reflection 00:30 + candles once a minute; `--remove` to remove).

The pools and addresses of all pairs — in `core/config.json`.

## Running (manually)

The scripts are symmetric: `*-pair.sh` — a worker for one pair, `*-all.sh` — a fan-out across all pairs.

```bash
PAIR=ETH/USDT bash/start-pair.sh --dev # one tick of one pair with live output
PAIR=ETH/USDT bash/start-pair.sh       # quietly (as in cron)
bash/start-all.sh                        # fan-out of ticks across all pairs (CONCURRENCY=10; CONCURRENCY=4 — gentler on rate-limit)
PAIR=ETH/USDT bash/reflect-pair.sh --dev # reflection of one pair with output
bash/reflect-all.sh                      # fan-out of reflection across all pairs (once a day)
bash/candles-all.sh                      # refresh the 1h candles for all pairs in the DB (for the dashboard)
bash/install-cron.sh                     # tick */10 + reflection 00:30 + candles once a minute; --remove to remove
```

The scripts are **self-sufficient regarding `PATH`** (they add `~/.local/bin` etc. themselves) — in cron
a `PATH=...` prefix is not needed, the full path is enough: `1 * * * * /path/to/bash/start-all.sh`.

## Web dashboard (UI)

The **BNB Hack** dashboard — read-only observation of the agent (no authentication, dark theme): pair selection +
the latest price, a candlestick chart (TradingView lightweight-charts) with the average entry price line of open
positions, tables of positions and ticks (filter by the agent's decision type), strategy parameters, self-learning
conclusions (`reflection_log`) and PnL by pair/portfolio.

It consists of two parts in this same monorepo (a single root `package.json`/`node_modules`):
- `api/` — a REST API on Fastify + TypeScript (port `3001`), reads the DB and Binance.
- `front/` — an SPA on React + Vite + TypeScript + Tailwind v4 + HeroUI (port `5173`), calls the API.

Candles: **both the dashboard API and the agent itself** (`mcp get_market`) read them **from the DB** (the `candles` table),
and it is filled by the cron script `candles-all.sh` (1h for all pairs, once a minute; `install-cron.sh` installs the
entry) — this is the **only** one that calls Binance. 4h/1d are resampled from 1h on read.
Therefore the candles cron must be running (on the first run, fill the DB manually, otherwise the tick-agent will get
empty data and do a HOLD). One-off fill:
```bash
bash/candles-all.sh                  # or npm run candles:refresh — fill the DB with candles
```

### Running (dev, auto-restart on code change)
```bash
npm ci                               # project dependencies (including the UI)
npm run dev                          # API (:3001) + front (:5173) at once, both with auto-reload
```
Or separately in two terminals:
```bash
npm run api:dev                      # API on :3001, tsx watch — restart on API/core code edits
npm run front:dev                    # front on :5173 (Vite HMR), proxy /api → :3001
```
Open in the browser: **http://localhost:5173**. `api:start` — the same without watch (for a prod-like run).
The API port — `API_PORT`; the CORS allowlist for prod — `CORS_ORIGINS=https://example.com,...`.
API logs are written to stdout and to `logs/api.log` (`LOG_LEVEL`, `API_LOG_FILE`); 5xx to the outside — as a generic
message, the real text only in the log (enable to the outside: `API_DEBUG=true`).

### Build (prod)
```bash
npm run front:build                  # static into front/dist/
npm run front:preview                # local preview of the built static
```
For production: serve `front/dist/` with any static server/CDN, proxying `/api/*` to the running
`npm run api:start` (or a `node` process with the same code).

## Tests
```bash
npm test                             # node --test: core/mcp/bin + the shared layer tests/ (factories, foundation)
npm run test:api                     # vitest: API routes (via fastify.inject + a test DB)
npm run test:front                   # vitest + RTL + MSW: front components/widgets
npm run test:e2e                     # Playwright: responsiveness desktop/tablet/mobile (brings up api+front itself)
npm run test:all                     # node (core/mcp/bin) + api + front in a single run
npm run test:db:reset                # apply the migrations to the test DB (DB_TEST_DATABASE)
```
Test data is built by factories from `tests/` (the deterministic candle generator
`makeCandles`, the seeders `seedParams/seedPosition/seedOrder/...`) — a single source of defaults.
Each test with the DB runs in a transaction with an unconditional ROLLBACK (isolation, no leftover garbage).

> **Test DB** (needed for `api` and all DB tests): `createdb bobe_agent_test && npm run test:db:reset`.
> The connection parameters — `DB_TEST_*` in `.env` (see `.env.example`). The safeguard in `tests/db.js`
> fails if the DB name does not contain `test`, so that the autotests physically cannot touch the prod DB.

### Test architecture (how to write new ones — we keep a single style)

- **Location.** A test sits next to the code: `foo.js` → `foo.test.js` (api/front — in their own `tests/`/`__tests__`). Shared helpers and factories — in the root `tests/`, NOT in `core/` (that is prod code).
- **Two runners, deliberately.** `core/mcp/bin` are run by `node --test` (prod code is executed as raw JS without a build — we test it with that, instantly). `api` (TS) and `front` (jsdom) — `vitest`. Write a new test for core/mcp/bin under `node:test` + `node:assert/strict`.
- **The DB is real, not a mock.** The money arithmetic lives in SQL — mocking pg is pointless (you would lose exactly what you are checking). Take `setupTestDb()` + wrap the body in `withTx(async () => { ... })` from `tests/db.js`: each test in a transaction with an unconditional ROLLBACK, no leftover garbage.
- **Data — by factories.** Do not insert rows by hand: `seedParams/seedPosition/seedOrder/seedTick/seedCandles/seedReflection/seedLesson` from `tests/factories.js` (a single source of defaults). Candles — `makeCandles({ pattern })` from `tests/candles.js` (deterministic, without `Math.random`).
- **External APIs — mock `globalThis.fetch`.** We do not call Binance and the rest of the network: we substitute `globalThis.fetch` in the test and restore it in `finally`.
- **Extract pure logic so it can be tested.** If a file performs a side effect on import (a connection to stdio, `process.exit`, reading stdin) — wrap the auto-launch in the guard `process.argv[1] === fileURLToPath(import.meta.url)`, and export the logic (examples: `mcp/validation.js`, `bin/refresh-candles.mjs`, `mcp/record-usage.js`).
- **Front — RTL + MSW.** Requests are mocked via `@/test/msw` (`server.use(http.get(...))`); an unmocked request fails the test (`onUnhandledRequest: 'error'`). Selectors — by role/`data-testid`, not by text.

## Deployment to a server

The deploy script — after `git pull`:
```bash
cd <project-path>
git pull origin release            # prod branch
npm ci                             # dependencies (a single node_modules at the root)
bash db/migrate.sh                 # new migrations (idempotent — only the fresh ones are applied)
npm run front:build                # rebuild the dashboard static → front/dist
```
On the first rollout, additionally: `createdb bobe_agent`, `./db/migrate.sh bobe_agent`, `bash/install.sh`,
`bash/install-cron.sh` (tick + reflection + candles), `npm run candles:refresh` (fill the candles once).

### Web dashboard on the server
- **API** — a long-lived process (systemd / pm2 etc.): `npm run api:start` (= `tsx api/src/index.ts`),
  reads `.env`, listens on the port `API_PORT` (default `3001`). Keep `3001` closed from the outside (firewall) —
  only nginx publishes it externally. If the front and API are on one domain (nginx below) — CORS is not needed;
  otherwise set `CORS_ORIGINS=https://dashboard.example.com`.
- **Candles** — the cron `bash/candles-all.sh` (installed by `bash/install-cron.sh`) fills the `candles` table once a minute.
- **Front** — the static `front/dist` (after `npm run front:build`), served by nginx; `/api/*` it proxies
  to the API. The front calls relative `/api/*`, therefore a separate domain/port for the front is not needed.

> The build (`front:build`, vite) and running the API (`api:start`, tsx) need devDependencies — install with the regular
> `npm ci`, NOT `npm ci --omit=dev`.

An nginx example (front + API on one domain):
```nginx
server {
  listen 443 ssl;
  server_name dashboard.example.com;
  # ssl_certificate ... ; ssl_certificate_key ... ;

  root /path/to/bobe-agent/front/dist;
  index index.html;

  # SPA: any unknown path → index.html (client-side rendering)
  location / {
    try_files $uri $uri/ /index.html;
  }

  # API → Node process. proxy_pass WITHOUT a path and trailing slash: nginx passes the full /api/...,
  # and the API routes already contain the /api prefix. If you add a slash (.../;) — the prefix is stripped and you get a 404.
  location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # hashed Vite assets can be cached for a long time
  location /assets/ {
    root /path/to/bobe-agent/front/dist;
    expires 30d;
    add_header Cache-Control "public, immutable";
  }
}
```

**Before going live:**
- Trades execute as real on-chain swaps — double-check `WALLET_ADDRESS` / the twak wallet, that it is funded, and that you really intend to trade real funds.
- Set the hackathon end time (UTC) — without it the finish (closing positions) will not trigger:
```sql
UPDATE params SET config = jsonb_set(config,'{hackathon_end}','"2026-06-22T23:59:00Z"'::jsonb,true) WHERE is_active;
```

## Operation

```bash
# decisions / positions / active params
psql -d bobe_agent -c "SELECT id,pair,action,regime,close,adx,left(reason,60) FROM tick_log ORDER BY id DESC LIMIT 5;"
psql -d bobe_agent -c "SELECT id,pair,side,status,opened_amount,opened_price,realized_pnl_pct,force_closed FROM positions ORDER BY id DESC LIMIT 5;"
psql -d bobe_agent -c "SELECT id,position_id,action,status,comp_size,comp_amount,comp_price,tx_id FROM orders ORDER BY id DESC LIMIT 5;"
psql -d bobe_agent -c "SELECT pair,config->>'hackathon_end' fin,config->>'side_mode' side FROM params WHERE is_active ORDER BY pair;"
```

- Logs: `logs/start-pair-<PAIR>-*.log`, `logs/reflect-pair-<PAIR>-*.log`.
- **Binance 429:** `CONCURRENCY` defaults to 10; `market.js` does backoff (12s, up to 4 attempts). If noisy — `CONCURRENCY=4 bash/start-all.sh`.

## Stack

Claude Code (tick-agent + reflection) · MCP server `bobe` on Node.js (`mcp/`, namespace `mcp__bobe__*`) ·
CMC MCP (market regime) · Trust Wallet `twak` MCP (live quotes + on-chain swaps) · Binance (OHLCV) · PostgreSQL · Telegram · bash/cron.
**UI:** a shared core `core/` (db/market/indicators) · API `api/` on Fastify + TypeScript · front `front/` on React + Vite + TypeScript + Tailwind v4 + HeroUI (lightweight-charts, React Query).

## Security

- **Tool whitelisting (`--allowedTools`):** each Claude Code run only sees the MCP tools it needs. The tick-agent gets the quote + `swap` and the position lifecycle tools; the reflection-job gets read + recommendation tools only. Tools are gated at launch (`bash/start-pair.sh` / `bash/reflect-pair.sh`), not inside the server.
- **Privilege separation:** the tick trades but does not change the configuration; reflection does not trade and changes NOTHING active — it only recommends (inactive proposals for a human).
- **Invariants:** sizes strictly `sizes_usd`, ≤ `max_adds` averagings, ≤1 position/side/pair (unique-index),
  closing only in profit (except `force=true`); the `config` ranges reflection keeps itself (there is no CHECK on JSONB in the DB).
- **Pair isolation:** `add/close_position` verify `pair`; adding/closing — transactions with `SELECT FOR UPDATE`.

## ⚠️ Disclaimer

This project is an experimental hackathon submission, provided **for educational and research purposes only**. It is **not financial advice** and makes no guarantee of profit.

The agent executes **real on-chain swaps with real funds** on BNB Smart Chain — it is fully autonomous and an LLM makes every trading decision. Crypto trading carries substantial risk, including the **total loss** of the deployed capital; the no-stop DCA strategy holds losing positions without a stop-loss by design. Run it only with funds you can afford to lose, ideally on a dedicated, minimally-funded wallet, and only after reviewing the strategy and code. You are solely responsible for any use of this software, for compliance with the laws and regulations of your jurisdiction, and for any resulting losses. The authors accept no liability. **Use at your own risk.**

## 📄 License

Released under the [MIT License](LICENSE).
