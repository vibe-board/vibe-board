import { apiClient } from './client';
import type { ScratchType, UpdateScratch } from '@shared/types';

export const scratchApi = {
  getStreamUrl: (scratchType: ScratchType, id: string): string =>
    apiClient.wsUrl(`/api/scratch/${scratchType}/${id}/stream/ws`),
  update: (scratchType: ScratchType, id: string, body: UpdateScratch) =>
    apiClient.put(`/api/scratch/${scratchType}/${id}`, body),
  delete: (scratchType: ScratchType, id: string) =>
    apiClient.delete(`/api/scratch/${scratchType}/${id}`),
};
