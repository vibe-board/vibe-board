import { createSignal } from 'solid-js';

const [currentProjectId, setCurrentProjectId] = createSignal<string | null>(null);
const [isLoading, setIsLoading] = createSignal(false);

export function useAppStore() {
  return {
    currentProjectId,
    setCurrentProjectId,
    isLoading,
    setIsLoading,
  };
}
