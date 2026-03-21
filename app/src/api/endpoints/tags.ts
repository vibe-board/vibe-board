import { get, post, put, del } from '../client';
import type { Tag, CreateTag, UpdateTag } from '../types';

export const tagsApi = {
  list: (search?: string) => get<Tag[]>('/api/tags', { search }),
  create: (data: CreateTag) => post<Tag>('/api/tags', data),
  update: (id: string, data: UpdateTag) => put<Tag>(`/api/tags/${id}`, data),
  delete: (id: string) => del(`/api/tags/${id}`),
};
