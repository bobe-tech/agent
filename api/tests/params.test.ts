import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { withTestTx } from './helpers/db.js';
import { query } from '../../core/db.js';
import { getDepositBases } from '../src/repositories/params.js';

describe('pairs & params routes', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /api/pairs returns the list of pairs with the active version', async () => {
    await withTestTx(async () => {
      const res = await app.inject({ method: 'GET', url: '/api/pairs' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { pairs: { pair: string; active_version: number | null }[] };
      // ETH/USDT is configured in config.json and seeded by migrations — the active version must be a number.
      const eth = body.pairs.find((p) => p.pair === 'ETH/USDT');
      expect(eth).toBeDefined();
      expect(typeof eth?.active_version).toBe('number');
    });
  });

  it('GET /api/params/:pair returns the active config', async () => {
    await withTestTx(async () => {
      const res = await app.inject({ method: 'GET', url: '/api/params/ETH%2FUSDT' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { pair: string; config: Record<string, unknown> };
      expect(body.pair).toBe('ETH/USDT');
      expect(body.config).toBeTypeOf('object');
    });
  });

  it('GET /api/params/:pair for a pair without active params → 404', async () => {
    await withTestTx(async () => {
      const res = await app.inject({ method: 'GET', url: '/api/params/NOPE%2FUSDT' });
      expect(res.statusCode).toBe(404);
    });
  });
});

describe('getDepositBases', () => {
  it('side_mode=long → ×1 ($100/pair with sizes_usd=[20,30,50])', async () => {
    await withTestTx(async () => {
      // Deactivate all active params for TEST/USDT for the duration of the test
      await query(`UPDATE params SET is_active = false WHERE pair = 'TEST/USDT'`);
      // Insert a test record with side_mode='long'
      await query(
        `INSERT INTO params (pair, is_active, config, source)
         VALUES ('TEST/USDT', true, '{"sizes_usd":[20,30,50],"side_mode":"long"}'::jsonb, 'human')`,
      );
      const result = await getDepositBases();
      expect(result.byPair['TEST/USDT']).toBe(100);
    });
  });

  it('side_mode=both → ×2 ($200/pair with sizes_usd=[20,30,50])', async () => {
    await withTestTx(async () => {
      await query(`UPDATE params SET is_active = false WHERE pair = 'TEST2/USDT'`);
      await query(
        `INSERT INTO params (pair, is_active, config, source)
         VALUES ('TEST2/USDT', true, '{"sizes_usd":[20,30,50],"side_mode":"both"}'::jsonb, 'human')`,
      );
      const result = await getDepositBases();
      expect(result.byPair['TEST2/USDT']).toBe(200);
    });
  });
});
