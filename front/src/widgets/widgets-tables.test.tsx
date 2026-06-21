import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { type ReactNode } from 'react';
import { server } from '@/test/msw';
import { PositionsTable } from './positions-table/index.js';
import { ReflectionsList } from './reflections-list/index.js';
import { TicksTable } from './ticks-panel/index.js';
import { OrdersTable } from './orders-table/index.js';

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

const ethPosition = {
  id: '1', pair: 'ETH/USDT', side: 'LONG', status: 'active',
  created_at: '2026-06-19T10:00:00Z', status_at: null,
  opened_size: '0.008', opened_amount: '20', opened_price: '2500',
  closed_size: null, closed_amount: null, closed_price: null,
  realized_pnl_usd: null, realized_pnl_pct: null,
  reason: null, force_closed: false,
  regime_at_entry: 'RANGE', expected_move_pct: null, params_version: 1,
};

const priceHandler = http.get('/api/market/:p/price', () =>
  HttpResponse.json({ pair: 'ETH/USDT', last: 2600, time: 1 }),
);

it('PositionsTable renders a position with a side badge', async () => {
  server.use(http.get('/api/positions', () => HttpResponse.json({ positions: [ethPosition] })), priceHandler);
  render(wrap(<PositionsTable pair="ETH/USDT" status="all" />));
  await waitFor(() => expect(screen.getByText('Long')).toBeInTheDocument());
});

it('PositionsTable filters by status (completed will not show active)', async () => {
  server.use(http.get('/api/positions', () => HttpResponse.json({ positions: [ethPosition] })), priceHandler);
  render(wrap(<PositionsTable pair="ETH/USDT" status="completed" />));
  await waitFor(() => expect(screen.getByText('No records found')).toBeInTheDocument());
});

it('ReflectionsList shows summary from reflection_log', async () => {
  server.use(
    http.get('/api/reflections', () =>
      HttpResponse.json({ reflections: [{ id: '1', pair: 'ETH/USDT', ts: '2026-06-19T10:00:00Z', summary: 'recommendation to reduce risk', payload: null }] }),
    ),
  );
  render(wrap(<ReflectionsList pair="ETH/USDT" />));
  await waitFor(() => expect(screen.getByText('recommendation to reduce risk')).toBeInTheDocument());
});

it('TicksTable requests ticks with the passed action', async () => {
  const seen: string[] = [];
  server.use(
    http.get('/api/ticks', ({ request }) => {
      seen.push(new URL(request.url).searchParams.get('action') ?? '');
      return HttpResponse.json({ ticks: [] });
    }),
  );
  render(wrap(<TicksTable pair="ETH/USDT" action="HOLD" />));
  await waitFor(() => expect(seen).toContain('HOLD'));
});

const openOrder = {
  id: 'ord-1',
  created_at: '2026-06-19T10:00:00Z',
  position_id: 'pos-1',
  pair: 'ETH/USDT',
  side: 'LONG' as const,
  action: 'open' as const,
  status: 'completed' as const,
  status_at: '2026-06-19T10:01:00Z',
  start_size: '0.008',
  start_amount: '20',
  start_price: '2500',
  comp_size: '0.008',
  comp_amount: '20.10',
  comp_price: '2512.50',
  tx_id: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  params_version: 1,
  reason: null,
};

const addOrder = {
  ...openOrder,
  id: 'ord-2',
  action: 'add' as const,
  status: 'active' as const,
  comp_size: null,
  comp_amount: null,
  comp_price: null,
  tx_id: null,
};

it('OrdersTable renders an order with the Entry badge and amount', async () => {
  server.use(http.get('/api/orders', () => HttpResponse.json({ orders: [openOrder] })));
  render(wrap(<OrdersTable pair="ETH/USDT" action="all" />));
  await waitFor(() => expect(screen.getByText('Entry')).toBeInTheDocument());
  await waitFor(() => expect(screen.getByText('$20.10')).toBeInTheDocument());
});

it('OrdersTable filters by action on the client (add will not show open)', async () => {
  server.use(http.get('/api/orders', () => HttpResponse.json({ orders: [openOrder] })));
  render(wrap(<OrdersTable pair="ETH/USDT" action="add" />));
  await waitFor(() => expect(screen.getByText('No records found')).toBeInTheDocument());
});

it('OrdersTable shows both orders when action=all', async () => {
  server.use(http.get('/api/orders', () => HttpResponse.json({ orders: [openOrder, addOrder] })));
  render(wrap(<OrdersTable pair="ETH/USDT" action="all" />));
  await waitFor(() => expect(screen.getByText('Entry')).toBeInTheDocument());
  await waitFor(() => expect(screen.getByText('Averaging')).toBeInTheDocument());
});

it('OrdersTable shows a BscScan link when tx_id is present', async () => {
  server.use(http.get('/api/orders', () => HttpResponse.json({ orders: [openOrder] })));
  render(wrap(<OrdersTable pair="ETH/USDT" action="all" />));
  await waitFor(() => {
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', `https://bscscan.com/tx/${openOrder.tx_id}`);
  });
});
