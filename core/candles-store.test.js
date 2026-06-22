// candles-store: writing/reading candles in the DB. Focus — readCandles (DESC→reverse→ascending,
// NUMERIC→Number, limit) and the round-trip upsert→read. upsert/prune are also covered in api/tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPool } from '../core/db.js';
import { withTx, setupTestDb } from '../tests/db.js';
import { upsertCandles, readCandles, pruneOldCandles } from './candles-store.js';
import { makeCandles, toStoreBars } from '../tests/candles.js';

setupTestDb();

test('readCandles: ascending by ts, last `limit` bars, numeric fields', async () => {
  await withTx(async () => {
    const bars = makeCandles({ count: 5, pattern: 'linear', base: 100, step: 1 });
    await upsertCandles('ZZZ/TEST', '1h', toStoreBars(bars));

    const read = await readCandles('ZZZ/TEST', '1h', 3); // last 3
    assert.equal(read.length, 3);
    // limit takes the latest by ts (DESC LIMIT) → then reverse → ascending: bars 3,4,5 of the series.
    assert.deepEqual(read.map((b) => b.ts), [bars[2].ts, bars[3].ts, bars[4].ts]);
    // Fields are coerced to Number (NUMERIC from pg arrives as a string).
    assert.equal(typeof read[0].o, 'number');
    assert.equal(typeof read[0].c, 'number');
    assert.equal(read[0].c, bars[2].c);
    assert.deepEqual(Object.keys(read[0]).sort(), ['c', 'h', 'l', 'o', 'ts', 'v'].sort());
  });
});

test('readCandles: volume=null is preserved as null, not Number(null)=0', async () => {
  await withTx(async () => {
    await upsertCandles('ZZZ/TEST', '1h', [{ time: 1704067200, open: 1, high: 2, low: 0.5, close: 1.5, volume: null }]);
    const read = await readCandles('ZZZ/TEST', '1h', 1);
    assert.equal(read[0].v, null);
  });
});

test('readCandles: empty result for an unknown pair', async () => {
  await withTx(async () => {
    const read = await readCandles('NOPE/TEST', '1h', 10);
    assert.deepEqual(read, []);
  });
});

test('upsertCandles round-trip: re-insert updates close, does not multiply rows', async () => {
  await withTx(async () => {
    const ts = 1704067200;
    await upsertCandles('ZZZ/TEST', '1h', [{ time: ts, open: 1, high: 1, low: 1, close: 1, volume: 10 }]);
    const n1 = await upsertCandles('ZZZ/TEST', '1h', [{ time: ts, open: 1, high: 3, low: 0.5, close: 2, volume: 25 }]);
    assert.ok(n1 >= 1);
    const read = await readCandles('ZZZ/TEST', '1h', 10);
    assert.equal(read.length, 1, 'same (pair,tf,ts) — an update, not a duplicate');
    assert.equal(read[0].c, 2);
    assert.equal(read[0].v, 25, 'volume is stored and updated on re-insert');
  });
});

test('upsertCandles: duplicate ts in one batch — deduped (last wins), no ON CONFLICT crash', async () => {
  await withTx(async () => {
    const ts = 1704067200;
    // A candle source can return two bars with the same open timestamp. A single
    // INSERT ... ON CONFLICT must not touch the same (pair,tf,ts) twice, so the batch is deduped.
    const n = await upsertCandles('ZZZ/TEST', '1h', [
      { time: ts, open: 1, high: 1, low: 1, close: 1 },
      { time: ts, open: 2, high: 3, low: 0.5, close: 2 }, // same ts, later in the array → wins
      { time: ts + 3600, open: 5, high: 5, low: 5, close: 5 },
    ]);
    assert.ok(n >= 1);
    const read = await readCandles('ZZZ/TEST', '1h', 10);
    assert.equal(read.length, 2, 'two distinct ts, the duplicate is collapsed');
    assert.equal(read[0].c, 2, 'the last bar for the duplicated ts wins');
  });
});

test('upsertCandles: empty array → 0 rows, no query', async () => {
  await withTx(async () => {
    assert.equal(await upsertCandles('ZZZ/TEST', '1h', []), 0);
    assert.equal(await upsertCandles('ZZZ/TEST', '1h', null), 0);
  });
});

test('pruneOldCandles deletes rows older than N days, keeps fresh ones', async () => {
  await withTx(async () => {
    const now = Math.floor(Date.now() / 1000);
    const oldTs = now - 100 * 86400;
    const freshTs = now - 1 * 86400;
    await upsertCandles('ZZZ/TEST', '1h', [
      { time: oldTs, open: 1, high: 1, low: 1, close: 1 },
      { time: freshTs, open: 2, high: 2, low: 2, close: 2 },
    ]);
    const removed = await pruneOldCandles('1h', 45);
    assert.ok(removed >= 1);
    const read = await readCandles('ZZZ/TEST', '1h', 10);
    const tss = read.map((b) => b.ts);
    assert.ok(tss.includes(freshTs));
    assert.ok(!tss.includes(oldTs));
  });
});

process.on('exit', () => { try { getPool().end(); } catch { /* already ended */ } });
