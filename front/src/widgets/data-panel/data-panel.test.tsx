import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { type ReactNode } from 'react';
import { server } from '@/test/msw';
import { DataPanel } from './index.js';

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  server.use(
    http.get('/api/positions', () => HttpResponse.json({ positions: [] })),
    http.get('/api/ticks', () => HttpResponse.json({ ticks: [] })),
    http.get('/api/market/:p/price', () => HttpResponse.json({ pair: 'ETH/USDT', last: 2600, time: 1 })),
  );
});

it('shows tabs and positions by default', async () => {
  render(wrap(<DataPanel pair="ETH/USDT" />));
  expect(screen.getByRole('tab', { name: 'Positions' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Strategy' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('No records found')).toBeInTheDocument());
});

it('switching to the "Activity" tab requests ticks', async () => {
  let ticksRequested = false;
  server.use(
    http.get('/api/ticks', () => {
      ticksRequested = true;
      return HttpResponse.json({ ticks: [] });
    }),
  );
  render(wrap(<DataPanel pair="ETH/USDT" />));
  await userEvent.click(screen.getByRole('tab', { name: 'Activity' }));
  await waitFor(() => expect(ticksRequested).toBe(true));
});
