import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { withTestTx } from './helpers/db.js';
import { query } from '../../core/db.js';

let seedSeq = 0;

async function seedReflection(pair: string, summary: string): Promise<void> {
  seedSeq += 1;
  // Explicit ts with a one-second step so ORDER BY ts DESC works deterministically in the test
  const ts = new Date(Date.now() + seedSeq * 1000).toISOString();
  await query(
    `INSERT INTO reflection_log (pair, ts, summary, payload) VALUES ($1, $2, $3, '{"recommendations":[]}'::jsonb)`,
    [pair, ts, summary],
  );
}

describe('GET /api/reflections', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns reflection conclusions for a pair, newest first', async () => {
    await withTestTx(async () => {
      await seedReflection('ETH/USDT', 'conclusion 1');
      await seedReflection('ETH/USDT', 'conclusion 2');
      const res = await app.inject({ method: 'GET', url: '/api/reflections?pair=ETH%2FUSDT' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { reflections: Array<{ pair: string; summary: string; payload: unknown }> };
      const mine = body.reflections.filter((r) => r.summary === 'conclusion 1' || r.summary === 'conclusion 2');
      expect(mine).toHaveLength(2);
      expect(mine[0]!.summary).toBe('conclusion 2'); // ts DESC: the last inserted comes first
      expect(mine[0]!.payload).toBeTypeOf('object'); // JSONB payload is returned as an object
    });
  });

  it('filtering by pair does not return other pairs\' conclusions', async () => {
    await withTestTx(async () => {
      await seedReflection('WBNB/USDT', 'other conclusion');
      const res = await app.inject({ method: 'GET', url: '/api/reflections?pair=ETH%2FUSDT' });
      const body = res.json() as { reflections: Array<{ summary: string }> };
      expect(body.reflections.some((r) => r.summary === 'other conclusion')).toBe(false);
    });
  });

  it('invalid limit → 400', async () => {
    await withTestTx(async () => {
      const res = await app.inject({ method: 'GET', url: '/api/reflections?limit=0' });
      expect(res.statusCode).toBe(400);
    });
  });
});
