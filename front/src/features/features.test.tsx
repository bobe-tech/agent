import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { PairSelector } from './select-pair/index.js';
import { DashboardStateProvider } from '@/shared/dashboard-state';

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <DashboardStateProvider>{children}</DashboardStateProvider>
    </QueryClientProvider>
  );
}

it('PairSelector shows pairs after loading', async () => {
  render(
    <Providers>
      <PairSelector />
    </Providers>,
  );
  // HeroUI Select (react-aria) renders pairs as <option> inside a hidden native select —
  // we query by the option role (hidden: true, since the list is aria-hidden while closed).
  expect(await screen.findByRole('option', { name: 'ETH/USDT', hidden: true })).toBeInTheDocument();
});
