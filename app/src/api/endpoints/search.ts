import { get } from '../client';
import type { SearchResult } from '../types';

export const searchApi = {
  files: (projectId: string, query: string, repoId?: string) =>
    get<SearchResult[]>('/api/search/files', { project_id: projectId, query, repo_id: repoId }),
};
