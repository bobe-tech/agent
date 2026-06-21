// apiGet/ApiError — thin client over fetch. We mock the global fetch directly (bypassing MSW).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiGet, ApiError } from './client';

function mockFetch(impl: (path: string) => Promise<unknown> | unknown) {
  vi.stubGlobal('fetch', vi.fn(async (path: string) => impl(path)));
}

afterEach(() => vi.unstubAllGlobals());

describe('apiGet', () => {
  it('returns parsed JSON on 200', async () => {
    mockFetch(() => ({ ok: true, status: 200, json: async () => ({ pairs: ['ETH/USDT'] }) }));
    const data = await apiGet<{ pairs: string[] }>('/api/pairs');
    expect(data.pairs).toEqual(['ETH/USDT']);
  });

  it('requests the path with accept: application/json', async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal('fetch', spy);
    await apiGet('/api/health');
    expect(spy).toHaveBeenCalledWith('/api/health', { headers: { accept: 'application/json' } });
  });

  it('throws ApiError with status and text from body.error on 4xx', async () => {
    mockFetch(() => ({ ok: false, status: 404, json: async () => ({ error: 'unknown pair: DOGE/USDT' }) }));
    await expect(apiGet('/api/pnl?pair=DOGE/USDT')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'unknown pair: DOGE/USDT',
    });
  });

  it('keeps HTTP <status> as the message when the error body is not JSON', async () => {
    mockFetch(() => ({ ok: false, status: 503, json: async () => { throw new Error('not json'); } }));
    const err = await apiGet('/api/market/x/price').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(503);
    expect((err as ApiError).message).toBe('HTTP 503');
  });

  it('ApiError is an Error instance with correct name and status', () => {
    const e = new ApiError(500, 'boom');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ApiError');
    expect(e.status).toBe(500);
  });
});
