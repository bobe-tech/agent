import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/client';
import { POLLING } from '@/shared/config';
import type { Order } from './model.js';

export function useOrders(pair: string | null, opts?: { status?: string }) {
  const status = opts?.status;
  return useQuery({
    queryKey: ['orders', pair, status],
    queryFn: () => {
      const params = new URLSearchParams({ pair: pair! });
      if (status && status !== 'all') params.set('status', status);
      return apiGet<{ orders: Order[] }>(`/api/orders?${params.toString()}`);
    },
    enabled: !!pair,
    refetchInterval: POLLING.data,
  });
}
