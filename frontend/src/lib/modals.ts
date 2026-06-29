import NiceModal from '@ebay/nice-modal-react';
import type React from 'react';
import type { NiceModalHocProps } from '@ebay/nice-modal-react';
import { useInRouterContext } from 'react-router-dom';
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
// store. When a modal is shown, EVERY provider renders its own copy of the
// component. Two of those copies are dangerous:
//   1. The connectionless gateway-shell provider sits outside <ConnectionProvider>,
//      so a body calling useConnection() (directly or via useApi/useUserSystem)
//      crashes there.
//   2. That same gateway-shell provider also sits outside any <Router>, so a body
//      calling a react-router hook (useNavigate via useTaskMutations, etc.)
//      crashes there too — even though a connection IS present.
//
// `createModal` is the single entry point for defining a modal component. BY
// DEFAULT it gates the body so it only renders inside the full app context — a
// provider copy that has BOTH an active connection AND a Router. Every other
// copy renders nothing. The real dialog is the copy mounted inside <App> (which
// always provides both), so behavior is unchanged while the bad copies are
// silently suppressed. This replaces hand-wrapping each modal and cannot be
// forgotten.
//
// Pass { requireConnection: false } ONLY for a modal that never touches the
// connection or router AND must open from the connectionless, Router-less
// gateway context (e.g. the gateway home tab). Such a modal renders ungated.
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
        const inRouter = useInRouterContext();
        if (!conn || !inRouter) return null;
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
