import { query } from '../../../core/db.js';

export interface Quote {
  bid: number;
  ask: number;
  mid: number;
  ts: number;
}

// Latest quote for one pair (freshest ts). bid/ask/mid are ::float8 (numbers); ts is BIGINT (pg returns it as
// a string, so the row type reflects that and we coerce with Number()). null if none.
export async function getLatestQuote(pair: string): Promise<Quote | null> {
  const { rows } = await query<{ bid: number; ask: number; mid: number; ts: string }>(
    `SELECT bid::float8 AS bid, ask::float8 AS ask, mid::float8 AS mid, ts
       FROM quotes WHERE pair = $1 ORDER BY ts DESC LIMIT 1`,
    [pair],
  );
  const r = rows[0];
  if (!r) return null;
  return { bid: r.bid, ask: r.ask, mid: r.mid, ts: Number(r.ts) };
}

// Latest bid/ask per pair in one query (for unrealized PnL). Pairs without a row are absent from the map.
export async function getLatestQuotes(pairs: string[]): Promise<Record<string, { bid: number; ask: number }>> {
  if (pairs.length === 0) return {};
  const { rows } = await query<{ pair: string; bid: number; ask: number }>(
    `SELECT DISTINCT ON (pair) pair, bid::float8 AS bid, ask::float8 AS ask
       FROM quotes WHERE pair = ANY($1) ORDER BY pair, ts DESC`,
    [pairs],
  );
  const out: Record<string, { bid: number; ask: number }> = {};
  for (const r of rows) out[r.pair] = { bid: r.bid, ask: r.ask };
  return out;
}
