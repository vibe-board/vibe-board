import { type ReactNode, type HTMLAttributes, forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';

interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={twMerge('overflow-auto', className)}
      {...props}
    >
      {children}
    </div>
  ),
);

ScrollArea.displayName = 'ScrollArea';
