import { Chip } from '@heroui/react';

// Unified status badge for the positions and orders tables.
// HeroUI "Statuses" pattern: soft variant + semantic color, capitalized label.
// active = open/in progress (warning), completed = done (success), cancelled = cancelled (danger).
const STATUS_CHIP: Record<'active' | 'completed' | 'cancelled', { label: string; color: 'warning' | 'success' | 'danger' }> = {
  active: { label: 'Active', color: 'warning' },
  completed: { label: 'Completed', color: 'success' },
  cancelled: { label: 'Cancelled', color: 'danger' },
};

export function StatusChip({ status }: { status: 'active' | 'completed' | 'cancelled' }) {
  const s = STATUS_CHIP[status];
  return (
    <Chip variant="soft" color={s.color} size="sm">
      <Chip.Label>{s.label}</Chip.Label>
    </Chip>
  );
}
