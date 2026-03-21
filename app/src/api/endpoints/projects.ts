import { get, post, put, del } from '../client';
import type { Project, CreateProject, UpdateProject } from '../types';

export const projectsApi = {
  list: () => get<Project[]>('/api/projects'),
  get: (id: string) => get<Project>(`/api/projects/${id}`),
  create: (data: CreateProject) => post<Project>('/api/projects', data),
  update: (id: string, data: UpdateProject) => put<Project>(`/api/projects/${id}`, data),
  delete: (id: string) => del(`/api/projects/${id}`),
};
