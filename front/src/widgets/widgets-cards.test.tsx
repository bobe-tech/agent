import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { type ReactNode } from 'react';
import { server } from '@/test/msw';
import { PriceTicker } from './price-ticker/index.js';
import { StatCard } from './stats-section/index.js';

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

it('PriceTicker shows the pair bid and ask', async () => {
  server.use(http.get('/api/market/:p/price', () => HttpResponse.json({ pair: 'ETH/USDT', bid: 2499, ask: 2501, mid: 2500, ts: 1 })));
  render(wrap(<PriceTicker pair="ETH/USDT" />));
  expect(await screen.findByText(/2,499/)).toBeInTheDocument();
  expect(await screen.findByText(/2,501/)).toBeInTheDocument();
  expect(screen.getByText('Bid')).toBeInTheDocument();
  expect(screen.getByText('Ask')).toBeInTheDocument();
});

it('StatCard renders value and badge', () => {
  render(<StatCard title="ROI" value="+12.50%" badge="+5.00%" trend="up" hint="on capital" />);
  expect(screen.getByText('ROI')).toBeInTheDocument();
  expect(screen.getByText('+12.50%')).toBeInTheDocument();
  expect(screen.getByText('+5.00%')).toBeInTheDocument();
});

it('StatCard in the error state shows "—"', () => {
  render(<StatCard title="APR" value="+1%" error />);
  expect(screen.getByText('—')).toBeInTheDocument();
});
