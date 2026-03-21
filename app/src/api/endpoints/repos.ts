import { get, put } from '../client';
import type { Repo, UpdateRepo, GitBranch, RepoBranchStatus, CommitInfo } from '../types';

export const reposApi = {
  list: (projectId: string) => get<Repo[]>(`/api/projects/${projectId}/repos`),
  get: (id: string) => get<Repo>(`/api/repo/${id}`),
  update: (id: string, data: UpdateRepo) => put<Repo>(`/api/repo/${id}`, data),
  getBranches: (workspaceId: string, repoId: string) => get<GitBranch[]>(`/api/repo/${workspaceId}/${repoId}/branches`),
  getBranchStatus: (workspaceId: string, repoId: string) => get<RepoBranchStatus>(`/api/repo/${workspaceId}/${repoId}/branch-status`),
  getCommits: (workspaceId: string, repoId: string) => get<CommitInfo[]>(`/api/repo/${workspaceId}/${repoId}/commits`),
};
