import { useCallback } from 'react';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import { scratchApi } from '../scratchApi';
import type { ScratchType, Scratch, UpdateScratch } from '@shared/types';

type ScratchState = {
  scratch: Scratch | null;
};

export interface UseScratchResult {
  scratch: Scratch | null;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
  updateScratch: (update: UpdateScratch) => Promise<void>;
  deleteScratch: () => Promise<void>;
}

export const useScratch = (
  scratchType: ScratchType,
  id: string,
  enabled = true,
): UseScratchResult => {
  const active = enabled && id.length > 0;
  const endpoint = active
    ? scratchApi.getStreamUrl(scratchType, id)
    : undefined;

  const initialData = useCallback(
    (): ScratchState => ({ scratch: null }),
    [],
  );

  const { data, isConnected, isInitialized, error } =
    useJsonPatchWsStream<ScratchState>(endpoint, active, initialData);

  const rawScratch = data?.scratch as (Scratch & { deleted?: boolean }) | null;
  const scratch = rawScratch?.deleted ? null : rawScratch;

  const updateScratch = useCallback(
    async (update: UpdateScratch) => {
      await scratchApi.update(scratchType, id, update);
    },
    [scratchType, id],
  );

  const deleteScratch = useCallback(async () => {
    try {
      await scratchApi.delete(scratchType, id);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('Scratch not found')) {
        return;
      }
      throw e;
    }
  }, [scratchType, id]);

  const isLoading = !isInitialized && !error;

  return {
    scratch,
    isLoading,
    isConnected,
    error,
    updateScratch,
    deleteScratch,
  };
};
