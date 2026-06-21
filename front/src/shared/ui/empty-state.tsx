import { Inbox } from 'lucide-react';

// Unified empty state for tables: icon above text, centered vertically and horizontally.
export function EmptyState({ text = 'No records found' }: { text?: string }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 text-muted">
      <Inbox className="size-8 opacity-40" aria-hidden="true" />
      <p className="text-sm">{text}</p>
    </div>
  );
}
