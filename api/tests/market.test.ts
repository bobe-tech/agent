import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { withTestTx } from './helpers/db.js';
import { query } from '../../core/db.js';

// Inserts a 1h candle into the candles table (inside the test transaction).
async function seedCandle(
  pair: string,
  ts: number,
  o: number,
  h: number,
  l: number,
  c: number,
): Promise<void> {
  await query(
    `INSERT INTO candles (pair, tf, ts, open, high, low, close) VALUES ($1,'1h',$2,$3,$4,$5,$6)`,
    [pair, ts, o, h, l, c],
  );
}

describe('market routes (reading candles from DB)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /candles?tf=1h returns candles from the DB (ascending)', async () => {
    await withTestTx(async () => {
      await seedCandle('ETH/USDT', 1000, 10, 11, 9, 10.5);
      await seedCandle('ETH/USDT', 4600, 10.5, 12, 10, 11.7);
      const res = await app.inject({ method: 'GET', url: '/api/market/ETH%2FUSDT/candles?tf=1h&limit=10' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { pair: string; candles: Array<{ time: number; close: number }> };
      expect(body.pair).toBe('ETH/USDT');
      expect(body.candles).toHaveLength(2);
      expect(body.candles[0]).toEqual({ time: 1000, open: 10, high: 11, low: 9, close: 10.5 });
      expect(body.candles[1]!.time).toBe(4600); // ascending
    });
  });

  it('GET /price returns the close of the latest 1h bar', async () => {
    await withTestTx(async () => {
      await seedCandle('ETH/USDT', 1000, 10, 11, 9, 10.5);
      await seedCandle('ETH/USDT', 4600, 10.5, 12, 10, 11.7);
      const res = await app.inject({ method: 'GET', url: '/api/market/ETH%2FUSDT/price' });
      expect(res.statusCode).toBe(200);
      expect(res.json().last).toBe(11.7);
    });
  });

  it('GET /candles?tf=4h resamples from 1h (4 bars → 1)', async () => {
    await withTestTx(async () => {
      const base = 14400 * 100; // aligned to the 4h bucket boundary
      await seedCandle('ETH/USDT', base, 100, 105, 99, 101);
      await seedCandle('ETH/USDT', base + 3600, 101, 110, 100, 108);
      await seedCandle('ETH/USDT', base + 7200, 108, 109, 95, 96);
      await seedCandle('ETH/USDT', base + 10800, 96, 97, 90, 93);
      const res = await app.inject({ method: 'GET', url: '/api/market/ETH%2FUSDT/candles?tf=4h&limit=10' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { candles: Array<{ time: number; open: number; high: number; low: number; close: number }> };
      expect(body.candles).toHaveLength(1);
      expect(body.candles[0]).toEqual({ time: base, open: 100, high: 110, low: 90, close: 93 });
    });
  });

  it('GET /candles?tf=1d resamples daily from 1h (by UTC days)', async () => {
    await withTestTx(async () => {
      const d0 = 86400 * 100; // UTC day boundary
      await seedCandle('ETH/USDT', d0, 100, 110, 95, 105);
      await seedCandle('ETH/USDT', d0 + 3600, 105, 120, 100, 118);
      await seedCandle('ETH/USDT', d0 + 7200, 118, 119, 90, 92);
      await seedCandle('ETH/USDT', d0 + 86400, 92, 93, 91, 92.5); // next day
      const res = await app.inject({ method: 'GET', url: '/api/market/ETH%2FUSDT/candles?tf=1d&limit=10' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { candles: Array<{ time: number; open: number; high: number; low: number; close: number }> };
      expect(body.candles).toHaveLength(2);
      expect(body.candles[0]).toEqual({ time: d0, open: 100, high: 120, low: 90, close: 92 });
      expect(body.candles[1]).toEqual({ time: d0 + 86400, open: 92, high: 93, low: 91, close: 92.5 });
    });
  });

  it('GET /price with no candles → 503', async () => {
    await withTestTx(async () => {
      const res = await app.inject({ method: 'GET', url: '/api/market/CAKE%2FUSDT/price' });
      expect(res.statusCode).toBe(503);
    });
  });

  it('unknown pair → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/market/FOO%2FBAR/candles' });
    expect(res.statusCode).toBe(404);
  });

  it('invalid tf (15m is no longer supported) → 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/market/ETH%2FUSDT/candles?tf=15m' });
    expect(res.statusCode).toBe(400);
  });
});
