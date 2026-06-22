// install: initial seeding (seedParams — an idempotent seed of all configured pairs) and warmupCandles (candle warm-up).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { query, getPool } from '../core/db.js';
import { withTx, setupTestDb } from '../tests/db.js';
import { seedParams, warmupCandles } from './install.js';

setupTestDb();

test('seedParams creates active params for all config pairs (long-only, version≥1001), idempotently', async () => {
  await withTx(async () => {
    await seedParams();
    const { rows } = await query(
      `SELECT pair, is_active, config->>'side_mode' AS side_mode, version FROM params ORDER BY pair`);
    assert.equal(rows.length, 5);
    assert.deepEqual(rows.map((r) => r.pair).sort(), ['ADA/USDT', 'ASTER/USDT', 'CAKE/USDT', 'ETH/USDT', 'XRP/USDT']);
    assert.ok(rows.every((r) => r.is_active === true));
    assert.ok(rows.every((r) => r.side_mode === 'long'));
    assert.ok(rows.every((r) => Number(r.version) >= 1001));
    // idempotency: a repeated call does not produce duplicates
    await seedParams();
    const { rows: again } = await query('SELECT count(*)::int AS c FROM params');
    assert.equal(again[0].c, 5);
  });
});

// Mock Binance klines: ascending [openTime_ms, o,h,l,c,v, closeTime_ms] from n bars. getCandles → fetch → upsertCandles.
function mockBinanceFetch(n = 50, failFor = null) {
  return async (url) => {
    if (failFor && String(url).includes(failFor)) throw new Error('network down');
    const list = Array.from({ length: n }, (_, i) => {
      const openMs = (1_700_000_000 + i * 3600) * 1000;
      return [openMs, 10, 11, 9, 10.5, 100, openMs + 3_599_999];
    });
    return { ok: true, json: async () => list };
  };
}

test('warmupCandles warms up candles for all config pairs (happy path)', async () => {
  await withTx(async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = mockBinanceFetch(30);
    try {
      await warmupCandles();
      const { rows } = await query("SELECT pair, count(*)::int AS n FROM candles WHERE tf='1h' GROUP BY pair");
      // All config.json pairs should get candles.
      assert.equal(rows.length, 5);
      assert.ok(rows.every((r) => r.n === 30));
    } finally {
      globalThis.fetch = orig;
    }
  });
});

test('warmupCandles: a failure of one pair (ETH) does not derail the warm-up of the others', async () => {
  await withTx(async () => {
    const orig = globalThis.fetch;
    // Fail ONLY the ETH symbol (unique in config) — the other pairs should warm up.
    globalThis.fetch = mockBinanceFetch(20, 'ETHUSDT');
    try {
      await assert.doesNotReject(() => warmupCandles());
      const { rows } = await query("SELECT pair, count(*)::int AS n FROM candles WHERE tf='1h' GROUP BY pair ORDER BY pair");
      const pairs = rows.map((r) => r.pair);
      assert.deepEqual(pairs, ['ADA/USDT', 'ASTER/USDT', 'CAKE/USDT', 'XRP/USDT'], 'the other pairs warmed up, ETH did not');
      assert.ok(rows.every((r) => r.n === 20));
      assert.ok(!pairs.includes('ETH/USDT'), 'ETH has no candles — its fetch failed');
    } finally {
      globalThis.fetch = orig;
    }
  });
});

process.on('exit', () => { try { getPool().end(); } catch { /* already ended */ } });
