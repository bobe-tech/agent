import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { withTestTx } from './helpers/db.js';
import { query } from '../../core/db.js';
import { getActiveVersion } from '../src/repositories/params.js';

// Inserts a minimally valid active position into positions (inside the test transaction).
async function seedOpenPosition(pair: string): Promise<void> {
  const version = await getActiveVersion(pair);
  await query(
    `INSERT INTO positions (pair, side, status, opened_amount, opened_price,
                            regime_at_entry, features_at_entry, params_version)
     VALUES ($1, 'LONG', 'active', '20.000000000000000000', '100.000000000000000000',
             'RANGE', '{}'::jsonb, $2)`,
    [pair, version],
  );
}

describe('GET /api/positions', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns the pair positions with string money fields', async () => {
    await withTestTx(async () => {
      await seedOpenPosition('ETH/USDT');
      const res = await app.inject({ method: 'GET', url: '/api/positions?pair=ETH%2FUSDT' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        positions: Array<{ pair: string; status: string; opened_amount: string; opened_price: string }>;
      };
      expect(body.positions.length).toBeGreaterThanOrEqual(1);
      const p = body.positions[0]!;
      expect(p.pair).toBe('ETH/USDT');
      expect(p.status).toBe('active');
      expect(typeof p.opened_amount).toBe('string'); // NUMERIC is returned as a string
      expect(typeof p.opened_price).toBe('string');
    });
  });

  it('filter status=completed does not return an active position', async () => {
    await withTestTx(async () => {
      await seedOpenPosition('ETH/USDT');
      const res = await app.inject({ method: 'GET', url: '/api/positions?pair=ETH%2FUSDT&status=completed' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { positions: unknown[] };
      expect(body.positions).toHaveLength(0);
    });
  });

  it('invalid status → 400', async () => {
    await withTestTx(async () => {
      const res = await app.inject({ method: 'GET', url: '/api/positions?status=WRONG' });
      expect(res.statusCode).toBe(400);
    });
  });
});
