import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { usePairs } from './pair/index.js';
import { usePortfolioPnl } from './pnl/index.js';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

it('usePairs returns pairs from the API', async () => {
  const { result } = renderHook(() => usePairs(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.pairs.map((p) => p.pair)).toContain('ETH/USDT');
});

it('usePortfolioPnl returns total and by_pair', async () => {
  const { result } = renderHook(() => usePortfolioPnl(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.total.total_usd).toBe(9);
  expect(result.current.data?.by_pair[0]?.pair).toBe('ETH/USDT');
});
