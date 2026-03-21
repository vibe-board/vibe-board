import { getE2eeConnection } from './gateway';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public error_data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiResponse<T, E = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  error_data?: E;
}

async function makeRequest(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const conn = getE2eeConnection();
  if (conn && conn.connected) {
    return conn.remoteFetch(url, options);
  }
  return fetch(url, options);
}

export async function handleApiResponse<T, E = unknown>(
  response: Response
): Promise<T> {
  const json: ApiResponse<T, E> = await response.json();
  if (!json.success) {
    throw new ApiError(
      json.message ?? json.error ?? 'Unknown error',
      response.status,
      json.error_data
    );
  }
  return json.data as T;
}

export const projectsApi = {
  list: (serverUrl: string) =>
    makeRequest(`${serverUrl}/api/projects`).then(handleApiResponse),
  get: (serverUrl: string, id: string) =>
    makeRequest(`${serverUrl}/api/projects/${id}`).then(handleApiResponse),
  create: (serverUrl: string, data: { name: string; description?: string }) =>
    makeRequest(`${serverUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(handleApiResponse),
  delete: (serverUrl: string, id: string) =>
    makeRequest(`${serverUrl}/api/projects/${id}`, {
      method: 'DELETE',
    }).then(handleApiResponse),
};

export const tasksApi = {
  list: (serverUrl: string, projectId: string) =>
    makeRequest(`${serverUrl}/api/projects/${projectId}/tasks`).then(
      handleApiResponse
    ),
  get: (serverUrl: string, projectId: string, taskId: string) =>
    makeRequest(`${serverUrl}/api/projects/${projectId}/tasks/${taskId}`).then(
      handleApiResponse
    ),
  create: (
    serverUrl: string,
    projectId: string,
    data: { title: string; description?: string; status?: string }
  ) =>
    makeRequest(`${serverUrl}/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(handleApiResponse),
  update: (
    serverUrl: string,
    projectId: string,
    taskId: string,
    data: Record<string, unknown>
  ) =>
    makeRequest(`${serverUrl}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(handleApiResponse),
  delete: (serverUrl: string, projectId: string, taskId: string) =>
    makeRequest(`${serverUrl}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'DELETE',
    }).then(handleApiResponse),
};

export const configApi = {
  get: (serverUrl: string) =>
    makeRequest(`${serverUrl}/api/config`).then(handleApiResponse),
  gatewayInfo: (serverUrl: string) =>
    makeRequest(`${serverUrl}/api/gateway/info`).then(handleApiResponse),
};
