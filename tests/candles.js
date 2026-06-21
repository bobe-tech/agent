// Deterministic candle generator for tests — the SINGLE source of synthetic bars.
// Previously each test assembled bars via Array.from with its own magic numbers; now
// all series are built from here, so they're identical between runs and reused across
// indicators / market / candles-store / api. No Math.random — the series are reproducible.
//
// Canonical bar: { ts, o, h, l, c, v } (ts — unix seconds UTC, ascending).
// For writing to the DB via upsertCandles there is toStoreBars() → { time, open, high, low, close, volume }.

// The base reference point is fixed (January 1, 2024 00:00 UTC, exactly on the hourly grid).
// It's a multiple of 3600 and 86400, so resampling to H4/D1 lands on clean UTC buckets.
export const BASE_TS = 1704067200; // 2024-01-01T00:00:00Z

const HOUR = 3600;

// Deterministic pseudo-noise in the range [-1, 1] by index (no Math.random).
// A smooth periodic function → series look "alive" but are fully reproducible.
function wiggle(i) {
  return Math.sin(i * 1.3) * 0.6 + Math.sin(i * 0.37) * 0.4;
}

// Build one bar from close: high/low spread by ±spreadPct, open = the previous bar's close.
function barFromClose(ts, close, prevClose, spreadPct, volume) {
  const open = prevClose ?? close;
  const hi = Math.max(open, close) * (1 + spreadPct);
  const lo = Math.min(open, close) * (1 - spreadPct);
  return { ts, o: round(open), h: round(hi), l: round(lo), c: round(close), v: volume };
}

function round(x) {
  return Math.round(x * 1e8) / 1e8; // 8 digits — enough for crypto prices, no accumulating float tail
}

/**
 * Generate an ascending series of H1 bars by the given pattern.
 *
 * @param {object} opts
 * @param {number} [opts.count=120]   how many bars
 * @param {number} [opts.startTs=BASE_TS] ts of the first bar (unix sec)
 * @param {number} [opts.stepSec=3600] step between bars (an hour by default)
 * @param {number} [opts.base=100]    starting price
 * @param {'linear'|'up'|'down'|'saw'|'flat'|'realistic'} [opts.pattern='realistic']
 *        linear/up — steady rise; down — fall; saw — sawtooth; flat — no movement;
 *        realistic — trend + deterministic noise (for indicators/CRSI).
 * @param {number} [opts.step=1]      trend step per bar (for linear/up/down)
 * @param {number} [opts.amp=4]       amplitude (for saw/realistic)
 * @param {number} [opts.spreadPct=0.004] half the high/low spread from the price
 * @param {number} [opts.volume=1000] volume (the same on all bars)
 * @returns {Array<{ts:number,o:number,h:number,l:number,c:number,v:number}>}
 */
export function makeCandles(opts = {}) {
  const {
    count = 120,
    startTs = BASE_TS,
    stepSec = HOUR,
    base = 100,
    pattern = 'realistic',
    step = 1,
    amp = 4,
    spreadPct = 0.004,
    volume = 1000,
  } = opts;

  const closes = [];
  for (let i = 0; i < count; i++) {
    let c;
    switch (pattern) {
      case 'linear':
      case 'up':
        c = base + i * step;
        break;
      case 'down':
        c = base - i * step;
        break;
      case 'flat':
        c = base;
        break;
      case 'saw':
        // A clear trendless sawtooth: ADX over such a series should be low.
        c = base + (i % 2 === 0 ? amp : -amp);
        break;
      case 'realistic':
      default:
        // A slight uptrend + deterministic noise: yields CRSI/ADX in a meaningful range.
        c = base + i * step * 0.5 + wiggle(i) * amp;
        break;
    }
    closes.push(Math.max(c, 0.00000001)); // price doesn't go to zero/negative
  }

  const bars = [];
  for (let i = 0; i < count; i++) {
    bars.push(barFromClose(startTs + i * stepSec, closes[i], i > 0 ? closes[i - 1] : null, spreadPct, volume));
  }
  return bars;
}

// Canonical bars {ts,o,h,l,c,v} → the upsertCandles/getCandles format {time,open,high,low,close,volume}.
export function toStoreBars(bars) {
  return bars.map((b) => ({ time: b.ts, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v ?? null }));
}

// Canonical bars → the GeckoTerminal ohlcv_list format (newest-first: [ts,o,h,l,c,v]).
// For getCandles/normalize tests, where a "raw" external API response is the input.
export function toGeckoList(bars) {
  return bars.map((b) => [b.ts, b.o, b.h, b.l, b.c, b.v ?? 0]).reverse();
}
