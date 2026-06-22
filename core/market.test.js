import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFeatures, normalize, getCandles, getMarket } from './market.js';
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
  const f = computeFeatures(bars, { now_sec: last.ts + 100, period: 3600 });
  assert.equal(f.last_raw_closed, false);
  assert.equal(f.latest_bar.close, bars.at(-2).c);   // decision on the previous closed bar
});

test('anti-repaint: last bar is closed → used', () => {
  const last = bars.at(-1);
  const f = computeFeatures(bars, { now_sec: last.ts + 7200, period: 3600 });
  assert.equal(f.last_raw_closed, true);
  assert.equal(f.latest_bar.close, last.c);
});

test('boundary exactly at ts+period → the bar counts as closed (>=)', () => {
  const last = bars.at(-1);
  const f = computeFeatures(bars, { now_sec: last.ts + 3600, period: 3600 });
  assert.equal(f.last_raw_closed, true);
  assert.equal(f.latest_bar.close, last.c);
});

test('output completeness: new strategy fields present, old ones removed', () => {
  const f = computeFeatures(bars, { now_sec: bars.at(-1).ts + 3600, period: 3600 });
  for (const k of ['latest_bar', 'close', 'live_close', 'high_24h', 'atr_pct',
                   'daily_vol_pct', 'adx', 'adx_mult', 'crsi']) {
    assert.ok(k in f, `missing field ${k}`);
  }
  for (const gone of ['sma20', 'sma50', 'sma20_prev', 'hh20', 'll20', 'hh50', 'll50',
                      'monthly_vol_pct', 'crsi_live_close', 'rsi', 'rsi_prev']) {
    assert.ok(!(gone in f), `field ${gone} should be removed`);
  }
});

test('daily volatility: on a long series dv is computed', () => {
  // 480 H1 bars (~20 days) with a slight saw so TR is non-zero
  const long = Array.from({ length: 480 }, (_, i) => {
    const base = 1000 + (i % 24);           // intraday saw
    return { ts: 1_700_000_000 + i * 3600, o: base, h: base + 3, l: base - 3, c: base + 1, v: 1 };
  });
  const f = computeFeatures(long, { now_sec: long.at(-1).ts + 3600, period: 3600 });
  assert.ok(f.daily_vol_pct !== null && Number.isFinite(f.daily_vol_pct), 'dv should be computed (≥15 closed days)');
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

test('live_close: close of the latest candle in the DB (forming bar when open)', () => {
  const long = Array.from({ length: 480 }, (_, i) => {
    const base = 1000 + (i % 24);
    return { ts: 1_700_000_000 + i * 3600, o: base, h: base + 3, l: base - 3, c: base + 1, v: 1 };
  });
  const f = computeFeatures(long, { now_sec: long.at(-1).ts + 100, period: 3600 });
  assert.equal(f.last_raw_closed, false);
  assert.equal(f.live_close, long.at(-1).c);   // forming bar close = current price
});

test('crsi: null on a short series (not enough for rank_period)', () => {
  const f = computeFeatures(bars, { now_sec: bars.at(-1).ts + 3600, period: 3600 });
  assert.equal(f.crsi, null);   // 60 bars < rank_period(100)+2
});

test('empty input → error', () => {
  assert.throws(() => computeFeatures([], { now_sec: 1, period: 3600 }), /no candles/);
});

test('adx_mult and high_24h are computed from bars + config', () => {
  const up = Array.from({ length: 60 }, (_, i) => ({ ts: 1_700_000_000 + i * 3600, o: 100 + i, h: 102 + i, l: 99 + i, c: 101 + i, v: 1 }));
  const f = computeFeatures(up, {
    now_sec: up.at(-1).ts + 3600, period: 3600,
    adx_mult: { threshold: 30, lo: 1, hi: 1.3 }, high_window_hours: 24,
  });
  assert.ok(f.adx_mult === 1 || f.adx_mult === 1.3, `adx_mult should be a multiplier, got ${f.adx_mult}`);
  assert.equal(f.high_24h, Math.max(...up.slice(-24).map((b) => b.h)));
});

test('normalize: ms→sec, ascending, drop malformed rows', () => {
  const raw = [[3_600_000, 1, 2, 0.5, 1.5, 9], [0, 1, 2, 0.5, 1.5, 9], ['x', 1, 2, 3, 4, 5]];
  const out = normalize(raw);
  assert.equal(out.length, 2);                 // malformed row dropped
  assert.equal(out[0].ts, 0);
  assert.equal(out[1].ts, 3600);               // 3_600_000 ms → 3600 s (open time)
  assert.ok(out[0].ts < out[1].ts);            // ascending
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
    assert.equal(typeof m.live_close, 'number');
    assert.equal(typeof m.high_24h, 'number');
    assert.ok(m.adx_mult === 1 || m.adx_mult === 1.3);
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
