// StatsSection: polls ONLY the active tab (pair vs portfolio) — the inactive mode doesn't fire a request.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { useEffect, type ReactNode } from 'react';
import { server } from '@/test/msw';
import { DashboardStateProvider, useDashboardState } from '@/shared/dashboard-state';
import { StatsSection } from './StatsSection.js';

const emptyPnl = {
  realized_usd: 0, unrealized_usd: 0, total_usd: 0, base_usd: 100,
  realized_pct: 0, unrealized_pct: 0, roi_pct: 0, apr_pct: 0,
  closed_count: 0, open_count: 0, win_rate: null, avg_pnl_pct: null, days_active: null,
};

// Pre-fills the selected pair (StatsSection polls pair only when selectedPair != null).
function Harness({ pair }: { pair: string }) {
  const { setSelectedPair, selectedPair } = useDashboardState();
  useEffect(() => { setSelectedPair(pair); }, [pair, setSelectedPair]);
  return selectedPair ? <StatsSection /> : null;
}

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <DashboardStateProvider>{ui}</DashboardStateProvider>
    </QueryClientProvider>
  );
}

it('by default polls pair statistics, does NOT request the portfolio', async () => {
  let pairCalls = 0;
  let portfolioCalls = 0;
  server.use(
    http.get('/api/pnl', () => { pairCalls++; return HttpResponse.json(emptyPnl); }),
    http.get('/api/pnl/portfolio', () => { portfolioCalls++; return HttpResponse.json({ total: emptyPnl, by_pair: [] }); }),
  );
  render(wrap(<Harness pair="ETH/USDT" />));
  await waitFor(() => expect(pairCalls).toBeGreaterThan(0));
  expect(portfolioCalls).toBe(0); // the inactive tab doesn't hit the network
});

it('switching to "Portfolio stats" triggers the portfolio request', async () => {
  let portfolioCalls = 0;
  server.use(
    http.get('/api/pnl', () => HttpResponse.json(emptyPnl)),
    http.get('/api/pnl/portfolio', () => { portfolioCalls++; return HttpResponse.json({ total: emptyPnl, by_pair: [] }); }),
  );
  render(wrap(<Harness pair="ETH/USDT" />));
  await userEvent.click(screen.getByRole('tab', { name: 'Portfolio stats' }));
  await waitFor(() => expect(portfolioCalls).toBeGreaterThan(0));
});

it('renders 4 summary cards', async () => {
  server.use(
    http.get('/api/pnl', () => HttpResponse.json(emptyPnl)),
    http.get('/api/pnl/portfolio', () => HttpResponse.json({ total: emptyPnl, by_pair: [] })),
  );
  render(wrap(<Harness pair="ETH/USDT" />));
  await waitFor(() => expect(screen.getByText('Realized PnL')).toBeInTheDocument());
  expect(screen.getByText('Unrealized PnL')).toBeInTheDocument();
  expect(screen.getByText('ROI')).toBeInTheDocument();
  expect(screen.getByText('APR')).toBeInTheDocument();
});
