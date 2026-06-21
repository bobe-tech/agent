import { query } from '../../../core/db.js';
import type { OrderRow } from '../types.js';

// NUMERIC is returned as strings (pg returns them as string), BIGINT id/position_id → ::text.
export async function listOrders(f: {
  pair?: string;
  position_id?: string;
  status?: string;
  limit?: number;
}): Promise<OrderRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (f.pair) {
    params.push(f.pair);
    where.push(`pair = $${params.length}`);
  }
  if (f.position_id) {
    params.push(f.position_id);
    where.push(`position_id = $${params.length}`);
  }
  if (f.status) {
    params.push(f.status);
    where.push(`status = $${params.length}`);
  }

  params.push(Math.min(f.limit ?? 50, 200));

  const sql = `
    SELECT id::text AS id,
           created_at,
           position_id::text AS position_id,
           pair, side, action, status, status_at,
           start_size, start_amount, start_price,
           comp_size, comp_amount, comp_price,
           tx_id, params_version, reason
      FROM orders
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY id DESC
      LIMIT $${params.length}`;

  const { rows } = await query<OrderRow>(sql, params);
  return rows;
}
