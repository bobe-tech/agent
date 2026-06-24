// refresh-quotes: cron orchestration. Deps (getQuote/insert/prune) injected as mocks — no DB/twak.
// Checks: ok/fail counters, prune only when ok>0, exit code, per-pair isolation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refreshQuotes, exitCode } from './refresh-quotes.mjs';

const pairs = { 'ETH/USDT': { token: '0xeth' }, 'ADA/USDT': { token: '0xada' } };

test('success for all pairs: ok=N, fail=0, prune called once', async () => {
  let pruneCalls = 0;
  const res = await refreshQuotes({
    pairs, quoteAddr: '0xusdt', notionalUsd: 100, keepDays: 7,
    deps: {
      getQuote: async () => ({ bid: 1, ask: 2, mid: 1.5, notional: 100, ts: 1 }),
      insertQuote: async () => 1,
      pruneOldQuotes: async (days) => { pruneCalls++; assert.equal(days, 7); return 4; },
    },
  });
  assert.deepEqual(res, { ok: 2, fail: 0, pruned: 4 });
  assert.equal(pruneCalls, 1);
});

test('one pair failing does not stop the others (ok=1, fail=1)', async () => {
  const res = await refreshQuotes({
    pairs, quoteAddr: '0xusdt',
    deps: {
      getQuote: async (cfg) => { if (cfg.token === '0xeth') throw new Error('twak timeout'); return { bid: 1, ask: 2, mid: 1.5, notional: 100, ts: 1 }; },
      insertQuote: async () => 1,
      pruneOldQuotes: async () => 3,
    },
  });
  assert.equal(res.ok, 1);
  assert.equal(res.fail, 1);
  assert.equal(res.pruned, 3);
});

test('total failure: ok=0 -> prune NOT called', async () => {
  let pruneCalls = 0;
  const res = await refreshQuotes({
    pairs, quoteAddr: '0xusdt',
    deps: {
      getQuote: async () => { throw new Error('twak down'); },
      insertQuote: async () => 1,
      pruneOldQuotes: async () => { pruneCalls++; return 0; },
    },
  });
  assert.equal(res.ok, 0);
  assert.equal(res.fail, 2);
  assert.equal(res.pruned, 0);
  assert.equal(pruneCalls, 0);
});

test('exitCode: 1 only when ok=0 and there were failures', () => {
  assert.equal(exitCode(0, 2), 1);
  assert.equal(exitCode(0, 0), 0);
  assert.equal(exitCode(2, 0), 0);
  assert.equal(exitCode(1, 1), 0);
});
