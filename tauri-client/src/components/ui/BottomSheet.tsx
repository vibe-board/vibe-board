import * as React from 'react';
import { Drawer } from 'vaul';
import { cn } from '@/lib/utils';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  snapPoints?: number[];
  className?: string;
}

function BottomSheet({
  open,
  onClose,
  children,
  title,
  snapPoints,
  className,
}: BottomSheetProps) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      snapPoints={snapPoints}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Drawer.Content
          className={cn(
            'fixed bottom-0 left-0 right-0 z-50',
            'mt-24 flex flex-col rounded-t-[16px] bg-background',
            'max-h-[90vh]',
            className,
          )}
        >
          <div className="mx-auto mt-3 mb-2 h-1.5 w-12 rounded-full bg-muted-foreground/30" />
          {title && (
            <div className="px-4 pb-2">
              <Drawer.Title className="text-lg font-semibold text-foreground">
                {title}
              </Drawer.Title>
            </div>
          )}
          <div className="flex-1 overflow-auto px-4 pb-6">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function BottomSheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4', className)} {...props} />;
}

function BottomSheetBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex-1', className)} {...props} />;
}

export { BottomSheet, BottomSheetHeader, BottomSheetBody };
