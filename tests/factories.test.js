// Smoke tests of the foundation: the deterministic candle generator and the DB factories.
// They guarantee that the factories write schema-valid rows and that the generator is reproducible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../core/db.js';
import { withTx, setupTestDb } from './db.js';
import { makeCandles, toStoreBars, toBinanceList, BASE_TS } from './candles.js';
import {
  paramsConfig, seedParams, seedPosition, seedOrder, seedPositionWithOrders,
  seedTick, seedCandles, seedReflection, seedLesson, DEFAULT_PARAMS_CONFIG,
} from './factories.js';

setupTestDb();

test('makeCandles is deterministic: two calls produce identical series', () => {
  const a = makeCandles({ count: 50, pattern: 'realistic' });
  const b = makeCandles({ count: 50, pattern: 'realistic' });
  assert.deepEqual(a, b);
  assert.equal(a.length, 50);
  assert.equal(a[0].ts, BASE_TS);
  assert.equal(a[1].ts, BASE_TS + 3600);
});

test('makeCandles: high≥max(o,c), low≤min(o,c), ascending ts, prices positive', () => {
  for (const pattern of ['linear', 'down', 'saw', 'flat', 'realistic']) {
    const bars = makeCandles({ count: 40, pattern });
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      assert.ok(b.h >= Math.max(b.o, b.c) - 1e-9, `${pattern}: high≥max(o,c)`);
      assert.ok(b.l <= Math.min(b.o, b.c) + 1e-9, `${pattern}: low≤min(o,c)`);
      assert.ok(b.c > 0, `${pattern}: close>0`);
      if (i > 0) assert.ok(b.ts > bars[i - 1].ts, 'ts strictly increases');
    }
  }
});

test('toStoreBars / toBinanceList map keys and order', () => {
  const bars = makeCandles({ count: 3, pattern: 'linear' });
  const store = toStoreBars(bars);
  assert.deepEqual(Object.keys(store[0]), ['time', 'open', 'high', 'low', 'close', 'volume']);
  assert.equal(store[0].time, bars[0].ts);
  const klines = toBinanceList(bars);
  assert.equal(klines[0][0], bars[0].ts * 1000, 'binance ascending, ms openTime: the first = the first bar');
  assert.equal(klines.length, 3);
});

test('paramsConfig inherits the default and applies overrides', () => {
  const c = paramsConfig({ tp_mult: 1.7 });
  assert.equal(c.tp_mult, 1.7);
  assert.equal(c.side_mode, DEFAULT_PARAMS_CONFIG.side_mode);
  assert.deepEqual(c.sizes_usd, [20, 30, 50]);
});

test('seedParams creates an active version, a repeated seed deactivates the previous one', async () => {
  await withTx(async () => {
    const v1 = await seedParams('ETH/USDT');
    const v2 = await seedParams('ETH/USDT', { config: { tp_mult: 1.1 } });
    assert.ok(v2 > v1);
    const { rows } = await query('SELECT version, is_active FROM params WHERE pair=$1 ORDER BY version', ['ETH/USDT']);
    assert.equal(rows.find((r) => r.version === v1).is_active, false);
    assert.equal(rows.find((r) => r.version === v2).is_active, true);
  });
});

test('seedPosition + seedOrder write linked rows with valid FKs', async () => {
  await withTx(async () => {
    const pos = await seedPosition({ pair: 'BNB/USDT' });
    assert.equal(pos.pair, 'BNB/USDT');
    assert.equal(pos.status, 'active');
    const ord = await seedOrder({ position_id: pos.id, pair: 'BNB/USDT' });
    assert.equal(String(ord.position_id), String(pos.id));
    assert.equal(ord.action, 'open');
  });
});

test('seedPositionWithOrders creates a position and a set of orders', async () => {
  await withTx(async () => {
    const { position, orders } = await seedPositionWithOrders(
      { pair: 'CAKE/USDT', status: 'completed' },
      [{ action: 'open' }, { action: 'close', comp_amount: 25 }],
    );
    assert.equal(orders.length, 2);
    assert.ok(orders.every((o) => String(o.position_id) === String(position.id)));
  });
});

test('seedTick, seedReflection, seedLesson write rows', async () => {
  await withTx(async () => {
    const t = await seedTick({ pair: 'ETH/USDT', action: 'HOLD' });
    assert.equal(t.action, 'HOLD');
    const r = await seedReflection({ pair: 'ETH/USDT', summary: 'hello' });
    assert.equal(r.summary, 'hello');
    const l = await seedLesson({ pair: 'ETH/USDT', text: 'do not long in a downtrend' });
    assert.equal(l.active, true);
  });
});

test('seedCandles writes candles to the DB and reads them back', async () => {
  await withTx(async () => {
    await seedCandles('ETH/USDT', '1h', null, { count: 10, pattern: 'linear' });
    const { rows } = await query('SELECT count(*)::int AS n FROM candles WHERE pair=$1 AND tf=$2', ['ETH/USDT', '1h']);
    assert.equal(rows[0].n, 10);
  });
});
