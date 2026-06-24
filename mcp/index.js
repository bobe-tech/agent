#!/usr/bin/env node
// BoBe MCP — the single MCP server for the BoBe Agent trading agent (Market + Account).
// Tick tools: get_time, get_market, get_params, get_state, log_tick, open_position, add_to_position, close_position.
// Reflection tools are registered below (Phase 6). The split of tick/reflection permissions is via
// --allowedTools in start-pair.sh / reflect-pair.sh, not in the server. External data (cmc, twak) — separate MCPs.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createPool } from '../core/db.js';
import { getMarket, marketParamsFromConfig } from '../core/market.js';
import { getParams, getState, logTick, openPosition, addToPosition, closePosition, fillOrder, cancelOrder, crsiMinOverWindow } from './account.js';
import {
  getTrades, getTicks, getParamsHistory, upsertRegimeStats, upsertLesson, deactivateLesson,
  proposeParams, activateParams, rollbackParams, recordParamsPerf, logReflection,
} from './reflection.js';
import { makePairCfg, nonNegNum, assertSideAllowed } from './validation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, '..', 'core', 'config.json'), 'utf8'));
const pool = createPool();

// Validators live in validation.js (covered by tests); here we wire them to config/env.
const pairCfg = makePairCfg(config);

const ok = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const fail = (e) => ({ isError: true, content: [{ type: 'text', text: `ERROR: ${e.message || e}` }] });

// SHORT is disabled globally (long-only). It is enabled only deliberately via env (reserved for the future).
const SHORTS_ENABLED = process.env.SHORTS_ENABLED === 'true';

const server = new McpServer({ name: 'bobe', version: '0.1.0' });

server.tool(
  'get_time',
  'Current server time in UTC: ISO string, Unix seconds and day (for timing the hackathon finish and checking that the H1 bar is closed).',
  {},
  async () => {
    try {
      const now = new Date();
      return ok({ iso: now.toISOString(), unix: Math.floor(now.getTime() / 1000), date: now.toISOString().slice(0, 10) });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'get_market',
  'Market indicators for a pair on H1 candles from the DB (anti-repaint on the last CLOSED bar; Binance is NOT hit live). Returns: close (last closed H1 close, context), live_close (current price = close of the latest candle in the DB), high_24h (highest high over the trailing 24h — the LONG entry anchor), atr_pct=hv (hourly ATR-14 %), daily_vol_pct=dv (daily ATR-14 %), adx, adx_mult (the ADX multiplier applied to every threshold), crsi (current Connors RSI), crsi_min_3h (minimum CRSI over crsi_window_hours, from tick_log history — the entry/averaging gate input), crsi_window_hours. Plus pair metadata: base, quote, token_address (use for the twak quote).',
  {
    pair: z.string().describe('Trading pair, e.g. "ETH/USDT". Must be configured in config.json.'),
    timeframe: z.enum(['H1', 'H4', 'D1']).default('H1').describe('Bar timeframe. Default H1.'),
    limit: z.number().int().min(60).max(1000).default(720).describe('How many of the latest bars to load. Default 720 (~30 days of H1 — needed for daily ATR-14 and CRSI warm-up).'),
  },
  async ({ pair, timeframe, limit }) => {
    try {
      const cfg = pairCfg(pair);
      const { rows: pr } = await pool.query('SELECT config FROM params WHERE pair=$1 AND is_active', [pair]);
      const c = pr[0]?.config || {};
      const { crsi_periods, adx_mult, high_window_hours, crsi_window_hours } = marketParamsFromConfig(c);
      const market = await getMarket(cfg, { timeframe, limit, crsi_periods, adx_mult, high_window_hours });
      // CRSI history lives in tick_log (the tick cron runs every 10 min). Minimum over the crossing window.
      const crsi_min_3h = await crsiMinOverWindow(pair, crsi_window_hours);
      return ok({ ...market, crsi_min_3h, crsi_window_hours });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'get_params',
  'The active strategy params version for a pair. The entire configuration is in the JSON config field (side_mode, sizes_usd, max_adds, adx_mult_threshold/lo/hi, avg2_atr_mult, crsi_buy, crsi_window_hours, high_window_hours, CRSI periods, hackathon_end).',
  { pair: z.string().describe('Trading pair, e.g. "ETH/USDT".') },
  async ({ pair }) => {
    try {
      pairCfg(pair);
      return ok(await getParams(pair));
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'get_state',
  'State from memory: active positions (aggregates opened_*/closed_*), each with a nested orders array (all orders of the position: action=open/add/close, status=active/completed/cancelled); the agent computes adds_count itself = orders.filter(o => ["open","add"].includes(o.action) && o.status==="completed").length − 1; reconciliation — orders with status="active" inside orders. Also: last_trade_at, the top-3 lessons, regime statistics.',
  {
    pair: z.string().describe('Trading pair, e.g. "ETH/USDT".'),
    regime: z.enum(['UP_TREND', 'DOWN_TREND', 'RANGE', 'LOWVOL']).describe('Current market regime (prompt §4).'),
  },
  async ({ pair, regime }) => {
    try { pairCfg(pair); return ok(await getState(pair, regime)); } catch (e) { return fail(e); }
  }
);

server.tool(
  'log_tick',
  'Record the tick outcome in the tick_log journal (REQUIRED every tick, even HOLD). Accepts the §9 decision output JSON + params_version.',
  {
    pair: z.string().describe('Trading pair.'),
    action: z.enum(['OPEN_LONG', 'OPEN_SHORT', 'ADD', 'CLOSE', 'HOLD']).describe('Final action of the tick.'),
    regime: z.enum(['UP_TREND', 'DOWN_TREND', 'RANGE', 'LOWVOL']).describe('Market regime at the tick.'),
    features: z.record(z.any()).optional().describe('Feature snapshot: close, live_close, high_24h, atr_pct (hv), daily_vol_pct (dv), adx, adx_mult, crsi, crsi_min_3h, fng, btc_dom.'),
    expected_move_pct: z.number().nullable().optional().describe('Computed take-profit, % (hv·adx_mult).'),
    live_bid: z.number().nullable().optional().describe('Live bid (selling base→USDT), USD — from the twak quote. The LONG exit/valuation price.'),
    live_ask: z.number().nullable().optional().describe('Live ask (buying USDT→base), USD — from the twak quote. The LONG entry/add-on price.'),
    confidence: z.number().min(0).max(1).nullable().optional().describe('Confidence in the decision 0–1.'),
    reason: z.string().nullable().optional().describe('1–3 sentences: regime, which conditions and lessons were taken into account.'),
    applied_lessons: z.array(z.string()).nullable().optional().describe('Applied lessons (texts).'),
    position_id: z.number().int().nullable().optional().describe('Position ID, if the tick opened/added to/closed a position.'),
    params_version: z.number().int().describe('Active params version (from get_params).'),
  },
  async (d) => {
    try {
      pairCfg(d.pair);
      return ok(await logTick(d.pair, d));
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'open_position',
  'Create a position (LONG) and an opening order in status active (intent BEFORE the swap). Returns the order resource: side, action, start_size (base=amount/price), start_amount (USDT), start_price. Then execute the swap and call fill_order.',
  {
    pair: z.string().describe('Trading pair.'),
    side: z.enum(['LONG', 'SHORT']).describe('Currently LONG only.'),
    amount: z.number().positive().describe('Leg size in USDT (sizes_usd[0], e.g. 20).'),
    price: z.number().positive().describe('Entry price (ask from the twak quote).'),
    regime_at_entry: z.enum(['UP_TREND', 'DOWN_TREND', 'RANGE', 'LOWVOL']).describe('Regime at entry.'),
    features_at_entry: z.record(z.any()).describe('Feature snapshot at entry.'),
    expected_move_pct: z.number().nullable().optional().describe('Computed take-profit, % (hv·adx_mult).'),
    params_version: z.number().int().describe('Active params version.'),
  },
  async (a) => {
    try {
      pairCfg(a.pair);
      // long-only: we reject SHORT BEFORE the swap (rather than writing a knowingly wrong position), until
      // SHORTS_ENABLED explicitly enables the reserve. The guard logic is in validation.js (covered by tests).
      assertSideAllowed(a.side, SHORTS_ENABLED);
      return ok(await openPosition(a));
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'add_to_position',
  'Averaging (LONG): creates an active add order. Returns the order resource. Then swap + fill_order. Rejected when max_adds is reached.',
  {
    pair: z.string().describe('Trading pair of the position.'),
    position_id: z.number().int().describe('ID of the active position.'),
    amount: z.number().positive().describe('Add-on size in USDT (sizes_usd[next]).'),
    price: z.number().positive().describe('Add-on price (ask from the twak quote).'),
  },
  async (a) => { try { pairCfg(a.pair); return ok(await addToPosition(a)); } catch (e) { return fail(e); } }
);

server.tool(
  'close_position',
  'Close a position (LONG): creates an active close order for the entire held base. Guard: at net PnL ≤ 0 and force=false the close is rejected. Returns the order resource. Then swap (selling the entire base) + fill_order.',
  {
    pair: z.string().describe('Trading pair of the position.'),
    position_id: z.number().int().describe('ID of the active position.'),
    price: z.number().positive().describe('Exit price (bid from the twak quote).'),
    reason: z.string().nullable().optional().describe('Close reason (free text).'),
    force: z.boolean().default(false).describe('true: forced (hackathon finish) — the net>0 guard is lifted.'),
  },
  async (a) => { try { pairCfg(a.pair); return ok(await closePosition(a)); } catch (e) { return fail(e); } }
);

server.tool(
  'fill_order',
  'Confirm swap execution: order active → completed. The server reads the actual amounts from the transaction receipt by tx_id ITSELF (comp_size/comp_amount from Transfer events). Recomputes aggregates; for a close order it computes realized_pnl and closes the position. Pass ONLY order_id and tx_id (for close you may also pass reason/force).',
  {
    order_id: z.union([z.number(), z.string()]).describe('Order ID (from open/add/close).'),
    tx_id: z.string().min(1).describe('Swap transaction hash (required). The server reads the actual amounts by it.'),
    reason: z.string().nullable().optional().describe('Reason (for a close order).'),
    force: z.boolean().optional().describe('Force close (hackathon finish).'),
  },
  async (a) => { try { return ok(await fillOrder(a)); } catch (e) { return fail(e); } }
);

server.tool(
  'cancel_order',
  'Cancel an order (the swap did not go through / was cancelled): active → cancelled. If it is an open order with no other completed ones — the position is also cancelled. Does not affect aggregates (cancelled is not counted).',
  {
    order_id: z.number().int().describe('ID of the active order.'),
    reason: z.string().describe('Cancellation reason (the swap error text).'),
  },
  async (a) => { try { return ok(await cancelOrder(a)); } catch (e) { return fail(e); } }
);

// ============================================================
//  Reflection tools (self-learning). Available only to the reflection job via its allow-list;
//  the tick agent does not see them (the start-pair.sh whitelist does not include them). Reflection does NOT trade.
// ============================================================

const REGIME = z.enum(['UP_TREND', 'DOWN_TREND', 'RANGE', 'LOWVOL']);

server.tool(
  'get_trades',
  'Positions of the window for a pair (completed by default) with all fields: reason, realized_pnl_pct, realized_pnl_usd, opened_price, opened_amount, regime_at_entry, features_at_entry, expected_move_pct. Each position contains a nested orders array (all orders of the position: action=open/add/close, comp_size/comp_amount/comp_price, status, created_at) — from them reflection counts the number of legs/add-ons: completed open+add orders − 1.',
  {
    pair: z.string().describe('Trading pair.'),
    from: z.string().describe('Window start (ISO date/time).'),
    to: z.string().describe('Window end (ISO date/time).'),
    status: z.enum(['active', 'completed']).default('completed').describe('Which positions: completed (default) or active.'),
  },
  async ({ pair, from, to, status }) => {
    try { pairCfg(pair); return ok(await getTrades(pair, from, to, status)); } catch (e) { return fail(e); }
  }
);

server.tool(
  'get_ticks',
  'tick_log rows of the window for a pair (including HOLD): decisions, features, reason, confidence.',
  {
    pair: z.string().describe('Trading pair.'),
    from: z.string().describe('Window start (ISO).'),
    to: z.string().describe('Window end (ISO).'),
  },
  async ({ pair, from, to }) => {
    try { pairCfg(pair); return ok(await getTicks(pair, from, to)); } catch (e) { return fail(e); }
  }
);

server.tool(
  'get_params_history',
  'The active params version + the full version history for a pair with attached performance (params_perf) — for comparison and rollback.',
  { pair: z.string().describe('Trading pair.') },
  async ({ pair }) => {
    try { pairCfg(pair); return ok(await getParamsHistory(pair)); } catch (e) { return fail(e); }
  }
);

server.tool(
  'upsert_regime_stats',
  'Write/update aggregated statistics for a (pair, regime): n_trades, win_rate, avg_r, avg_pnl_pct, median_hold.',
  {
    pair: z.string().describe('Trading pair.'),
    regime: REGIME.describe('Market regime.'),
    n_trades: z.number().int().describe('Number of trades in the window.'),
    win_rate: z.number().optional().describe('Fraction of profitable trades 0–1.'),
    avg_r: z.number().optional().describe('Average R multiple.'),
    avg_pnl_pct: z.number().optional().describe('Average PnL, %.'),
    median_hold: z.number().optional().describe('Median hold, bars.'),
  },
  async (a) => {
    try { pairCfg(a.pair); return ok(await upsertRegimeStats(a.pair, a.regime, a)); } catch (e) { return fail(e); }
  }
);

server.tool(
  'upsert_lesson',
  'Add a distilled lesson (heuristic) for a pair/regime: short text + confidence.',
  {
    pair: z.string().describe('Trading pair.'),
    regime: REGIME.nullable().optional().describe('Regime (null = a global lesson for the pair).'),
    text: z.string().describe('A short heuristic.'),
    confidence: z.number().min(0).max(1).default(0.5).describe('Confidence in the lesson 0–1.'),
  },
  async (a) => {
    try { pairCfg(a.pair); return ok(await upsertLesson(a.pair, a)); } catch (e) { return fail(e); }
  }
);

server.tool(
  'deactivate_lesson',
  'Deactivate an outdated/contradictory lesson by id (active=false).',
  { id: z.number().int().describe('Lesson ID.') },
  async ({ id }) => {
    try { return ok(await deactivateLesson(id)); } catch (e) { return fail(e); }
  }
);

server.tool(
  'propose_params',
  'Propose a new params version (changes.config on top of the active/parent one). The config is JSONB with no CHECK in the DB, the allowed ranges are kept by reflection itself (see prompt §5). With auto_apply=true the new version becomes active.',
  {
    pair: z.string().describe('Trading pair.'),
    changes: z.record(z.any()).describe('Object of param changes; settings — in config, e.g. {"config":{"crsi_buy":12}}.'),
    reason: z.string().describe('Justification of the change (based on statistics).'),
    auto_apply: z.boolean().default(false).describe('Activate the new version immediately (if it passed the guardrails).'),
    parent_version: z.number().int().optional().describe('Base version (the active one by default).'),
  },
  async (a) => {
    try { pairCfg(a.pair); return ok(await proposeParams(a.pair, a)); } catch (e) { return fail(e); }
  }
);

server.tool(
  'activate_params',
  'Make the specified params version active for a pair (one active per pair).',
  {
    pair: z.string().describe('Trading pair.'),
    version: z.number().int().describe('params version to activate.'),
  },
  async ({ pair, version }) => {
    try { pairCfg(pair); return ok(await activateParams(pair, version)); } catch (e) { return fail(e); }
  }
);

server.tool(
  'rollback_params',
  'Rollback to a previous version: creates a new copy version (source=rollback) and activates it. The history is preserved.',
  {
    pair: z.string().describe('Trading pair.'),
    to_version: z.number().int().describe('The version to roll back to.'),
    reason: z.string().describe('Rollback reason (worsening avg_r/drawdowns).'),
  },
  async ({ pair, to_version, reason }) => {
    try { pairCfg(pair); return ok(await rollbackParams(pair, to_version, reason)); } catch (e) { return fail(e); }
  }
);

server.tool(
  'record_params_perf',
  'Record the performance of a params version over a window (for auto-rollback): n_trades, avg_r, max_drawdown_pct.',
  {
    params_version: z.number().int().describe('params version.'),
    window_from: z.string().describe('Evaluation window start (ISO).'),
    window_to: z.string().describe('Evaluation window end (ISO).'),
    n_trades: z.number().int().describe('Number of trades in the window.'),
    avg_r: z.number().optional().describe('Average R over the window.'),
    max_drawdown_pct: z.number().optional().describe('Max drawdown, %.'),
  },
  async (a) => {
    try {
      return ok(await recordParamsPerf(a.params_version,
        { from: a.window_from, to: a.window_to }, a));
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'log_reflection',
  'Record the reflection job output in the reflection_log journal (for human visibility in Telegram): a human-readable summary + optional full JSON report. Does NOT change the policy (the tick agent does not read it).',
  {
    pair: z.string().describe('Trading pair.'),
    summary: z.string().describe('Human-readable output: what was analyzed, conclusions, whether there are recommendations (goes to Telegram).'),
    payload: z.record(z.any()).optional().describe('Full JSON report (perf/recommendations) — optional, for history.'),
  },
  async ({ pair, summary, payload }) => {
    try { pairCfg(pair); return ok(await logReflection(pair, { summary, payload })); } catch (e) { return fail(e); }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
