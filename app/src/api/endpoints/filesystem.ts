import { get } from '../client';
import type { DirectoryListResponse } from '../types';

export const filesystemApi = {
  listDirectory: (path: string) => get<DirectoryListResponse>('/api/filesystem', { path }),
};
