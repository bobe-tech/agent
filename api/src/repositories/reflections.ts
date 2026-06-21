import { query } from '../../../core/db.js';
import type { ReflectionRow } from '../types.js';

// Conclusions from the reflection job (recommendations for a human), newest first. Optionally filtered by pair.
export async function listReflections(filters: { pair?: string; limit: number }): Promise<ReflectionRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.pair) {
    params.push(filters.pair);
    where.push(`pair = $${params.length}`);
  }
  params.push(filters.limit);
  const limitIdx = params.length;
  const sql = `
    SELECT id::text AS id, pair, ts, summary, payload
      FROM reflection_log
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ts DESC
      LIMIT $${limitIdx}`;
  const { rows } = await query<ReflectionRow>(sql, params);
  return rows;
}
