import { query } from '../../../core/db.js';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Row {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// Resample 1h bars (ascending) into bars of period periodSec (UTC buckets). Pure function.
export function resample(bars: Candle[], periodSec: number): Candle[] {
  const buckets = new Map<number, Candle>();
  for (const b of bars) {
    const start = Math.floor(b.time / periodSec) * periodSec;
    const cur = buckets.get(start);
    if (!cur) {
      buckets.set(start, { time: start, open: b.open, high: b.high, low: b.low, close: b.close });
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

async function readHourly(pair: string, limit: number): Promise<Candle[]> {
  const { rows } = await query<Row>(
    `SELECT ts, open::float8 AS open, high::float8 AS high, low::float8 AS low, close::float8 AS close
       FROM candles WHERE pair = $1 AND tf = '1h' ORDER BY ts DESC LIMIT $2`,
    [pair, limit],
  );
  return rows
    .map((r) => ({ time: Number(r.ts), open: r.open, high: r.high, low: r.low, close: r.close }))
    .reverse(); // we read DESC from the DB, the chart needs ascending
}

// Candles for the chart from the DB. We store only 1h; 1h is served natively, 4h/1d are resampled from 1h.
// NOTE: for 4h/1d we read limit*factor hourly bars, but only ~CANDLES_KEEP_DAYS·24 of them are stored
// (pruner retention). So for 1d the frontend gets at most ~CANDLES_KEEP_DAYS daily candles —
// this is expected (history is limited by retention); there's no need to look for "missing" bars.
export async function listCandles(pair: string, tf: string, limit: number): Promise<Candle[]> {
  if (tf === '1h' || tf === 'hour') return readHourly(pair, limit);
  const periodSec = tf === '4h' ? 14400 : 86400; // '1d' | 'day'
  const factor = periodSec / 3600;
  const base = await readHourly(pair, limit * factor);
  return resample(base, periodSec).slice(-limit);
}

// last price of a pair = close of the latest 1h bar (+ time) and prevClose of the previous bar (for coloring
// the direction). null if there are no candles yet.
export async function getLastClose(
  pair: string,
): Promise<{ last: number; time: number; prevClose: number | null } | null> {
  const { rows } = await query<{ close: number; ts: number }>(
    `SELECT close::float8 AS close, ts FROM candles WHERE pair = $1 AND tf = '1h' ORDER BY ts DESC LIMIT 2`,
    [pair],
  );
  const r = rows[0];
  if (!r) return null;
  return { last: r.close, time: Number(r.ts), prevClose: rows[1]?.close ?? null };
}
