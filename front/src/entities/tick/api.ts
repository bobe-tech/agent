import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/client';
import { POLLING } from '@/shared/config';
import type { Tick } from './model.js';

export function useTicks(pair: string | null, action: string) {
  return useQuery({
    queryKey: ['ticks', pair, action],
    queryFn: () => apiGet<{ ticks: Tick[] }>(`/api/ticks?pair=${encodeURIComponent(pair!)}&action=${action}&limit=100`),
    enabled: !!pair,
    refetchInterval: POLLING.data,
  });
}
