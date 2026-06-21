import { useOrders } from '@/entities/order';
import { Table, Chip, Skeleton } from '@heroui/react';
import { LoadError } from '@/shared/ui/load-error';
import { EmptyState } from '@/shared/ui/empty-state';
import { StatusChip } from '@/shared/ui/status-chip';
import { formatPrice, formatUsd, formatDateTime } from '@/shared/lib/format';

export type OrderActionFilter = 'all' | 'open' | 'add' | 'close';

// Order type — a neutral unified badge (distinguished by text, not color).
const ACTION_LABEL: Record<'open' | 'add' | 'close', string> = {
  open: 'Entry',
  add: 'Averaging',
  close: 'Close',
};

function actionChip(action: 'open' | 'add' | 'close') {
  return <Chip variant="secondary" size="sm">{ACTION_LABEL[action]}</Chip>;
}

export function OrdersTable({ pair, action = 'all' }: { pair: string | null; action?: OrderActionFilter }) {
  const { data, isLoading, isError } = useOrders(pair);
  const allRows = data?.orders ?? [];
  const rows = action === 'all' ? allRows : allRows.filter((o) => o.action === action);

  if (isError) return <LoadError />;
  if (isLoading) return <Skeleton className="h-40 w-full rounded-lg" />;
  if (rows.length === 0) return <EmptyState />;

  return (
    <Table>
      <Table.ScrollContainer className="max-h-[28rem]">
        <Table.Content aria-label="Orders" className="min-w-[44rem]">
          <Table.Header>
            <Table.Column isRowHeader>Type</Table.Column>
            <Table.Column>Status</Table.Column>
            <Table.Column className="text-right">Size</Table.Column>
            <Table.Column className="text-right">Amount (USDT)</Table.Column>
            <Table.Column className="text-right">Price</Table.Column>
            <Table.Column className="text-right">Time</Table.Column>
            <Table.Column className="text-right">Tx</Table.Column>
          </Table.Header>
          <Table.Body>
            {rows.map((o) => {
              // Show executed values; if absent, fall back to the plan (start_*)
              const size = o.comp_size != null && Number(o.comp_size) !== 0
                ? o.comp_size
                : o.start_size;
              const amount = o.comp_amount != null && Number(o.comp_amount) !== 0
                ? Number(o.comp_amount)
                : null;
              const price = o.comp_price != null ? Number(o.comp_price) : null;

              return (
                <Table.Row key={o.id} id={o.id}>
                  <Table.Cell>{actionChip(o.action)}</Table.Cell>
                  <Table.Cell><StatusChip status={o.status} /></Table.Cell>
                  <Table.Cell className="text-right tabular-nums">
                    {size != null ? Number(size).toFixed(6) : '—'}
                  </Table.Cell>
                  <Table.Cell className="text-right tabular-nums">
                    {amount != null ? formatUsd(amount) : '—'}
                  </Table.Cell>
                  <Table.Cell className="text-right tabular-nums">
                    {price != null ? formatPrice(price) : '—'}
                  </Table.Cell>
                  <Table.Cell className="text-right tabular-nums text-sm">
                    {formatDateTime(o.created_at)}
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    {o.tx_id ? (
                      <a
                        href={`https://bscscan.com/tx/${o.tx_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-accent underline-offset-2 hover:underline"
                      >
                        {o.tx_id.slice(0, 6)}…{o.tx_id.slice(-4)}
                      </a>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}
