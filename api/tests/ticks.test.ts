import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { withTestTx } from './helpers/db.js';
import { query } from '../../core/db.js';
import { getActiveVersion } from '../src/repositories/params.js';

// Inserts a tick_log row with the given action (raw_decision NOT NULL, params_version FK).
async function seedTick(pair: string, action: string, regime = 'RANGE'): Promise<void> {
  const version = await getActiveVersion(pair);
  if (version == null) throw new Error(`no active params_version for ${pair}`);
  await query(
    `INSERT INTO tick_log (pair, regime, action, reason, raw_decision, params_version)
     VALUES ($1, $2, $3, $4, '{}'::jsonb, $5)`,
    [pair, regime, action, `test ${action}`, version],
  );
}

describe('GET /api/ticks', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('filter by action=HOLD returns only HOLD', async () => {
    await withTestTx(async () => {
      await seedTick('ETH/USDT', 'HOLD');
      await seedTick('ETH/USDT', 'OPEN_LONG');
      const res = await app.inject({ method: 'GET', url: '/api/ticks?pair=ETH%2FUSDT&action=HOLD' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { ticks: Array<{ action: string }> };
      expect(body.ticks.length).toBeGreaterThanOrEqual(1);
      expect(body.ticks.every((t) => t.action === 'HOLD')).toBe(true);
    });
  });

  it('action=all returns different actions', async () => {
    await withTestTx(async () => {
      await seedTick('ETH/USDT', 'HOLD');
      await seedTick('ETH/USDT', 'CLOSE');
      const res = await app.inject({ method: 'GET', url: '/api/ticks?pair=ETH%2FUSDT&action=all' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { ticks: Array<{ action: string }> };
      const actions = new Set(body.ticks.map((t) => t.action));
      expect(actions.has('HOLD')).toBe(true);
      expect(actions.has('CLOSE')).toBe(true);
    });
  });

  it('invalid action → 400', async () => {
    await withTestTx(async () => {
      const res = await app.inject({ method: 'GET', url: '/api/ticks?action=FOO' });
      expect(res.statusCode).toBe(400);
    });
  });
});
