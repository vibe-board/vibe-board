import { forwardRef, type InputHTMLAttributes } from 'react';
import { twMerge } from 'tailwind-merge';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm text-text-secondary font-medium">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={twMerge(
          'w-full px-3 py-2 bg-bg-primary border rounded text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors duration-100',
          error ? 'border-error' : 'border-border',
          className,
        )}
        {...props}
      />
      {error && <span className="text-xs text-error">{error}</span>}
    </div>
  ),
);

Input.displayName = 'Input';
