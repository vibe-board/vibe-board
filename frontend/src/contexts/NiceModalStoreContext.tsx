import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useMemo,
  useReducer,
} from 'react';
import NiceModal from '@ebay/nice-modal-react';

type NiceModalState = Record<string, unknown>;
type NiceModalAction = Parameters<typeof NiceModal.reducer>[1];

interface NiceModalStoreValue {
  modals: NiceModalState;
  dispatch: Dispatch<NiceModalAction>;
}

const NiceModalStoreContext = createContext<NiceModalStoreValue | null>(null);

export function NiceModalStoreProvider({ children }: { children: ReactNode }) {
  const [modals, dispatch] = useReducer(NiceModal.reducer, {});
  const value = useMemo(() => ({ modals, dispatch }), [modals, dispatch]);

  return (
    <NiceModalStoreContext.Provider value={value}>
      {children}
    </NiceModalStoreContext.Provider>
  );
}

export function ScopedNiceModalProvider({ children }: { children: ReactNode }) {
  const store = useContext(NiceModalStoreContext);

  if (!store) {
    return <NiceModal.Provider>{children}</NiceModal.Provider>;
  }

  return (
    <NiceModal.Provider modals={store.modals} dispatch={store.dispatch}>
      {children}
    </NiceModal.Provider>
  );
}
