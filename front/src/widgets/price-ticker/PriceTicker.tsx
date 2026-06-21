import { usePrice } from '@/entities/market';
import { formatPrice } from '@/shared/lib/format';
import { Skeleton } from '@heroui/react';
import { cn } from '@/shared/lib/utils';

// Current pair price without a "last" label. Color is relative to the previous candle's close (prev_close),
// so it's colored right on load, without waiting for the next polling cycle.
export function PriceTicker({ pair }: { pair: string | null }) {
  const { data, isLoading, isError } = usePrice(pair);
  if (!pair) return null;
  if (isError) return <span className="text-sm text-danger">—</span>;
  if (isLoading || !data) return <Skeleton className="h-6 w-24 rounded-lg" />;

  const prev = data.prev_close;
  const dir = prev == null ? 'flat' : data.last > prev ? 'up' : data.last < prev ? 'down' : 'flat';
  const cls = dir === 'up' ? 'text-emerald-500' : dir === 'down' ? 'text-red-500' : 'text-foreground';
  return (
    <span className={cn('text-lg font-medium tabular-nums transition-colors', cls)}>{formatPrice(data.last)}</span>
  );
}
