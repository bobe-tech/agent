import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Force the repository to throw an "internal" error (with a secret detail) while handling the request.
vi.mock('../src/repositories/positions.js', () => ({
  listPositions: vi.fn(async () => {
    throw new Error('secret DB detail: connection refused 10.0.0.5');
  }),
}));

import { buildServer } from '../src/server.js';

describe('error handler (APP_DEBUG=false)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('5xx returns a generic message and does not expose internal details', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/positions?pair=ETH%2FUSDT' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Internal server error' });
    expect(res.body).not.toContain('secret DB detail');
    expect(res.body).not.toContain('10.0.0.5');
  });
});
