import { twMerge } from 'tailwind-merge';

interface StatusDotProps {
  status: 'online' | 'offline' | 'running' | 'completed' | 'failed' | 'pending';
  className?: string;
}

const colorMap = {
  online: 'bg-success',
  offline: 'bg-text-disabled',
  running: 'bg-accent animate-pulse',
  completed: 'bg-success',
  failed: 'bg-error',
  pending: 'bg-warning',
};

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span
      className={twMerge(
        'inline-block w-2 h-2 rounded-full',
        colorMap[status],
        className,
      )}
    />
  );
}
