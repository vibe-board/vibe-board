import { twMerge } from 'tailwind-merge';
import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}

export function Card({ children, className, padding = true }: CardProps) {
  return (
    <div
      className={twMerge(
        'bg-bg-secondary border border-border rounded-md',
        padding && 'p-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
