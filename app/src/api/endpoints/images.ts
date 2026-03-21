import { get, post } from '../client';
import type { ImageResponse } from '../types';
import { getBaseUrl } from '../client';

export const imagesApi = {
  upload: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const resp = await fetch(`${getBaseUrl()}/api/images`, { method: 'POST', body: formData });
    return resp.json() as Promise<ImageResponse>;
  },
  getUrl: (id: string) => `${getBaseUrl()}/api/images/${id}`,
};
