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
// any provider that sits outside a <ConnectionProvider>.
//
// `createModal` is the single entry point for defining a modal component. It
// gates the body on the active connection BY DEFAULT, so connectionless copies
// render nothing while the copy inside a <ConnectionProvider> renders the real
// dialog. This replaces hand-wrapping each modal with connectionGated() — the
// protection is now applied centrally and cannot be forgotten.
//
// Pass { requireConnection: false } ONLY for a modal that (a) never touches the
// connection and (b) must be able to open from a connectionless context (e.g.
// the gateway home tab). Gating such a modal would make it impossible to open
// there.
export interface CreateModalOptions {
  requireConnection?: boolean;
}

export function createModal<P>(
  render: (props: ComponentProps<P>) => React.ReactElement | null,
  options: CreateModalOptions = {}
): React.FC<ComponentProps<P>> {
  const { requireConnection = true } = options;
  const Body: React.FC<ComponentProps<P>> = requireConnection
    ? (props) => {
        const conn = useOptionalConnection();
        if (!conn) return null;
        return render(props);
      }
    : render;
  return NiceModal.create(
    Body as React.FC<ComponentProps<P> & NiceModalHocProps>
  ) as unknown as React.FC<ComponentProps<P>>;
}

// Lower-level gate, kept for direct use and for the connectionGated unit test.
// Prefer createModal() in dialog definitions.
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
