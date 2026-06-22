// Market data → feature set for the strategy (hv/dv/mv, CRSI, ADX, SMA).
// Candle source — the candles table in the DB (populated by the cron getCandles→Binance klines); getMarket
// (the agent) and the API read ONLY from the DB. Anti-repaint: decisions are made on the last CLOSED bar (by UTC time).
import { sma, smaPrev, hh, ll, wilderAtr, adx, connorsRsi } from './indicators.js';
import { readCandles } from './candles-store.js';

async function fetchOnce(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) {
      const e = new Error(`HTTP ${res.status}`);
      e.status = res.status;                     // propagate the code to distinguish 429 from the rest
      throw e;
    }
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry with backoff: a transient failure → 1s; rate limit (429) → a long pause (Binance asks you to back
// off before the weight window resets, ~10-15s). Up to 4 attempts. Returns success or rethrows the last error.
async function fetchJson(url, timeoutMs = 10000) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fetchOnce(url, timeoutMs);
    } catch (e) {
      last = e;
      if (attempt === 3) break;
      await sleep(e.status === 429 ? 12000 : 1000);
    }
  }
  throw last;
}

// Freshness guard for the previous CRSI (crossover detection across ticks). prev — the last tick_log row
// ({crsi, ts}); now_ms — the current time. crsi_prev=null if there is no value or it is older than maxAgeMin.
export function freshPrev(prev, now_ms, maxAgeMin = 60) {
  if (!prev || prev.crsi == null || prev.ts == null) return { crsi_prev: null, crsi_prev_age_min: null };
  const ageMin = (now_ms - new Date(prev.ts).getTime()) / 60000;
  return { crsi_prev: ageMin <= maxAgeMin ? Number(prev.crsi) : null, crsi_prev_age_min: ageMin };
}

// Binance klines: [openTime_ms, o, h, l, c, v, closeTime_ms, ...], ascending. We key on openTime
// (ms → Unix seconds UTC) = the OPEN time of the bar; drop malformed rows and sort ascending.
export function normalize(list) {
  return (list || [])
    .map((r) => ({ ts: Math.floor(+r[0] / 1000), o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }))
    .filter((b) => Number.isFinite(b.ts) && Number.isFinite(b.o)
      && Number.isFinite(b.h) && Number.isFinite(b.l) && Number.isFinite(b.c))
    .sort((a, b) => a.ts - b.ts);
}

const TF_SECONDS = { H1: 3600, H4: 14400, D1: 86400 };      // bar duration, sec

// Resample raw bars (ascending {ts,o,h,l,c,v}) into bars of period periodSec by UTC buckets.
// Needed by getMarket for H4/D1 (we store only 1h in the DB). Pure function.
function resampleRaw(bars, periodSec) {
  const m = new Map();
  for (const b of bars) {
    const start = Math.floor(b.ts / periodSec) * periodSec;
    const x = m.get(start);
    if (!x) m.set(start, { ts: start, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v ?? 0 });
    else {
      x.h = Math.max(x.h, b.h);
      x.l = Math.min(x.l, b.l);
      x.c = b.c;
      x.v = (x.v ?? 0) + (b.v ?? 0);
    }
  }
  return [...m.values()].sort((a, b) => a.ts - b.ts);
}

// Resample H1 bars (ascending) into daily OHLC by UTC days. We include the last day only
// if it is FULLY closed (now_sec >= day_start+86400) — otherwise lookahead/repaint on the daily.
function resampleDaily(bars, nowSec) {
  const days = new Map();
  for (const b of bars) {
    const d = Math.floor(b.ts / 86400);
    const x = days.get(d);
    if (!x) days.set(d, { d, ts: d * 86400, o: b.o, h: b.h, l: b.l, c: b.c });
    else { x.h = Math.max(x.h, b.h); x.l = Math.min(x.l, b.l); x.c = b.c; }
  }
  return [...days.values()]
    .filter((x) => nowSec >= x.ts + 86400)   // only fully closed days
    .sort((a, b) => a.d - b.d);
}

// Daily volatility (%) = ATR-14% over daily bars built from H1 history. null when there is not enough data (need ≥15 closed days).
function dailyVolPct(bars, nowSec) {
  const d = resampleDaily(bars, nowSec);
  const a = wilderAtr(d, 14);
  return a?.atr_pct ?? null;
}

// Pure function: from an array of raw bars (ascending) compute features on the LAST CLOSED bar.
// Bar ts — Unix seconds UTC = the OPEN time of the bar (Binance openTime ms ÷ 1000). The bar covers [ts, ts+period);
// it is closed when now >= ts+period. We keep the last raw bar only if it's already closed,
// otherwise we drop it (anti-repaint). now_sec is a parameter for deterministic tests.
export function computeFeatures(allBars, { now_sec, period = 3600, slope_lag = 3, crsi_periods = {} } = {}) {
  if (!allBars || allBars.length === 0) throw new Error('no candles');
  const nowSec = now_sec ?? Math.floor(Date.now() / 1000);
  const lastRaw = allBars.at(-1);
  const last_raw_closed = nowSec >= lastRaw.ts + period;
  const bars = last_raw_closed ? allBars : allBars.slice(0, -1);
  if (bars.length === 0) throw new Error('no closed bars yet');

  const latest = bars.at(-1);
  const atr = wilderAtr(bars, 14);
  const dv = dailyVolPct(bars, nowSec);          // daily volatility, % (ATR-14 over daily bars)

  // CRSI on the H1 scale: history — closed bars; the current value accounts for the close
  // of the UNclosed H1 bar (if any) as the current price. crsi_prev comes from tick_log (see index.js).
  const closedCloses = bars.map((b) => b.c);
  const crsi_live_close = last_raw_closed ? latest.c : lastRaw.c;
  const crsiSeries = last_raw_closed ? closedCloses : [...closedCloses, lastRaw.c];
  const crsi = connorsRsi(crsiSeries, crsi_periods);

  return {
    latest_bar: { ts: latest.ts, open: latest.o, high: latest.h, low: latest.l, close: latest.c },
    last_raw_closed,                             // whether the last RAW bar was already closed
    close: latest.c,
    atr_pct: atr?.atr_pct ?? null,               // hv — hourly volatility
    daily_vol_pct: dv,                           // dv — daily volatility
    monthly_vol_pct: dv == null ? null : dv * Math.sqrt(30),  // mv ≈ dv·√30
    crsi,                                         // Connors RSI (H1 scale, current value)
    crsi_live_close,                              // the price taken as the close of the current bar
    sma20: sma(bars, 20),
    sma50: sma(bars, 50),
    sma20_prev: smaPrev(bars, 20, slope_lag),    // SMA20 slope_lag bars back (for the slope)
    hh20: hh(bars, 20), ll20: ll(bars, 20),
    hh50: hh(bars, 50), ll50: ll(bars, 50),
    adx: adx(bars, 14),
  };
}

// Mapping a timeframe to a Binance klines interval. The cron pulls only 1h (4h/1d are resampled from 1h
// on read in api); the rest are left for the generality of getCandles.
const CANDLE_TF = {
  '1h': '1h', hour: '1h',
  '4h': '4h',
  '1d': '1d', day: '1d',
};

// Binance public data host (klines only, no API key, no geo restrictions). Overridable via env.
const BINANCE_API_BASE = process.env.BINANCE_API_BASE || 'data-api.binance.vision';

// Candles for the chart: fetch Binance klines → normalize → lightweight-charts format
// ({time,open,high,low,close}, time = Unix sec, ascending). Includes the current (unclosed) bar —
// for a live chart that's fine (unlike the strategy, where anti-repaint is critical).
export async function getCandles(pairCfg, { timeframe = '1h', limit = 300 } = {}) {
  const interval = CANDLE_TF[timeframe] || '1h';
  const url = `https://${BINANCE_API_BASE}/api/v3/klines?symbol=${encodeURIComponent(pairCfg.symbol)}&interval=${interval}&limit=${limit}`;
  const json = await fetchJson(url);
  const bars = normalize(json);
  return bars.map((b) => ({ time: b.ts, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }));
}

// pairCfg — an object from config.json (base/quote/token). Reads candles FROM the DB (the candles table, populated by
// the cron), computes features (anti-repaint). In real time it does NOT hit Binance — only the cron does.
// We store 1h in the DB; for H4/D1 we resample from 1h. The pair name for the query is base/quote (= the config.json key).
export async function getMarket(pairCfg, { slope_lag = 3, timeframe = 'H1', limit = 720, now_sec, crsi_periods = {} } = {}) {
  const pairName = `${pairCfg.base}/${pairCfg.quote}`;
  const period = TF_SECONDS[timeframe] || 3600;
  const factor = period / 3600; // how many 1h bars are in one bar of the period
  const bars1h = await readCandles(pairName, '1h', limit * factor);
  const all = period === 3600 ? bars1h : resampleRaw(bars1h, period);
  const feats = computeFeatures(all, { now_sec, period, slope_lag, crsi_periods });
  // Pair metadata for the twak quote: base/quote symbols and the contract address of the base asset.
  // token_address is needed to quote by address (the twak symbol often isn't found), see strategy.md §0.
  return { ...feats, base: pairCfg.base, quote: pairCfg.quote, token_address: pairCfg.token };
}
