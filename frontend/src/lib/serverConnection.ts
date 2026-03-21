/**
 * Helpers for creating WebSockets and resolving URLs through the active server.
 *
 * All 6 call-sites that previously inlined getGatewayConnection() checks
 * should use these helpers instead.
 */
import { getActiveServer } from '@/lib/activeServer';
import type { RemoteWs } from '@/lib/e2ee/remoteWs';

/**
 * Create a WebSocket (or RemoteWs for E2EE) routed through the active server.
 *
 * @param endpoint  HTTP(S) or WS(S) URL, e.g. "/api/projects/stream/ws"
 * @param query     Optional query string (without leading '?')
 */
export function createServerWebSocket(
  endpoint: string,
  query?: string
): WebSocket | RemoteWs {
  const server = getActiveServer();

  // E2EE mode: proxy via encrypted WebSocket bridge
  if (server?.connection) {
    const url = new URL(endpoint, 'http://localhost');
    return server.connection.openWsStream(
      url.pathname,
      query || url.search?.substring(1) || undefined
    );
  }

  // Direct mode (Tauri): prefix with server base URL
  if (server?.baseUrl) {
    const wsBase = server.baseUrl
      .replace(/^https:/, 'wss:')
      .replace(/^http:/, 'ws:');
    const wsUrl = query
      ? `${wsBase}${endpoint}?${query}`
      : `${wsBase}${endpoint}`;
    return new WebSocket(wsUrl);
  }

  // Same-origin browser mode
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  // endpoint may already be ws:// (from useLogStream) or /api/... (relative)
  if (endpoint.startsWith('ws://') || endpoint.startsWith('wss://')) {
    return new WebSocket(query ? `${endpoint}?${query}` : endpoint);
  }
  const wsUrl = query
    ? `${protocol}//${host}${endpoint}?${query}`
    : `${protocol}//${host}${endpoint}`;
  return new WebSocket(wsUrl);
}

/**
 * Resolve an API path to a full URL, adding baseUrl for direct-mode servers.
 */
export function resolveApiUrl(path: string): string {
  const server = getActiveServer();
  if (server?.baseUrl) return `${server.baseUrl}${path}`;
  return path;
}
