import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/pairs', () =>
    HttpResponse.json({ pairs: [{ pair: 'ETH/USDT', active_version: 1 }, { pair: 'WBNB/USDT', active_version: 2 }] }),
  ),
  http.get('/api/pnl/portfolio', () =>
    HttpResponse.json({
      total: { realized_usd: 9, unrealized_usd: 0, total_usd: 9, closed_count: 2, open_count: 0, win_rate: 1, avg_pnl_pct: 2 },
      by_pair: [{ pair: 'ETH/USDT', realized_usd: 9, unrealized_usd: 0, total_usd: 9, closed_count: 2, open_count: 0, win_rate: 1, avg_pnl_pct: 2 }],
    }),
  ),
];

export const server = setupServer(...handlers);
