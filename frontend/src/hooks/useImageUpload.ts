import { useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import type { ImageResponse } from 'shared/types';

export function useImageUpload() {
  const { imagesApi } = useApi();
  const upload = useCallback(
    async (file: File): Promise<ImageResponse> => {
      return imagesApi.upload(file);
    },
    [imagesApi]
  );

  const uploadForTask = useCallback(
    async (taskId: string, file: File): Promise<ImageResponse> => {
      return imagesApi.uploadForTask(taskId, file);
    },
    [imagesApi]
  );

  const deleteImage = useCallback(
    async (imageId: string): Promise<void> => {
      return imagesApi.delete(imageId);
    },
    [imagesApi]
  );

  return {
    upload,
    uploadForTask,
    deleteImage,
  };
}
