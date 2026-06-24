// Writing twak quotes into the DB (for the refresh-quotes cron). Reading for the dashboard lives in the API
// layer (api/src/repositories/quotes.ts) — the agent reads live quotes from twak, not from this table.
import { query } from './db.js';

// Upsert one quote row for a pair. Idempotent per (pair, ts). Returns affected row count.
export async function insertQuote(pair, q) {
  const res = await query(
    `INSERT INTO quotes (pair, ts, bid, ask, mid, notional, provider)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (pair, ts) DO UPDATE SET
       bid = EXCLUDED.bid, ask = EXCLUDED.ask, mid = EXCLUDED.mid,
       notional = EXCLUDED.notional, provider = EXCLUDED.provider`,
    [pair, q.ts, q.bid, q.ask, q.mid, q.notional, q.provider ?? null],
  );
  return res.rowCount ?? 1;
}

// Delete quotes older than N days (limiting table size). Returns deleted count.
export async function pruneOldQuotes(days) {
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const res = await query('DELETE FROM quotes WHERE ts < $1', [cutoff]);
  return res.rowCount ?? 0;
}
