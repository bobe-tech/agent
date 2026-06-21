import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

describe('GET /api/docs/:name', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns the strategy doc with markdown content', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/docs/strategy' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('strategy');
    expect(typeof body.content).toBe('string');
    expect(body.content.length).toBeGreaterThan(0);
  });

  it('returns the reflection doc', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/docs/reflection' });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('reflection');
  });

  it('rejects an unknown doc with 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/docs/secrets' });
    expect(res.statusCode).toBe(404);
  });

  it('does not allow path traversal to read arbitrary files', async () => {
    // Encoded "../../.env" — the param never builds a path, so this is just an unknown allowlist key → 404.
    const res = await app.inject({ method: 'GET', url: '/api/docs/%2e%2e%2f%2e%2e%2f.env' });
    expect(res.statusCode).toBe(404);
  });
});
