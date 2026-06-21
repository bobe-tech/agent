import { usePositions } from '@/entities/position';
import { usePrice } from '@/entities/market';
import { Table, Chip, Skeleton } from '@heroui/react';
import { LoadError } from '@/shared/ui/load-error';
import { EmptyState } from '@/shared/ui/empty-state';
import { SignedMoney } from '@/shared/ui/signed-money';
import { StatusChip } from '@/shared/ui/status-chip';
import { formatUsd, formatPct, formatPrice } from '@/shared/lib/format';

export type PositionStatusFilter = 'all' | 'active' | 'completed' | 'cancelled';

// Unrealized PnL of an open position based on the current price: LONG grows with the price, SHORT grows when it falls.
function unrealized(
  side: 'LONG' | 'SHORT',
  openedPrice: number,
  openedAmount: number,
  last: number | undefined,
) {
  if (last == null || !openedPrice) return null;
  const pct = side === 'LONG' ? last / openedPrice - 1 : 1 - last / openedPrice;
  return { usd: pct * openedAmount, pct: pct * 100 };
}

export function PositionsTable({ pair, status = 'all' }: { pair: string | null; status?: PositionStatusFilter }) {
  const { data, isLoading, isError } = usePositions(pair);
  const { data: price } = usePrice(pair);
  const rows = (data?.positions ?? []).filter((p) => status === 'all' || p.status === status);

  if (isError) return <LoadError />;
  if (isLoading) return <Skeleton className="h-40 w-full rounded-lg" />;
  if (rows.length === 0) return <EmptyState />;

  return (
    <Table>
      <Table.ScrollContainer className="max-h-[28rem]">
        <Table.Content aria-label="Positions" className="min-w-[40rem]">
          <Table.Header>
            <Table.Column isRowHeader>Side</Table.Column>
            <Table.Column>Status</Table.Column>
            <Table.Column className="text-right">Size</Table.Column>
            <Table.Column className="text-right">Avg. entry</Table.Column>
            <Table.Column className="text-right">PnL</Table.Column>
          </Table.Header>
          <Table.Body>
            {rows.map((p) => {
              const openedPriceNum = p.opened_price != null ? Number(p.opened_price) : null;
              const openedAmountNum = p.opened_amount != null ? Number(p.opened_amount) : null;
              const u =
                p.status === 'active' && openedPriceNum != null && openedAmountNum != null
                  ? unrealized(p.side, openedPriceNum, openedAmountNum, price?.last)
                  : null;
              return (
                <Table.Row key={p.id} id={p.id}>
                  <Table.Cell>
                    <Chip color={p.side === 'LONG' ? 'success' : 'danger'} variant="soft" size="sm">
                      {p.side === 'LONG' ? 'Long' : 'Short'}
                    </Chip>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-col items-start gap-0.5">
                      <StatusChip status={p.status} />
                      {p.force_closed && (
                        <span className="text-xs text-muted">force-closed</span>
                      )}
                    </div>
                  </Table.Cell>
                  <Table.Cell className="text-right tabular-nums">
                    {openedAmountNum != null ? formatUsd(openedAmountNum) : '—'}
                  </Table.Cell>
                  <Table.Cell className="text-right tabular-nums">
                    {openedPriceNum != null ? formatPrice(openedPriceNum) : '—'}
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    {p.status === 'completed' && p.realized_pnl_usd != null ? (
                      <span className="tabular-nums">
                        <SignedMoney v={Number(p.realized_pnl_usd)} />{' '}
                        {p.realized_pnl_pct != null && (
                          <span className="text-muted">({formatPct(Number(p.realized_pnl_pct))})</span>
                        )}
                      </span>
                    ) : u ? (
                      <span className="tabular-nums">
                        <SignedMoney v={u.usd} /> <span className="text-muted">({formatPct(u.pct)})</span>
                      </span>
                    ) : (
                      <span className="tabular-nums text-muted">—</span>
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
