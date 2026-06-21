import { query } from '../../../core/db.js';
import type { ParamsRow } from '../types.js';

// Active params version for a pair (one per pair by the unique index) or null.
export async function getActiveParams(pair: string): Promise<ParamsRow | null> {
  const { rows } = await query<ParamsRow>(
    `SELECT version, pair, is_active, config, source, reason, created_at
       FROM params
      WHERE pair = $1 AND is_active
      LIMIT 1`,
    [pair],
  );
  return rows[0] ?? null;
}

// The active version number for a pair (for seeding FKs in tests) or null if there is no active one.
export async function getActiveVersion(pair: string): Promise<number | null> {
  const { rows } = await query<{ version: number }>(
    'SELECT version FROM params WHERE pair = $1 AND is_active LIMIT 1',
    [pair],
  );
  return rows[0]?.version ?? null;
}

// Active versions for all pairs in a SINGLE query (for the /api/pairs summary — no N+1).
export async function getActiveVersions(): Promise<Record<string, number>> {
  const { rows } = await query<{ pair: string; version: number }>(
    'SELECT pair, version FROM params WHERE is_active',
  );
  return Object.fromEntries(rows.map((r) => [r.pair, r.version]));
}

// Capital base for ROI/APR = sum of sizes_usd of the pair's active ladder (e.g. [20,30,50] → 100).
// Returns the base per pair and the total (portfolio). Reacts to changes in sizes_usd in params.config.
export async function getDepositBases(): Promise<{ byPair: Record<string, number>; total: number }> {
  const { rows } = await query<{ pair: string; config: { sizes_usd?: number[]; side_mode?: string } }>(
    'SELECT pair, config FROM params WHERE is_active',
  );
  const byPair: Record<string, number> = {};
  for (const r of rows) {
    const sizes = Array.isArray(r.config?.sizes_usd) ? r.config.sizes_usd : [];
    const sides = r.config?.side_mode === 'both' ? 2 : 1;
    byPair[r.pair] = sizes.reduce((s, v) => s + (Number(v) || 0), 0) * sides;
  }
  const total = Object.values(byPair).reduce((s, v) => s + v, 0);
  return { byPair, total };
}
