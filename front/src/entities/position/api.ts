import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/client';
import { POLLING } from '@/shared/config';
import type { Position } from './model.js';

export function usePositions(pair: string | null) {
  return useQuery({
    queryKey: ['positions', pair],
    queryFn: () => apiGet<{ positions: Position[] }>(`/api/positions?pair=${encodeURIComponent(pair!)}`),
    enabled: !!pair,
    refetchInterval: POLLING.data,
  });
}
