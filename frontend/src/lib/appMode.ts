type AppMode = 'local-direct' | 'gateway' | 'tauri';

export const appMode: AppMode = (() => {
  const m = import.meta.env.VITE_APP_MODE;
  if (m === 'local-direct') return 'local-direct';
  if (m === 'gateway') return 'gateway';
  return 'tauri';
})();

export const isLocalDirect = appMode === 'local-direct';
export const isGateway = appMode === 'gateway';
export const isTauri = appMode === 'tauri';
