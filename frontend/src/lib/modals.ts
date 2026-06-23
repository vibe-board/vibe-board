import NiceModal from '@ebay/nice-modal-react';
import type React from 'react';
import type { NiceModalHocProps } from '@ebay/nice-modal-react';
import { useOptionalConnection } from '@/contexts/ConnectionContext';

// Use this instead of {} to avoid ban-types
export type NoProps = Record<string, never>;

// Map P for component props: void -> NoProps; otherwise P
type ComponentProps<P> = [P] extends [void] ? NoProps : P;

// Map P for .show() args: void -> []; otherwise [props: P]
type ShowArgs<P> = [P] extends [void] ? [] : [props: P];

// Modalized component with static show/hide/remove methods
export type Modalized<P, R> = React.ComponentType<ComponentProps<P>> & {
  __modalResult?: R;
  show: (...args: ShowArgs<P>) => Promise<R>;
  hide: () => void;
  remove: () => void;
};

export function defineModal<P, R>(
  component: React.ComponentType<ComponentProps<P> & NiceModalHocProps>
): Modalized<P, R> {
  const c = component as unknown as Modalized<P, R>;
  c.show = ((...args: ShowArgs<P>) => {
    return NiceModal.show(
      component as React.FC<ComponentProps<P>>,
      args[0] as ComponentProps<P>
    ) as Promise<R>;
  }) as Modalized<P, R>['show'];
  c.hide = () => {
    NiceModal.hide(component as React.FC<ComponentProps<P>>);
  };
  c.remove = () => {
    NiceModal.remove(component as React.FC<ComponentProps<P>>);
  };
  return c;
}

// The app mounts multiple <NiceModal.Provider> instances that share one modal
// store (one per connection tab plus a connectionless gateway-shell provider).
// When a modal is shown, every provider renders its own copy of the component.
// A modal whose body calls useConnection() (directly or via useApi) crashes in
// any provider that sits outside a <ConnectionProvider>. Wrap such a modal's
// render with this so the connectionless copies render nothing; the copy inside
// a <ConnectionProvider> renders the real dialog.
export function connectionGated<P extends object>(
  render: (props: P) => React.ReactElement | null
): (props: P) => React.ReactElement | null {
  return function ConnectionGatedModal(props: P) {
    const conn = useOptionalConnection();
    if (!conn) return null;
    return render(props);
  };
}

// Common modal result types for standardization
export type ConfirmResult = 'confirmed' | 'canceled';
export type DeleteResult = 'deleted' | 'canceled';
export type SaveResult = 'saved' | 'canceled';

// Error handling utility for modal operations
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}
