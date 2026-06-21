import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/client';
import { POLLING } from '@/shared/config';
import type { Pair } from './model.js';

export function usePairs() {
  return useQuery({
    queryKey: ['pairs'],
    queryFn: () => apiGet<{ pairs: Pair[] }>('/api/pairs'),
    refetchInterval: POLLING.data,
  });
}
