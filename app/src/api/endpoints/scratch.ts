import { get, post, put, del } from '../client';
import type { Scratch, CreateScratch, UpdateScratch } from '../types';

export const scratchApi = {
  list: () => get<Scratch[]>('/api/scratch'),
  get: (id: string) => get<Scratch>(`/api/scratch/${id}`),
  create: (data: CreateScratch) => post<Scratch>('/api/scratch', data),
  update: (id: string, data: UpdateScratch) => put<Scratch>(`/api/scratch/${id}`, data),
  delete: (id: string) => del(`/api/scratch/${id}`),
};
