import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/client';
import { POLLING } from '@/shared/config';
import type { PnlSummary, PortfolioPnl } from './model.js';

// enabled — defaults to true; StatsSection passes false for an inactive tab to avoid hitting
// the network/DB for a hidden stats view (polling runs only for the selected tab).
export function usePnl(pair: string | null, enabled = true) {
  return useQuery({
    queryKey: ['pnl', pair],
    queryFn: () => apiGet<PnlSummary>(`/api/pnl?pair=${encodeURIComponent(pair!)}`),
    enabled: enabled && !!pair,
    refetchInterval: POLLING.data,
  });
}

export function usePortfolioPnl(enabled = true) {
  return useQuery({
    queryKey: ['pnl', 'portfolio'],
    queryFn: () => apiGet<PortfolioPnl>('/api/pnl/portfolio'),
    enabled,
    refetchInterval: POLLING.data,
  });
}
