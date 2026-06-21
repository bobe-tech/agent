// Test data factories — the SINGLE source of defaults and row seeders for the test DB.
// Previously each test file had its own seedParams/seedPosition with diverging defaults
// (tp_mult=1.5 here, 1.3 there). Here the defaults are defined once, and the seeders write minimally
// valid rows for the schema (db/migrations). All inserts go through query() from core/db.js,
// so they transparently land in the test's ALS transaction and roll back together with it.
//
// Contract: call INSIDE withTx()/withTransaction() (otherwise the rows will stay in the DB).
import { query } from '../core/db.js';
import { upsertCandles } from '../core/candles-store.js';
import { makeCandles, toStoreBars } from './candles.js';

// The default strategy config. The single source of truth — all tests inherit from here.
// The values match the "sane" install.js seed (long-only, DCA 20/30/50, dynamic take).
export const DEFAULT_PARAMS_CONFIG = {
  strategy: 'nostop_dca',
  side_mode: 'long',
  sizes_usd: [20, 30, 50],
  tp_mult: 1.3,
  adx_lo: 20,
  adx_hi: 30,
  avg1_depth_mult_lo: 1.0,
  avg1_depth_mult_hi: 1.5,
  avg2_depth_mult: 2.0,
  max_adds: 2,
  crsi_buy: 15,
  crsi_sell: 85,
  crsi_rsi_period: 3,
  crsi_streak_period: 2,
  crsi_rank_period: 100,
  crsi_prev_max_age_min: 60,
};

// Build a strategy config on top of the default (without writing to the DB) — for unit tests of pure logic.
export function paramsConfig(overrides = {}) {
  return { ...DEFAULT_PARAMS_CONFIG, ...overrides };
}

// Seed an active params version for a pair. Deactivates previous active rows (to bypass params_one_active).
// Returns version (number).
export async function seedParams(pair = 'ETH/USDT', { config = {}, source = 'seed', parent_version = null, reason = null } = {}) {
  await query('UPDATE params SET is_active=false WHERE pair=$1 AND is_active', [pair]);
  const { rows } = await query(
    `INSERT INTO params (pair, is_active, config, source, parent_version, reason)
     VALUES ($1, true, $2::jsonb, $3, $4, $5) RETURNING version`,
    [pair, JSON.stringify(paramsConfig(config)), source, parent_version, reason],
  );
  return rows[0].version;
}

// Ensure an active version exists for a pair: return the existing one or create it.
async function ensureParamsVersion(pair, params_version) {
  if (params_version != null) return params_version;
  const { rows } = await query('SELECT version FROM params WHERE pair=$1 AND is_active LIMIT 1', [pair]);
  return rows[0]?.version ?? (await seedParams(pair));
}

// Seed a position. By default — an active LONG with an average price of 2000 and a base of $20.
// If params_version is not passed — the pair's active version is taken (created if needed).
export async function seedPosition({
  pair = 'ETH/USDT',
  side = 'LONG',
  status = 'active',
  opened_size = 0.01,
  opened_amount = 20,
  opened_price = 2000,
  closed_size = null,
  closed_amount = null,
  closed_price = null,
  realized_pnl_usd = null,
  realized_pnl_pct = null,
  reason = null,
  force_closed = false,
  regime_at_entry = 'UP_TREND',
  features_at_entry = {},
  expected_move_pct = 1.3,
  params_version = null,
} = {}) {
  const v = await ensureParamsVersion(pair, params_version);
  const { rows } = await query(
    `INSERT INTO positions (
       pair, side, status, opened_size, opened_amount, opened_price,
       closed_size, closed_amount, closed_price, realized_pnl_usd, realized_pnl_pct,
       reason, force_closed, regime_at_entry, features_at_entry, expected_move_pct, params_version, status_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17, now())
     RETURNING *`,
    [pair, side, status, opened_size, opened_amount, opened_price,
      closed_size, closed_amount, closed_price, realized_pnl_usd, realized_pnl_pct,
      reason, force_closed, regime_at_entry, JSON.stringify(features_at_entry), expected_move_pct, v],
  );
  return rows[0];
}

// Seed an order for a position. By default — a completed open order, filled as planned.
export async function seedOrder({
  position_id,
  pair = 'ETH/USDT',
  side = 'LONG',
  action = 'open',
  status = 'completed',
  start_size = 0.01,
  start_amount = 20,
  start_price = 2000,
  comp_size = 0.01,
  comp_amount = 20,
  comp_price = 2000,
  tx_id = null,
  params_version = null,
  quote = null,
  reason = null,
} = {}) {
  if (position_id == null) throw new Error('seedOrder: position_id is required');
  const v = await ensureParamsVersion(pair, params_version);
  const { rows } = await query(
    `INSERT INTO orders (
       position_id, pair, side, action, status, start_size, start_amount, start_price,
       comp_size, comp_amount, comp_price, tx_id, params_version, quote, reason, status_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15, now())
     RETURNING *`,
    [position_id, pair, side, action, status, start_size, start_amount, start_price,
      comp_size, comp_amount, comp_price, tx_id, v, quote == null ? null : JSON.stringify(quote), reason],
  );
  return rows[0];
}

// A convenient composite: a position + its orders in one call. orders — an array of partial overrides.
export async function seedPositionWithOrders(position = {}, orders = [{ action: 'open' }]) {
  const pos = await seedPosition(position);
  const made = [];
  for (const o of orders) {
    made.push(await seedOrder({ position_id: pos.id, pair: pos.pair, side: pos.side, params_version: pos.params_version, ...o }));
  }
  return { position: pos, orders: made };
}

// Seed a tick_log row. By default — a HOLD in UP_TREND. ts can be given as a string/Date for windows.
export async function seedTick({
  pair = 'ETH/USDT',
  ts = null,
  regime = 'UP_TREND',
  action = 'HOLD',
  close = 2000,
  atr_pct = 1.5,
  sma20 = 1990,
  sma50 = 1950,
  adx = 25,
  crsi = 50,
  hh20 = null, ll20 = null, hh50 = null, ll50 = null,
  expected_move_pct = null,
  confidence = 0.6,
  reason = 'test tick',
  position_id = null,
  params_version = null,
  live_bid = null,
  live_ask = null,
  raw_decision = { action: 'HOLD' },
} = {}) {
  const v = await ensureParamsVersion(pair, params_version);
  const { rows } = await query(
    `INSERT INTO tick_log (
       pair, ts, regime, action, close, atr_pct, sma20, sma50, adx, crsi,
       hh20, ll20, hh50, ll50, expected_move_pct, confidence, reason,
       position_id, params_version, live_bid, live_ask, raw_decision)
     VALUES ($1, COALESCE($2::timestamptz, now()), $3,$4,$5,$6,$7,$8,$9,$10,
       $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb)
     RETURNING *`,
    [pair, ts, regime, action, close, atr_pct, sma20, sma50, adx, crsi,
      hh20, ll20, hh50, ll50, expected_move_pct, confidence, reason,
      position_id, v, live_bid, live_ask, JSON.stringify(raw_decision)],
  );
  return rows[0];
}

// Seed candles in the DB (via upsertCandles). bars — canonical {ts,o,h,l,c,v} (from makeCandles by default).
export async function seedCandles(pair = 'ETH/USDT', tf = '1h', bars = null, candleOpts = {}) {
  const rows = bars ?? makeCandles(candleOpts);
  await upsertCandles(pair, tf, toStoreBars(rows));
  return rows;
}

// Seed reflection_log.
export async function seedReflection({ pair = 'ETH/USDT', ts = null, summary = 'reflection summary', payload = null } = {}) {
  const { rows } = await query(
    `INSERT INTO reflection_log (pair, ts, summary, payload)
     VALUES ($1, COALESCE($2::timestamptz, now()), $3, $4::jsonb) RETURNING *`,
    [pair, ts, summary, payload == null ? null : JSON.stringify(payload)],
  );
  return rows[0];
}

// Seed a lesson (lessons).
export async function seedLesson({ pair = 'ETH/USDT', regime = null, text = 'test lesson', confidence = 0.5, active = true } = {}) {
  const { rows } = await query(
    `INSERT INTO lessons (pair, regime, text, confidence, active) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [pair, regime, text, confidence, active],
  );
  return rows[0];
}
