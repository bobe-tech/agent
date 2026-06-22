#!/usr/bin/env node
// bin/install.js — initial project seeding: params for all configured pairs (long-only) + candle warm-up.
// Run from bash/install.sh ONCE at deployment. Idempotent (params — NOT EXISTS by pair).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPool, getPool, query } from '../core/db.js';
import { getCandles } from '../core/market.js';
import { upsertCandles } from '../core/candles-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, '..', 'core', 'config.json'), 'utf8'));

// per-pair CRSI thresholds (approved by the customer, calibrated on H1).
const CRSI = {
  'ETH/USDT':   { buy: 13,   sell: 87.5 },
  'ASTER/USDT': { buy: 20,   sell: 70 },   // TODO calibrate on H1 history
  'ADA/USDT':   { buy: 20,   sell: 70 },   // TODO calibrate on H1 history
  'XRP/USDT':   { buy: 20,   sell: 70 },   // TODO calibrate on H1 history
  'CAKE/USDT':  { buy: 19.5, sell: 78 },
};

function configFor(pair) {
  const c = CRSI[pair];
  return {
    strategy: 'nostop_dca', side_mode: 'long',
    sizes_usd: [20, 30, 50], tp_mult: 1.3, adx_lo: 16, adx_hi: 30,
    avg1_depth_mult_lo: 0.6667, avg1_depth_mult_hi: 1.0, avg2_depth_mult: 3.0, max_adds: 2,
    crsi_buy: c.buy, crsi_sell: c.sell,
    crsi_rsi_period: 3, crsi_streak_period: 2, crsi_rank_period: 100, crsi_prev_max_age_min: 60,
  };
}

// Idempotent seed of active params for all config.json pairs.
export async function seedParams() {
  for (const pair of Object.keys(config.pairs)) {
    await query(
      `INSERT INTO params (pair, is_active, source, reason, config)
       SELECT $1::text, true, 'seed', 'install', $2::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM params WHERE pair=$1::text)`,
      [pair, JSON.stringify(configFor(pair))]);
  }
}

// Warm-up: pull 1h candles for all pairs and upsert into candles (so indicators compute right away).
export async function warmupCandles() {
  for (const [pair, cfg] of Object.entries(config.pairs)) {
    try {
      const bars = await getCandles(cfg, { timeframe: '1h', limit: 1000 });
      const rows = await upsertCandles(pair, '1h', bars);
      console.log(`[install] ${pair}: candles upserted ${rows}`);
    } catch (e) {
      console.error(`[install] ${pair}: candle warm-up failed (${e.message}) — the cron will catch up`);
    }
  }
}

async function main() {
  createPool();
  try {
    await seedParams();
    console.log('[install] params seeded (all configured pairs, long-only)');
    await warmupCandles();
    console.log('[install] done');
  } finally {
    await getPool().end();
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error('[install] error', e); process.exit(1); });
}
