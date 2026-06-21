// refresh-candles: cron orchestration. Dependencies (getCandles/upsert/prune) are injected as mocks —
// no DB or network needed. We check: ok/fail counters, pruning only when ok>0, the exit code, isolation of a pair failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refreshCandles, exitCode } from './refresh-candles.mjs';

const pairs = { 'ETH/USDT': { base: 'ETH' }, 'BTCB/USDT': { base: 'BTCB' } };

test('success for all pairs: ok=N, fail=0, prune called once', async () => {
  let pruneCalls = 0;
  const res = await refreshCandles({
    pairs,
    keepDays: 30,
    deps: {
      getCandles: async () => [{ time: 1, open: 1, high: 1, low: 1, close: 1 }],
      upsertCandles: async () => 1,
      pruneOldCandles: async (tf, days) => { pruneCalls++; assert.equal(tf, '1h'); assert.equal(days, 30); return 7; },
    },
  });
  assert.deepEqual(res, { ok: 2, fail: 0, pruned: 7 });
  assert.equal(pruneCalls, 1);
});

test('a failure of one pair does not stop the others (ok=1, fail=1)', async () => {
  const res = await refreshCandles({
    pairs,
    deps: {
      getCandles: async (cfg) => {
        if (cfg.base === 'ETH') throw new Error('429 rate limit');
        return [{ time: 1, open: 1, high: 1, low: 1, close: 1 }];
      },
      upsertCandles: async () => 1,
      pruneOldCandles: async () => 3,
    },
  });
  assert.equal(res.ok, 1);
  assert.equal(res.fail, 1);
  assert.equal(res.pruned, 3, 'ok>0 → prune still runs');
});

test('total failure: ok=0 → prune is NOT called (we don\'t touch the DB)', async () => {
  let pruneCalls = 0;
  const res = await refreshCandles({
    pairs,
    deps: {
      getCandles: async () => { throw new Error('network down'); },
      upsertCandles: async () => 1,
      pruneOldCandles: async () => { pruneCalls++; return 0; },
    },
  });
  assert.equal(res.ok, 0);
  assert.equal(res.fail, 2);
  assert.equal(res.pruned, 0);
  assert.equal(pruneCalls, 0, 'prune skipped on a total failure');
});

test('exitCode: 1 only when ok=0 and there were failures', () => {
  assert.equal(exitCode(0, 2), 1, 'nothing updated, there were failures → 1');
  assert.equal(exitCode(0, 0), 0, 'no pairs at all → 0 (not a failure)');
  assert.equal(exitCode(2, 0), 0, 'all ok → 0');
  assert.equal(exitCode(1, 1), 0, 'partial success → 0');
});

test('empty pair list: ok=0, fail=0, prune not called', async () => {
  let pruneCalls = 0;
  const res = await refreshCandles({ pairs: {}, deps: { getCandles: async () => [], upsertCandles: async () => 0, pruneOldCandles: async () => { pruneCalls++; return 0; } } });
  assert.deepEqual(res, { ok: 0, fail: 0, pruned: 0 });
  assert.equal(pruneCalls, 0);
});
