import type { ApiResponse } from '@/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  token?: string;
  gatewayMode?: boolean;
  onUnauthorized?: () => void;
}

export function createApiClient(options: ApiClientOptions) {
  const { baseUrl, token, gatewayMode, onUnauthorized } = options;

  function buildUrl(path: string): string {
    const base = baseUrl.replace(/\/$/, '');
    const clean = path.startsWith('/') ? path : `/${path}`;
    return `${base}${clean}`;
  }

  function buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extra,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<ApiResponse<T>> {
    const url = buildUrl(path);
    const init: RequestInit = {
      method,
      headers: buildHeaders(extraHeaders),
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const res = await fetch(url, init);

    if (res.status === 401 && onUnauthorized) {
      onUnauthorized();
    }

    if (!res.ok) {
      const text = await res.text().catch(() => 'Request failed');
      throw new ApiError(res.status, text);
    }

    const json = (await res.json()) as ApiResponse<T>;
    if (json.status === 'error') {
      throw new ApiError(res.status, json.error ?? 'Unknown error', json);
    }
    return json;
  }

  return {
    get: <T>(path: string, headers?: Record<string, string>) =>
      request<T>('GET', path, undefined, headers),
    post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
      request<T>('POST', path, body, headers),
    put: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
      request<T>('PUT', path, body, headers),
    delete: <T>(path: string, headers?: Record<string, string>) =>
      request<T>('DELETE', path, undefined, headers),
    patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
      request<T>('PATCH', path, body, headers),

    raw: request,

    get baseUrl() {
      return baseUrl;
    },

    get isGatewayMode() {
      return gatewayMode ?? false;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
