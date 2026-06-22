import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { withTestTx } from './helpers/db.js';
import { query } from '../../core/db.js';
import { getActiveVersion } from '../src/repositories/params.js';

// Inserts a position and two orders (active+completed) for that position.
// Returns the position id as a string.
async function seedPositionWithOrders(pair: string): Promise<string> {
  const version = await getActiveVersion(pair);

  const posRes = await query<{ id: string }>(
    `INSERT INTO positions (pair, side, status, opened_amount, opened_price,
                            regime_at_entry, features_at_entry, params_version)
     VALUES ($1, 'LONG', 'active', '20.000000000000000000', '100.000000000000000000',
             'RANGE', '{}'::jsonb, $2)
     RETURNING id::text AS id`,
    [pair, version],
  );
  const position_id = posRes.rows[0]!.id;

  // Order 1: active (intent, before the swap)
  await query(
    `INSERT INTO orders (position_id, pair, side, action, status,
                         start_amount, start_price, params_version)
     VALUES ($1, $2, 'LONG', 'open', 'active',
             '20.000000000000000000', '100.000000000000000000', $3)`,
    [position_id, pair, version],
  );

  // Order 2: completed (filled)
  await query(
    `INSERT INTO orders (position_id, pair, side, action, status,
                         start_amount, start_price,
                         comp_size, comp_amount, comp_price, params_version)
     VALUES ($1, $2, 'LONG', 'add', 'completed',
             '10.000000000000000000', '102.000000000000000000',
             '0.098039215686274510', '10.000000000000000000', '102.000000000000000000', $3)`,
    [position_id, pair, version],
  );

  return position_id;
}

describe('GET /api/orders', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns the position orders with string money fields', async () => {
    await withTestTx(async () => {
      const position_id = await seedPositionWithOrders('ETH/USDT');
      const res = await app.inject({
        method: 'GET',
        url: `/api/orders?position_id=${position_id}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        orders: Array<{
          id: string;
          position_id: string;
          pair: string;
          status: string;
          start_amount: string | null;
          start_price: string | null;
        }>;
      };
      expect(body.orders).toHaveLength(2);
      const o = body.orders[0]!;
      expect(o.pair).toBe('ETH/USDT');
      expect(o.position_id).toBe(position_id);
      expect(typeof o.id).toBe('string'); // BIGINT → string
      expect(typeof o.start_amount).toBe('string'); // NUMERIC → string
      expect(typeof o.start_price).toBe('string');
    });
  });

  it('filter pair=XRP/USDT does not return ETH/USDT orders', async () => {
    await withTestTx(async () => {
      await seedPositionWithOrders('ETH/USDT');
      const res = await app.inject({
        method: 'GET',
        url: '/api/orders?pair=XRP%2FUSDT',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { orders: unknown[] };
      // There must be no ETH orders in the results of the XRP filter
      expect(body.orders).toHaveLength(0);
    });
  });

  it('filter status=completed returns only completed orders', async () => {
    await withTestTx(async () => {
      const position_id = await seedPositionWithOrders('ETH/USDT');
      const res = await app.inject({
        method: 'GET',
        url: `/api/orders?position_id=${position_id}&status=completed`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { orders: Array<{ status: string }> };
      expect(body.orders).toHaveLength(1);
      expect(body.orders[0]!.status).toBe('completed');
    });
  });

  it('money is returned as strings (not numbers)', async () => {
    await withTestTx(async () => {
      const position_id = await seedPositionWithOrders('ETH/USDT');
      const res = await app.inject({
        method: 'GET',
        url: `/api/orders?position_id=${position_id}&status=completed`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        orders: Array<{ comp_size: string; comp_amount: string; comp_price: string }>;
      };
      const o = body.orders[0]!;
      expect(typeof o.comp_size).toBe('string');
      expect(typeof o.comp_amount).toBe('string');
      expect(typeof o.comp_price).toBe('string');
    });
  });

  it('invalid status → 400', async () => {
    await withTestTx(async () => {
      const res = await app.inject({ method: 'GET', url: '/api/orders?status=WRONG' });
      expect(res.statusCode).toBe(400);
    });
  });

  it('unknown pair → 404', async () => {
    await withTestTx(async () => {
      const res = await app.inject({ method: 'GET', url: '/api/orders?pair=UNKNOWN%2FUSDT' });
      expect(res.statusCode).toBe(404);
    });
  });
});
