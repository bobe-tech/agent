// Writing candles to the DB (for the refresh-candles cron job). Reading is on the api side (candles repository).
import { query } from './db.js';

// Bulk-upsert of candles for one pair/timeframe. bars: [{time,open,high,low,close,volume?}] (ascending).
// getCandles has no volume — we write null (volume is not shown on the chart). Returns the number of rows.
export async function upsertCandles(pair, tf, bars) {
  if (!bars || bars.length === 0) return 0;
  const rows = [];
  const params = [];
  let i = 1;
  for (const b of bars) {
    rows.push(`($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`);
    params.push(pair, tf, b.time, b.open, b.high, b.low, b.close, b.volume ?? null);
  }
  const sql = `
    INSERT INTO candles (pair, tf, ts, open, high, low, close, volume)
    VALUES ${rows.join(',')}
    ON CONFLICT (pair, tf, ts) DO UPDATE SET
      open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
      close = EXCLUDED.close, volume = EXCLUDED.volume, updated_at = now()`;
  const res = await query(sql, params);
  return res.rowCount ?? bars.length;
}

// Reading candles from the DB (for the agent's getMarket and any readers): the last `limit` bars of pair/tf,
// in the form of normalized bars {ts,o,h,l,c,v} ascending. NUMERIC from pg arrives as a string → Number().
export async function readCandles(pair, tf, limit) {
  const { rows } = await query(
    `SELECT ts, open, high, low, close, volume
       FROM candles WHERE pair = $1 AND tf = $2 ORDER BY ts DESC LIMIT $3`,
    [pair, tf, limit],
  );
  return rows
    .map((r) => ({
      ts: Number(r.ts),
      o: Number(r.open),
      h: Number(r.high),
      l: Number(r.low),
      c: Number(r.close),
      v: r.volume == null ? null : Number(r.volume),
    }))
    .reverse();
}

// Delete candles of a timeframe older than N days (limiting table size).
export async function pruneOldCandles(tf, days) {
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const res = await query('DELETE FROM candles WHERE tf = $1 AND ts < $2', [tf, cutoff]);
  return res.rowCount ?? 0;
}
