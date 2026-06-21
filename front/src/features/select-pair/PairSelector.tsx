import { useEffect } from 'react';
import { Select, ListBox, Skeleton } from '@heroui/react';
import { usePairs } from '@/entities/pair';
import { useDashboardState } from '@/shared/dashboard-state';

export function PairSelector() {
  const { data, isLoading } = usePairs();
  const { selectedPair, setSelectedPair } = useDashboardState();
  const pairs = data?.pairs ?? [];

  // Auto-select the first pair once the list has loaded and no pair is selected yet.
  useEffect(() => {
    if (!selectedPair && pairs.length > 0) setSelectedPair(pairs[0]!.pair);
  }, [selectedPair, pairs, setSelectedPair]);

  if (isLoading || !selectedPair) return <Skeleton className="h-9 w-40 rounded-lg" />;

  return (
    <Select
      value={selectedPair}
      onChange={(v) => v && setSelectedPair(v as string)}
      aria-label="Trading pair"
    >
      <Select.Trigger className="w-40" data-testid="pair-selector">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {pairs.map((p) => (
            <ListBox.Item key={p.pair} id={p.pair} textValue={p.pair}>
              {p.pair}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
