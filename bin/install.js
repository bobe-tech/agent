#!/usr/bin/env node
// bin/install.js — initial project seeding: params for all configured pairs (long-only) + candle warm-up.
// Run from bash/install.sh ONCE at deployment. Idempotent (params — NOT EXISTS by pair).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPool, getPool, query } from '../core/db.js';
import { getCandles } from '../core/market.js';
import { upsertCandles } from '../core/candles-store.js';
import { CRSI_BUY } from '../core/crsi-levels.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, '..', 'core', 'config.json'), 'utf8'));

export function configFor(pair) {
  const crsi_buy = CRSI_BUY[pair];
  if (crsi_buy == null) throw new Error(`configFor: no crsi_buy level for pair ${pair} (add it to core/crsi-levels.js)`);
  return {
    strategy: 'nostop_dca', side_mode: 'long',
    sizes_usd: [20, 30, 50], max_adds: 2,
    adx_mult_threshold: 30, adx_mult_lo: 1, adx_mult_hi: 1.3,
    avg2_atr_mult: 3, crsi_window_hours: 3, high_window_hours: 24,
    crsi_buy,
    crsi_rsi_period: 3, crsi_streak_period: 2, crsi_rank_period: 100,
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
