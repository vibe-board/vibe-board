import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-accent text-white',
        secondary: 'border-transparent bg-surface-overlay text-text-secondary',
        destructive: 'border-transparent bg-red-600/20 text-red-400',
        outline: 'border-border text-text-secondary',
        todo: 'border-transparent bg-[#8b8b9e]/20 text-[#8b8b9e]',
        inprogress: 'border-transparent bg-[#f59e0b]/20 text-[#f59e0b]',
        inreview: 'border-transparent bg-[#5e6ad2]/20 text-[#5e6ad2]',
        done: 'border-transparent bg-[#22c55e]/20 text-[#22c55e]',
        cancelled: 'border-transparent bg-[#ef4444]/20 text-[#ef4444]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
