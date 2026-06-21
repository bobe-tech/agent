import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/client';
import { POLLING } from '@/shared/config';
import type { Reflection } from './model.js';

export function useReflections(pair: string | null) {
  return useQuery({
    queryKey: ['reflections', pair],
    queryFn: () => apiGet<{ reflections: Reflection[] }>(`/api/reflections?pair=${encodeURIComponent(pair!)}&limit=50`),
    enabled: !!pair,
    refetchInterval: POLLING.data,
  });
}
