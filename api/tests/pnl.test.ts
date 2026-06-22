import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { withTestTx } from './helpers/db.js';
import { query } from '../../core/db.js';
import { getActiveVersion } from '../src/repositories/params.js';

// Inserts a closed position with the given realized PnL.
async function seedClosed(pair: string, pnlUsd: number, pnlPct: number): Promise<void> {
  const version = await getActiveVersion(pair);
  await query(
    `INSERT INTO positions (pair, side, status, opened_amount, opened_price,
                            regime_at_entry, features_at_entry, params_version,
                            status_at, realized_pnl_pct, realized_pnl_usd)
     VALUES ($1,'LONG','completed',$2,100,
             'RANGE','{}'::jsonb,$3,
             now(),$4,$5)`,
    [pair, Math.abs(pnlUsd) + 100, version, pnlPct, pnlUsd],
  );
}

describe('PnL routes', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /api/pnl?pair= aggregates realized for the pair', async () => {
    await withTestTx(async () => {
      await seedClosed('ETH/USDT', 5, 2);
      await seedClosed('ETH/USDT', -2, -1);
      const res = await app.inject({ method: 'GET', url: '/api/pnl?pair=ETH%2FUSDT' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { realized_usd: number; closed_count: number; win_rate: number };
      expect(body.realized_usd).toBeCloseTo(3, 6);
      expect(body.closed_count).toBe(2);
      expect(body.win_rate).toBe(0.5);
    });
  });

  it('GET /api/pnl/portfolio returns the summary and the per-pair breakdown', async () => {
    await withTestTx(async () => {
      // by_pair includes ALL configured pairs from config (listPairs()), not only those that have trades.
      // ETH/USDT — we seed 2 trades; XRP/USDT — the pair is in config but has no trades → realized_usd===0.
      await seedClosed('ETH/USDT', 5, 2);
      await seedClosed('ETH/USDT', 4, 3);
      const res = await app.inject({ method: 'GET', url: '/api/pnl/portfolio' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        total: { realized_usd: number };
        by_pair: Array<{ pair: string; realized_usd: number }>;
      };
      expect(body.total.realized_usd).toBeGreaterThanOrEqual(9);
      // ETH/USDT: actual seeded PnL
      expect(body.by_pair.find((p) => p.pair === 'ETH/USDT')?.realized_usd).toBeGreaterThan(0);
      // XRP/USDT: always present (pair is in config), no trades → zero PnL
      const xrp = body.by_pair.find((p) => p.pair === 'XRP/USDT');
      expect(xrp).toBeDefined();
      expect(xrp?.realized_usd).toBe(0);
    });
  });

  it('GET /api/pnl?pair= with an unknown pair → 404', async () => {
    await withTestTx(async () => {
      const res = await app.inject({ method: 'GET', url: '/api/pnl?pair=NOPE%2FUSDT' });
      expect(res.statusCode).toBe(404);
    });
  });
});
