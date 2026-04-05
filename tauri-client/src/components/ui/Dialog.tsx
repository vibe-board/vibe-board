import * as React from 'react';
import {
  Dialog as HeadlessDialog,
  DialogPanel,
  DialogTitle,
  DialogDescription,
  Transition,
  TransitionChild,
} from '@headlessui/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

function Dialog({ open, onClose, children, className }: DialogProps) {
  return (
    <Transition show={open}>
      <HeadlessDialog
        onClose={onClose}
        className={cn('relative z-50', className)}
      >
        <TransitionChild
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            aria-hidden="true"
          />
        </TransitionChild>
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <TransitionChild
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel
              className={cn(
                'w-full max-w-full h-full sm:h-auto sm:max-w-lg',
                'rounded-lg bg-background p-6 shadow-lg',
                'flex flex-col',
              )}
            >
              {children}
            </DialogPanel>
          </TransitionChild>
        </div>
      </HeadlessDialog>
    </Transition>
  );
}

function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col gap-1.5 text-center sm:text-left', className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2 mt-4',
        className,
      )}
      {...props}
    />
  );
}

function DialogTitleDisplay({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <DialogTitle
      className={cn('text-lg font-semibold text-foreground', className)}
      {...props}
    >
      {children}
    </DialogTitle>
  );
}

function DialogDescriptionDisplay({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <DialogDescription
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    >
      {children}
    </DialogDescription>
  );
}

interface DialogCloseProps {
  onClose: () => void;
  className?: string;
}

function DialogClose({ onClose, className }: DialogCloseProps) {
  return (
    <button
      onClick={onClose}
      className={cn(
        'absolute right-4 top-4 min-h-[44px] min-w-[44px] flex items-center justify-center',
        'rounded-md text-muted-foreground hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      aria-label="Close"
    >
      <X className="h-4 w-4" />
    </button>
  );
}

export {
  Dialog,
  DialogHeader,
  DialogFooter,
  DialogTitleDisplay,
  DialogDescriptionDisplay,
  DialogClose,
};
