#!/usr/bin/env node
// bin/tick-gate.mjs — cheap pre-filter run BEFORE the LLM tick (bash/start-pair.sh).
// Computes the same market features the agent sees, checks the NECESSARY ATR condition of the only
// possible action (entry when flat; averaging/take-profit when in a position), and:
//   • prints "SKIP" + writes a HOLD tick_log row (source='prefilter') when no action is possible → the agent is not run;
//   • prints "RUN" otherwise → start-pair.sh launches the agent as usual.
// ONLY the decision token ("RUN"/"SKIP") goes to stdout (bash captures it); diagnostics go to stderr.
// Fail-open: any error → "RUN" (never miss a trade because the gate stumbled).
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createPool, getPool, query } from '../core/db.js';
import { getMarket, marketParamsFromConfig } from '../core/market.js';
import { crsiMinOverWindow, logTick } from '../mcp/account.js';
import { gateDecision, regimeLabel } from '../core/tick-gate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.error('[tick-gate]', ...a); // stderr — stdout is reserved for the decision

function loadEnv() {
  try { process.loadEnvFile?.(join(__dirname, '..', '.env')); } catch { /* .env optional */ }
}

// Live twak bid for selling `baseAmount` of the base token → USDT (same source the agent quotes).
// Returns price per 1 base (USDT), or null on any failure (→ fail-open RUN).
function fetchBid(tokenAddress, baseAmount) {
  if (!(Number(baseAmount) > 0)) return null;
  try {
    const out = execFileSync(
      'twak',
      ['swap', String(baseAmount), tokenAddress, 'USDT', '--chain', 'bsc', '--quote-only', '--json'],
      { encoding: 'utf8', timeout: 60000 });
    const q = JSON.parse(out);
    // Defence-in-depth: only trust the quote if the proceeds are actually in USDT — a wrong-unit/decimals
    // quote could otherwise yield a wrong-LOW bid and cause a bad SKIP. On mismatch → null → fail-open RUN.
    if (!String(q.output).trim().endsWith('USDT')) { log('unexpected quote output unit:', q.output); return null; }
    const usdtOut = parseFloat(String(q.output));     // e.g. "19.79... USDT"
    const baseIn = parseFloat(String(q.input));       // e.g. "0.012 ETH"
    if (!(usdtOut > 0) || !(baseIn > 0)) return null;
    return usdtOut / baseIn;
  } catch (e) {
    log('twak quote failed:', e.message);
    return null;
  }
}

async function main() {
  loadEnv();
  createPool();

  const pair = process.env.PAIR || 'ETH/USDT';
  const config = JSON.parse(readFileSync(join(__dirname, '..', 'core', 'config.json'), 'utf8'));
  const pairCfg = config.pairs[pair];
  if (!pairCfg) throw new Error(`unknown pair: ${pair}`);

  // Active params (same source as the get_market MCP handler).
  const { rows: pr } = await query('SELECT version, config FROM params WHERE pair=$1 AND is_active LIMIT 1', [pair]);
  const params_version = pr[0]?.version ?? null;
  const c = pr[0]?.config || {};
  const { crsi_periods, adx_mult, high_window_hours, crsi_window_hours } = marketParamsFromConfig(c);

  const market = await getMarket(pairCfg, { crsi_periods, adx_mult, high_window_hours });
  const crsi_min_3h = await crsiMinOverWindow(pair, crsi_window_hours);

  // Open position (at most one active per pair) + its orders.
  const { rows: positions } = await query(
    `SELECT * FROM positions WHERE pair=$1 AND status='active' ORDER BY id DESC LIMIT 1`, [pair]);
  const position = positions[0] || null;
  if (position) {
    const { rows: orders } = await query(`SELECT * FROM orders WHERE position_id=$1 ORDER BY id`, [position.id]);
    position.orders = orders;
  }

  const decision = await gateDecision({
    position,
    market,
    config: c,
    fetchBid: () => fetchBid(pairCfg.token, position?.opened_size),
  });

  log(`${pair}: ${decision.decision} (${decision.branch}) — ${decision.reason}`);

  if (decision.decision === 'SKIP') {
    if (params_version == null) { log('no active params → fail-open RUN'); console.log('RUN'); return; }
    const regime = regimeLabel(market, c);
    await logTick(pair, {
      action: 'HOLD',
      regime,
      source: 'prefilter',
      reason: decision.reason,
      confidence: 0,
      params_version,
      position_id: position?.id ?? null,
      live_bid: decision.checks?.bid ?? null,
      features: {
        close: market.close, live_close: market.live_close, high_24h: market.high_24h,
        atr_pct: market.atr_pct, daily_vol_pct: market.daily_vol_pct, adx: market.adx, adx_mult: market.adx_mult,
        // crsi MUST be written on every tick (incl. gate SKIPs): future ticks read crsi_min_3h from
        // tick_log. A null crsi here is harmless — crsiMinOverWindow() filters `crsi IS NOT NULL`.
        crsi: market.crsi, crsi_min_3h, fng: null, btc_dom: null,
      },
      gate: { branch: decision.branch, checks: decision.checks }, // stored inside raw_decision
    });
    console.log('SKIP');
    return;
  }

  console.log('RUN');
}

main()
  .catch((e) => { log('fail-open RUN due to error:', e.message); console.log('RUN'); })
  .finally(() => { try { getPool()?.end?.(); } catch { /* ignore */ } });
