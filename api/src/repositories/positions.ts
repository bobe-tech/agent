import { query } from '../../../core/db.js';
import type { PositionRow } from '../types.js';

// NUMERIC is returned as strings (pg returns them as string), BIGINT id → ::text.
export async function listPositions(filters: {
  pair?: string;
  status?: 'active' | 'completed' | 'cancelled';
}): Promise<PositionRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.pair) {
    params.push(filters.pair);
    where.push(`pair = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  const sql = `
    SELECT id::text AS id,
           created_at, pair, side, status, status_at,
           opened_size, opened_amount, opened_price,
           closed_size, closed_amount, closed_price,
           realized_pnl_usd, realized_pnl_pct,
           reason, force_closed,
           regime_at_entry, features_at_entry,
           expected_move_pct, params_version
      FROM positions
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC
      LIMIT 100`;
  const { rows } = await query<PositionRow>(sql, params);
  return rows;
}
