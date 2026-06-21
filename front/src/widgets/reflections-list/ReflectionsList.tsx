import { useReflections } from '@/entities/reflection';
import { Skeleton, ScrollShadow } from '@heroui/react';
import { LoadError } from '@/shared/ui/load-error';
import { EmptyState } from '@/shared/ui/empty-state';
import { formatDateTime } from '@/shared/lib/format';

// Content of the self-learning conclusions list (reflection_log) — without Card.
export function ReflectionsList({ pair }: { pair: string | null }) {
  const { data, isLoading, isError } = useReflections(pair);
  const rows = data?.reflections ?? [];

  if (isError) return <LoadError />;
  if (isLoading) return <Skeleton className="h-40 w-full rounded-lg" />;
  if (rows.length === 0) return <EmptyState />;

  return (
    <ScrollShadow className="h-[28rem] pr-3">
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="border-b border-separator pb-2 last:border-0">
            <div className="text-xs text-muted tabular-nums">{formatDateTime(r.ts)}</div>
            <p className="text-sm">{r.summary}</p>
          </li>
        ))}
      </ul>
    </ScrollShadow>
  );
}
