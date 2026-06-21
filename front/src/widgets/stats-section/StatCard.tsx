import { Card, Chip, Skeleton } from '@heroui/react';

export type Trend = 'up' | 'down' | 'neutral';

export interface StatCardProps {
  title: string;
  value: string;
  badge?: string;
  trend?: Trend;
  hint?: string;
  loading?: boolean;
  error?: boolean;
}

export function StatCard({ title, value, badge, trend = 'neutral', hint, loading, error }: StatCardProps) {
  const chipColor = trend === 'up' ? 'success' : trend === 'down' ? 'danger' : 'default';
  return (
    <Card className="h-full">
      <Card.Header>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted">{title}</span>
          {!loading && !error && badge && (
            <Chip color={chipColor} variant="secondary" size="sm" className="tabular-nums">
              {badge}
            </Chip>
          )}
        </div>
        {loading ? (
          <Skeleton className="mt-1 h-8 w-28 rounded-lg" />
        ) : (
          <div className="text-2xl font-semibold tabular-nums">{error ? '—' : value}</div>
        )}
      </Card.Header>
      {hint && <Card.Content className="pt-0 text-xs text-muted">{hint}</Card.Content>}
    </Card>
  );
}
