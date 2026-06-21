import { cn } from '@/shared/lib/utils';
import { formatUsd } from '@/shared/lib/format';

// Signed money value: color + non-color marker (▲/▼) and aria-label — not color alone (a11y).
export function SignedMoney({
  v,
  className,
  size = 'base',
}: {
  v: number | null | undefined;
  className?: string;
  size?: 'base' | 'lg';
}) {
  const sign = v == null || !Number.isFinite(v) ? 0 : Math.sign(v);
  const cls = sign > 0 ? 'text-emerald-500' : sign < 0 ? 'text-red-500' : '';
  const marker = sign > 0 ? '▲' : sign < 0 ? '▼' : '';
  const label = sign > 0 ? 'profit' : sign < 0 ? 'loss' : undefined;
  return (
    <span
      className={cn('font-semibold tabular-nums', size === 'lg' && 'text-lg', cls, className)}
      aria-label={label}
    >
      {marker && (
        <span aria-hidden="true" className="mr-0.5 text-xs">
          {marker}
        </span>
      )}
      <span>{formatUsd(v, { signed: true })}</span>
    </span>
  );
}
