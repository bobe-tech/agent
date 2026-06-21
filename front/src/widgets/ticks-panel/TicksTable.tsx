import { useTicks } from '@/entities/tick';
import { Chip, Skeleton, ScrollShadow } from '@heroui/react';
import { LoadError } from '@/shared/ui/load-error';
import { EmptyState } from '@/shared/ui/empty-state';
import { formatDateTime } from '@/shared/lib/format';

// Agent messages in a feed format: date + action badge on top, message text below.
export function TicksTable({ pair, action }: { pair: string | null; action: string }) {
  const { data, isLoading, isError } = useTicks(pair, action);
  const rows = data?.ticks ?? [];

  if (isError) return <LoadError />;
  if (isLoading) return <Skeleton className="h-56 w-full rounded-lg" />;
  if (rows.length === 0) return <EmptyState />;

  return (
    <ScrollShadow hideScrollBar className="h-[28rem] pr-3">
      <ul className="space-y-3">
        {rows.map((t) => (
          <li key={t.id} className="border-b border-separator pb-2 last:border-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted tabular-nums">{formatDateTime(t.ts)}</span>
              <Chip variant="secondary" size="sm">
                {t.action}
              </Chip>
            </div>
            <p className="mt-0.5 text-sm">{t.reason ?? '—'}</p>
          </li>
        ))}
      </ul>
    </ScrollShadow>
  );
}
