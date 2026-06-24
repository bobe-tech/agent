import { usePrice } from '@/entities/market';
import { formatPrice } from '@/shared/lib/format';
import { Skeleton } from '@heroui/react';

// Live twak quote for the selected pair, shown as two small-font lines: BID (sell price, green) over
// ASK (buy price, red). The dashboard's unrealized PnL marks LONG at bid and SHORT at ask.
export function PriceTicker({ pair }: { pair: string | null }) {
  const { data, isLoading, isError } = usePrice(pair);
  if (!pair) return null;
  if (isError) return <span className="text-sm text-danger">—</span>;
  if (isLoading || !data) return <Skeleton className="h-8 w-24 rounded-lg" />;

  return (
    <div className="flex flex-col gap-0.5 text-sm leading-tight tabular-nums">
      <span className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase text-muted">Bid</span>
        <span className="text-emerald-500">{formatPrice(data.bid)}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase text-muted">Ask</span>
        <span className="text-red-500">{formatPrice(data.ask)}</span>
      </span>
    </div>
  );
}
