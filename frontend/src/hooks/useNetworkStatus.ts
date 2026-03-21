import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

/**
 * Reactive hook that returns true when the browser is online.
 */
export function useNetworkStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
