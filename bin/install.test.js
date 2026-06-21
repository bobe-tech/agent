// install: initial seeding (seedParams — an idempotent seed of 4 pairs) and warmupCandles (candle warm-up).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { query, getPool } from '../core/db.js';
import { withTx, setupTestDb } from '../tests/db.js';
import { seedParams, warmupCandles } from './install.js';

setupTestDb();

test('seedParams creates active params for 4 pairs (long-only, version≥1001), idempotently', async () => {
  await withTx(async () => {
    await seedParams();
    const { rows } = await query(
      `SELECT pair, is_active, config->>'side_mode' AS side_mode, version FROM params ORDER BY pair`);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map((r) => r.pair).sort(), ['BTCB/USDT', 'CAKE/USDT', 'ETH/USDT', 'WBNB/USDT']);
    assert.ok(rows.every((r) => r.is_active === true));
    assert.ok(rows.every((r) => r.side_mode === 'long'));
    assert.ok(rows.every((r) => Number(r.version) >= 1001));
    // idempotency: a repeated call does not produce duplicates
    await seedParams();
    const { rows: again } = await query('SELECT count(*)::int AS c FROM params');
    assert.equal(again[0].c, 4);
  });
});

// Mock GeckoTerminal: ohlcv_list newest-first from n bars. getCandles → fetch → upsertCandles.
function mockGeckoFetch(n = 50, failFor = null) {
  return async (url) => {
    if (failFor && String(url).includes(failFor)) throw new Error('network down');
    const list = Array.from({ length: n }, (_, i) => [1_700_000_000 + i * 3600, 10, 11, 9, 10.5, 100]).reverse();
    return { ok: true, json: async () => ({ data: { attributes: { ohlcv_list: list } } }) };
  };
}

test('warmupCandles warms up candles for all config pairs (happy path)', async () => {
  await withTx(async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = mockGeckoFetch(30);
    try {
      await warmupCandles();
      const { rows } = await query("SELECT pair, count(*)::int AS n FROM candles WHERE tf='1h' GROUP BY pair");
      // All 4 config.json pairs should get candles.
      assert.equal(rows.length, 4);
      assert.ok(rows.every((r) => r.n === 30));
    } finally {
      globalThis.fetch = orig;
    }
  });
});

test('warmupCandles: a failure of one pair (ETH) does not derail the warm-up of the others', async () => {
  await withTx(async () => {
    const orig = globalThis.fetch;
    // Fail ONLY the ETH pool (the address is unique in config) — the other pairs should warm up.
    const ethPool = '0xbe141893e4c6ad9272e8c04bab7e6a10604501a5';
    globalThis.fetch = mockGeckoFetch(20, ethPool);
    try {
      await assert.doesNotReject(() => warmupCandles());
      const { rows } = await query("SELECT pair, count(*)::int AS n FROM candles WHERE tf='1h' GROUP BY pair ORDER BY pair");
      const pairs = rows.map((r) => r.pair);
      assert.deepEqual(pairs, ['BTCB/USDT', 'CAKE/USDT', 'WBNB/USDT'], 'three pairs warmed up, ETH did not');
      assert.ok(rows.every((r) => r.n === 20));
      assert.ok(!pairs.includes('ETH/USDT'), 'ETH has no candles — its fetch failed');
    } finally {
      globalThis.fetch = orig;
    }
  });
});

process.on('exit', () => { try { getPool().end(); } catch { /* already ended */ } });
