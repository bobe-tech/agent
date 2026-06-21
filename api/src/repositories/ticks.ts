import { query } from '../../../core/db.js';
import type { TickRow } from '../types.js';

export interface TicksFilters {
  pair?: string;
  action?: string; // 'all' or a specific action
  from?: string;
  to?: string;
  limit: number;
}

export async function listTicks(filters: TicksFilters): Promise<TickRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.pair) {
    params.push(filters.pair);
    where.push(`pair = $${params.length}`);
  }
  if (filters.action && filters.action !== 'all') {
    params.push(filters.action);
    where.push(`action = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    where.push(`ts >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`ts < $${params.length}`);
  }
  params.push(filters.limit);
  const limitIdx = params.length;
  const sql = `
    SELECT id::text AS id, pair, ts, regime, action,
           close::float8 AS close, atr_pct::float8 AS atr_pct, adx::float8 AS adx,
           crsi::float8 AS crsi, confidence::float8 AS confidence, reason,
           position_id::text AS position_id, live_bid::float8 AS live_bid, live_ask::float8 AS live_ask
      FROM tick_log
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ts DESC
      LIMIT $${limitIdx}`;
  const { rows } = await query<TickRow>(sql, params);
  return rows;
}
