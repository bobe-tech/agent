import { http, HttpResponse } from 'msw';

// Default set of "successful" handlers for all dashboard blocks — for full App tests.
// Base /api/pairs and /api/pnl/portfolio live in msw.ts (default server).
export function dashboardHandlers() {
  return [
    http.get('/api/market/:p/price', () => HttpResponse.json({ pair: 'ETH/USDT', bid: 2499, ask: 2501, mid: 2500, ts: 1 })),
    http.get('/api/market/:p/candles', () => HttpResponse.json({ candles: [] })),
    http.get('/api/positions', () => HttpResponse.json({ positions: [] })),
    http.get('/api/ticks', () => HttpResponse.json({ ticks: [] })),
    http.get('/api/params/:p', () =>
      HttpResponse.json({
        version: 1,
        pair: 'ETH/USDT',
        is_active: true,
        config: { crsi_buy: 13 },
        source: 'seed',
        reason: null,
        created_at: '2026-06-19T00:00:00Z',
      }),
    ),
    http.get('/api/orders', () => HttpResponse.json({ orders: [] })),
    http.get('/api/reflections', () => HttpResponse.json({ reflections: [] })),
    http.get('/api/pnl', () =>
      HttpResponse.json({
        realized_usd: 0, unrealized_usd: 0, total_usd: 0, base_usd: 0,
        realized_pct: null, unrealized_pct: null, roi_pct: null, apr_pct: null,
        closed_count: 0, open_count: 0, win_rate: null, avg_pnl_pct: null, days_active: null,
      }),
    ),
  ];
}
