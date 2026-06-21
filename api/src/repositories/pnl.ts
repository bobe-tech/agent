import { query } from '../../../core/db.js';
import type { ClosedPnlRow, OpenPnlRow } from '../types.js';

export async function getClosedForPnl(pair?: string): Promise<ClosedPnlRow[]> {
  const params: unknown[] = [];
  let where = `status = 'completed'`;
  if (pair) {
    params.push(pair);
    where += ` AND pair = $${params.length}`;
  }
  const { rows } = await query<ClosedPnlRow>(
    `SELECT pair, realized_pnl_usd, realized_pnl_pct
       FROM positions WHERE ${where}`,
    params,
  );
  return rows;
}

// Date (ms) of the first position per pair (min created_at) — for the annualized APR projection. In a single query.
export async function getFirstTradeMsByPair(): Promise<Record<string, number>> {
  const { rows } = await query<{ pair: string; first: string | null }>(
    'SELECT pair, min(created_at) AS first FROM positions GROUP BY pair',
  );
  const out: Record<string, number> = {};
  for (const r of rows) if (r.first) out[r.pair] = new Date(r.first).getTime();
  return out;
}

export async function getOpenForPnl(pair?: string): Promise<OpenPnlRow[]> {
  const params: unknown[] = [];
  let where = `status = 'active'`;
  if (pair) {
    params.push(pair);
    where += ` AND pair = $${params.length}`;
  }
  const { rows } = await query<OpenPnlRow>(
    `SELECT pair, side, opened_amount, opened_price
       FROM positions WHERE ${where}`,
    params,
  );
  return rows;
}
