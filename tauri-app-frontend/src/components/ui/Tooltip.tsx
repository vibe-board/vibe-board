import { useState, type ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

interface TooltipProps {
  children: ReactNode;
  content: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function Tooltip({ children, content, side = 'top', className }: TooltipProps) {
  const [show, setShow] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          className={twMerge(
            'absolute z-50 px-2 py-1 bg-bg-elevated border border-border rounded text-xs text-text-primary whitespace-nowrap pointer-events-none animate-fade-in',
            positionClasses[side],
            className,
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
