import { cn } from '@/shared/lib/utils';

// Unified error state for widget data loading (role="alert" for screen readers).
export function LoadError({ message = 'Failed to load data', className }: { message?: string; className?: string }) {
  return (
    <p role="alert" className={cn('py-6 text-center text-sm text-danger', className)}>
      {message}
    </p>
  );
}
