import { get, post, put, del } from '../client';
import type { Task, TaskWithAttemptStatus, TaskRelationships, CreateTask, UpdateTask, CreateAndStartTaskRequest } from '../types';

export const tasksApi = {
  list: (projectId: string) => get<TaskWithAttemptStatus[]>('/api/tasks', { project_id: projectId }),
  get: (id: string) => get<Task>(`/api/tasks/${id}`),
  getRelationships: (id: string) => get<TaskRelationships>(`/api/tasks/${id}/relationships`),
  create: (data: CreateTask) => post<Task>('/api/tasks', data),
  createAndStart: (data: CreateAndStartTaskRequest) => post<Task>('/api/tasks/create-and-start', data),
  update: (id: string, data: UpdateTask) => put<Task>(`/api/tasks/${id}`, data),
  delete: (id: string) => del(`/api/tasks/${id}`),
};
