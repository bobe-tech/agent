import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFeatures, normalize, freshPrev, getCandles, getMarket } from './market.js';
import { getPool } from '../core/db.js';
import { withTx, setupTestDb } from '../tests/db.js';
import { seedCandles } from '../tests/factories.js';
import { makeCandles } from '../tests/candles.js';

// 60 H1 bars, ts stepping by 3600 (UTC seconds); close = 101+i.
const bars = Array.from({ length: 60 }, (_, i) => ({
  ts: 1_700_000_000 + i * 3600, o: 100 + i, h: 102 + i, l: 99 + i, c: 101 + i, v: 1,
}));

test('anti-repaint: last bar is NOT closed → dropped (we take the one before)', () => {
  const last = bars.at(-1);
  // now within the interval of the last bar → it's still forming
  const f = computeFeatures(bars, { now_sec: last.ts + 100, period: 3600, slope_lag: 3 });
  assert.equal(f.last_raw_closed, false);
  assert.equal(f.latest_bar.close, bars.at(-2).c);   // decision on the previous closed bar
});

test('anti-repaint: last bar is closed → used', () => {
  const last = bars.at(-1);
  const f = computeFeatures(bars, { now_sec: last.ts + 7200, period: 3600, slope_lag: 3 });
  assert.equal(f.last_raw_closed, true);
  assert.equal(f.latest_bar.close, last.c);
});

test('boundary exactly at ts+period → the bar counts as closed (>=)', () => {
  const last = bars.at(-1);
  const f = computeFeatures(bars, { now_sec: last.ts + 3600, period: 3600, slope_lag: 3 });
  assert.equal(f.last_raw_closed, true);
  assert.equal(f.latest_bar.close, last.c);
});

test('output completeness: all strategy fields present (crsi instead of rsi)', () => {
  const f = computeFeatures(bars, { now_sec: bars.at(-1).ts + 3600, period: 3600, slope_lag: 3 });
  for (const k of ['latest_bar', 'close', 'atr_pct', 'daily_vol_pct', 'monthly_vol_pct',
                   'crsi', 'crsi_live_close', 'sma20', 'sma50', 'sma20_prev',
                   'hh20', 'll20', 'hh50', 'll50', 'adx']) {
    assert.ok(k in f, `missing field ${k}`);
  }
  assert.ok(!('rsi' in f) && !('rsi_prev' in f), 'rsi/rsi_prev should be removed');
  assert.ok(f.adx !== null, 'adx should be computed on 60 bars');
});

test('daily volatility: on a long series dv/mv are computed, mv≈dv·√30', () => {
  // 480 H1 bars (~20 days) with a slight saw so TR is non-zero
  const long = Array.from({ length: 480 }, (_, i) => {
    const base = 1000 + (i % 24);           // intraday saw
    return { ts: 1_700_000_000 + i * 3600, o: base, h: base + 3, l: base - 3, c: base + 1, v: 1 };
  });
  const f = computeFeatures(long, { now_sec: long.at(-1).ts + 3600, period: 3600 });
  assert.ok(f.daily_vol_pct !== null && Number.isFinite(f.daily_vol_pct), 'dv should be computed (≥15 closed days)');
  assert.ok(f.monthly_vol_pct !== null, 'mv should be computed');
  assert.ok(Math.abs(f.monthly_vol_pct - f.daily_vol_pct * Math.sqrt(30)) < 1e-9, 'mv = dv·√30');
});

test('crsi: computed on a long series and within [0,100]', () => {
  const long = Array.from({ length: 480 }, (_, i) => {
    const base = 1000 + (i % 24);
    return { ts: 1_700_000_000 + i * 3600, o: base, h: base + 3, l: base - 3, c: base + 1, v: 1 };
  });
  const f = computeFeatures(long, {
    now_sec: long.at(-1).ts + 3600, period: 3600,
    crsi_periods: { rsi_period: 3, streak_period: 2, rank_period: 100 },
  });
  assert.ok(f.crsi !== null && f.crsi >= 0 && f.crsi <= 100, `crsi outside [0,100]: ${f.crsi}`);
});

test('crsi: current price — the close of the UNclosed H1 bar', () => {
  const long = Array.from({ length: 480 }, (_, i) => {
    const base = 1000 + (i % 24);
    return { ts: 1_700_000_000 + i * 3600, o: base, h: base + 3, l: base - 3, c: base + 1, v: 1 };
  });
  // now within the last bar → it's still forming, its close = the current price
  const f = computeFeatures(long, {
    now_sec: long.at(-1).ts + 100, period: 3600,
    crsi_periods: { rsi_period: 3, streak_period: 2, rank_period: 100 },
  });
  assert.equal(f.last_raw_closed, false);
  assert.equal(f.crsi_live_close, long.at(-1).c);
});

test('crsi: null on a short series (not enough for rank_period)', () => {
  const f = computeFeatures(bars, { now_sec: bars.at(-1).ts + 3600, period: 3600 });
  assert.equal(f.crsi, null);   // 60 bars < rank_period(100)+2
});

test('empty input → error', () => {
  assert.throws(() => computeFeatures([], { now_sec: 1, period: 3600 }), /no candles/);
});

test('normalize: ms→sec, ascending, drop malformed rows', () => {
  const raw = [[3_600_000, 1, 2, 0.5, 1.5, 9], [0, 1, 2, 0.5, 1.5, 9], ['x', 1, 2, 3, 4, 5]];
  const out = normalize(raw);
  assert.equal(out.length, 2);                 // malformed row dropped
  assert.equal(out[0].ts, 0);
  assert.equal(out[1].ts, 3600);               // 3_600_000 ms → 3600 s (open time)
  assert.ok(out[0].ts < out[1].ts);            // ascending
});

test('freshPrev: a fresh value (20 min) is accepted', () => {
  const now = 1_700_000_000_000;
  const r = freshPrev({ crsi: 42, ts: new Date(now - 20 * 60000).toISOString() }, now, 60);
  assert.equal(r.crsi_prev, 42);
  assert.ok(Math.abs(r.crsi_prev_age_min - 20) < 1e-6);
});

test('freshPrev: stale (90 min) → null, age is returned', () => {
  const now = 1_700_000_000_000;
  const r = freshPrev({ crsi: 42, ts: new Date(now - 90 * 60000).toISOString() }, now, 60);
  assert.equal(r.crsi_prev, null);
  assert.ok(Math.abs(r.crsi_prev_age_min - 90) < 1e-6);
});

test('freshPrev: no data → {null, null}', () => {
  assert.deepEqual(freshPrev(undefined, 1, 60), { crsi_prev: null, crsi_prev_age_min: null });
  assert.deepEqual(freshPrev({ crsi: null, ts: null }, 1, 60), { crsi_prev: null, crsi_prev_age_min: null });
});

test('getCandles: maps interval, normalizes and returns ascending {time,open,high,low,close}', async () => {
  const origFetch = globalThis.fetch;
  let capturedUrl = '';
  // Binance returns ascending klines [openTime_ms, o,h,l,c,v, closeTime_ms, ...]; getCandles returns
  // ascending by time in Unix seconds.
  globalThis.fetch = async (url) => {
    capturedUrl = String(url);
    return {
      ok: true,
      json: async () => ([
        [1_000_000, 10, 11, 9, 10.5, 90, 1_003_599_999],
        [2_000_000, 11, 12, 10, 11.5, 100, 2_003_599_999],
      ]),
    };
  };
  try {
    const pairCfg = { symbol: 'ETHUSDT', base: 'ETH', quote: 'USDT', token: '0xtok' };
    const bars = await getCandles(pairCfg, { timeframe: '4h', limit: 50 });
    assert.deepEqual(bars, [
      { time: 1000, open: 10, high: 11, low: 9, close: 10.5, volume: 90 },
      { time: 2000, open: 11, high: 12, low: 10, close: 11.5, volume: 100 },
    ]);
    assert.match(capturedUrl, /symbol=ETHUSDT/);
    assert.match(capturedUrl, /interval=4h&limit=50/);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('getCandles: empty klines → empty array (no crash)', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ([]) });
  try {
    const bars = await getCandles({ symbol: 'ETHUSDT' }, { timeframe: '1h', limit: 10 });
    assert.deepEqual(bars, []);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('getCandles: transient failure (HTTP 500) → retry → success on the 2nd attempt', async () => {
  const origFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return { ok: false, status: 500, json: async () => ({}) }; // first attempt fails
    return { ok: true, json: async () => ([[1_000_000, 1, 2, 0.5, 1.5, 9, 1_003_599_999]]) };
  };
  try {
    const bars = await getCandles({ symbol: 'ETHUSDT' }, { timeframe: '1h', limit: 10 });
    assert.equal(calls, 2, 'there should be exactly one retry');
    assert.deepEqual(bars, [{ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 9 }]);
  } finally {
    globalThis.fetch = origFetch;
  }
});
// NOTE: the 429 path (12s pause) is deliberately not exercised — too slow for a unit test; the backoff
// logic is the same, only the pause duration differs (see fetchJson in market.js).

// --- getMarket end-to-end: reads candles from the DB, resamples, computes features ---

setupTestDb();

test('getMarket(H1): from DB candles computes the full feature set + pair metadata', async () => {
  await withTx(async () => {
    const bars = makeCandles({ count: 160, pattern: 'realistic', base: 2000, step: 2 });
    await seedCandles('ETH/USDT', '1h', bars);
    const nowSec = bars.at(-1).ts + 3600; // last bar closed
    const m = await getMarket(
      { base: 'ETH', quote: 'USDT', token: '0xabc' },
      { timeframe: 'H1', limit: 720, now_sec: nowSec },
    );
    assert.equal(m.base, 'ETH');
    assert.equal(m.quote, 'USDT');
    assert.equal(m.token_address, '0xabc');
    assert.equal(typeof m.close, 'number');
    assert.equal(typeof m.sma20, 'number');
    assert.ok(m.crsi >= 0 && m.crsi <= 100, 'CRSI in [0,100] on a long series');
    assert.ok('adx' in m && 'atr_pct' in m);
  });
});

test('getMarket(H4): resample 1h→4h from the DB, features are computed', async () => {
  await withTx(async () => {
    const bars = makeCandles({ count: 480, pattern: 'realistic', base: 300, step: 0.5 });
    await seedCandles('WBNB/USDT', '1h', bars);
    const nowSec = bars.at(-1).ts + 4 * 3600;
    const m = await getMarket(
      { base: 'WBNB', quote: 'USDT', token: '0xb' },
      { timeframe: 'H4', limit: 200, now_sec: nowSec },
    );
    assert.equal(typeof m.close, 'number');
    assert.ok(m.latest_bar.ts % 14400 === 0, 'the H4 bar is aligned to the 4-hour UTC bucket');
  });
});

process.on('exit', () => { try { getPool().end(); } catch { /* already ended */ } });
