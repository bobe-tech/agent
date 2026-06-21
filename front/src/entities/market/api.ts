import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/client';
import { POLLING } from '@/shared/config';
import type { Candle, PriceInfo } from './model.js';

export function useCandles(pair: string | null, tf: string) {
  return useQuery({
    queryKey: ['candles', pair, tf],
    queryFn: () => apiGet<{ candles: Candle[] }>(`/api/market/${encodeURIComponent(pair!)}/candles?tf=${tf}&limit=300`),
    enabled: !!pair,
    refetchInterval: POLLING.market,
  });
}

export function usePrice(pair: string | null) {
  return useQuery({
    queryKey: ['price', pair],
    queryFn: () => apiGet<PriceInfo>(`/api/market/${encodeURIComponent(pair!)}/price`),
    enabled: !!pair,
    refetchInterval: POLLING.price,
  });
}
