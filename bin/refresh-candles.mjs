#!/usr/bin/env node
// Cron job: pulls 1h candles for all pairs from config.json (one request/pair, limit=1000 ≈ 41 days) and
// upserts them into the candles table; then it prunes stale rows. The API reads candles ONLY from the DB — the request path
// is decoupled from GeckoTerminal (no 429/502 on the user). Run: node --env-file-if-exists=.env bin/refresh-candles.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPool, getPool } from '../core/db.js';
import { getCandles } from '../core/market.js';
import { upsertCandles, pruneOldCandles } from '../core/candles-store.js';

const LIMIT = 1000; // GeckoTerminal maximum ≈ 41 days of 1h

// A non-zero exit code only if nothing got updated at all while there were failures (for cron monitoring).
export function exitCode(ok, fail) {
  return ok === 0 && fail > 0 ? 1 : 0;
}

// Pure orchestration (no createPool/exit) — testable with dependency injection.
// Sequential (not parallel) — gentler on the GeckoTerminal burst limit. A failure of one pair does not
// stop the others. Pruning only if something got updated (otherwise, on a total API failure
// we don't touch the DB). Returns counters { ok, fail, pruned }.
export async function refreshCandles({
  pairs,
  limit = LIMIT,
  keepDays = 45,
  deps = { getCandles, upsertCandles, pruneOldCandles },
  log = () => {},
} = {}) {
  let ok = 0;
  let fail = 0;
  let pruned = 0;
  for (const [pair, cfg] of Object.entries(pairs)) {
    try {
      const bars = await deps.getCandles(cfg, { timeframe: '1h', limit });
      await deps.upsertCandles(pair, '1h', bars);
      ok++;
      log(`✓ ${pair} 1h: ${bars.length} bars`);
    } catch (e) {
      fail++;
      log(`✗ ${pair} 1h: ${e.message}`);
    }
  }
  if (ok > 0) pruned = await deps.pruneOldCandles('1h', keepDays);
  return { ok, fail, pruned };
}

// Auto-run only when invoked directly as a script (not when imported in tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const config = JSON.parse(readFileSync(join(__dirname, '..', 'core', 'config.json'), 'utf8'));
  const keepDays = Number(process.env.CANDLES_KEEP_DAYS) || 45;
  createPool();
  // try/finally: whatever fails — the pool is ALWAYS closed, otherwise the process would hang.
  let res = { ok: 0, fail: 0, pruned: 0 };
  try {
    res = await refreshCandles({ pairs: config.pairs, keepDays, log: (m) => console.log(m) });
  } finally {
    await getPool().end();
  }
  console.log(`refresh-candles: ok=${res.ok} fail=${res.fail} pruned=${res.pruned}`);
  process.exit(exitCode(res.ok, res.fail));
}
