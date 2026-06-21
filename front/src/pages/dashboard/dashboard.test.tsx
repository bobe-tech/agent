import { render, screen, waitFor } from '@testing-library/react';
import { server } from '@/test/msw';
import { dashboardHandlers } from '@/test/handlers';
import { App } from '@/app/App';

beforeEach(() => {
  server.use(...dashboardHandlers());
});

it('dashboard mounts: pair auto-select, stats section and tab panel', async () => {
  render(<App />);
  // PairSelector auto-selects the first pair (ETH/USDT from the default msw handler /api/pairs).
  await waitFor(() => expect(screen.getAllByText(/ETH\/USDT/).length).toBeGreaterThan(0));
  // The stats toggle and tab-panel tabs are present.
  expect(screen.getByRole('tab', { name: 'Pair stats' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Positions' })).toBeInTheDocument();
});
