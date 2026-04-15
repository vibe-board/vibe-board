# Multi-Tab Parallel Requests

## Problem

The frontend routes all HTTP and WebSocket requests through a global singleton `activeConnection` in `gatewayMode.ts`. All project tabs stay mounted (hidden via CSS) but only the last-rendered tab's connection occupies the singleton. This means:

- Hidden tabs that try to fetch data (react-query refetch, WebSocket reconnect) hit the wrong connection or fall through to `tauri://localhost`, causing 404s.
- Switching tabs requires react-query to refetch everything, even when data was already loaded.
- Two tabs connected to different machines can never have concurrent in-flight requests.

## Solution

Replace the global singleton with per-tab connection scoping via a `useApi()` hook and `createApi(conn)` factory.

## Architecture

### Current flow (broken)

```
Component → import { projectsApi } from '@/lib/api'
         → projectsApi.getAll()
         → makeRequest('/api/projects')
         → getActiveConnection()          ← global singleton, wrong for hidden tabs
         → conn.fetch(...)
```

### New flow

```
Component → const { projectsApi } = useApi()
         → projectsApi.getAll()
         → makeReq('/api/projects')       ← closure over per-tab connection
         → conn.fetch(...)
```

## Detailed Changes

### 1. `api.ts` — factory functions

Convert each API namespace from a module-level constant to a factory function that receives a `makeRequest` closure:

```typescript
type MakeRequestFn = (url: string, options?: RequestInit, extra?: { timeoutMs?: number }) => Promise<Response>;

function createProjectsApi(makeReq: MakeRequestFn): typeof projectsApi { ... }
function createTasksApi(makeReq: MakeRequestFn): typeof tasksApi { ... }
// ... one factory per namespace

export function createApi(conn: UnifiedConnection | null) {
  const makeReq: MakeRequestFn = (url, options, extra) => {
    const headers = new Headers(options?.headers ?? {});
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (conn) return conn.fetch(url, { ...options, headers }, extra);
    const baseUrl = getApiBaseUrl();
    return fetch(baseUrl ? `${baseUrl}${url}` : url, { ...options, headers });
  };

  return {
    projectsApi: createProjectsApi(makeReq),
    tasksApi: createTasksApi(makeReq),
    sessionsApi: createSessionsApi(makeReq),
    attemptsApi: createAttemptsApi(makeReq),
    executionProcessesApi: createExecutionProcessesApi(makeReq),
    fileSystemApi: createFileSystemApi(makeReq),
    repoApi: createRepoApi(makeReq),
    configApi: createConfigApi(makeReq),
    tagsApi: createTagsApi(makeReq),
    mcpServersApi: createMcpServersApi(makeReq),
    profilesApi: createProfilesApi(makeReq),
    configTransferApi: createConfigTransferApi(makeReq),
    imagesApi: createImagesApi(makeReq),
    approvalsApi: createApprovalsApi(makeReq),
    oauthApi: createOauthApi(makeReq),
    scratchApi: createScratchApi(makeReq),
    agentsApi: createAgentsApi(makeReq),
    queueApi: createQueueApi(makeReq),
    searchApi: createSearchApi(makeReq),
    systemApi: createSystemApi(makeReq),
  };
}

// Backward compat: module-level exports use legacy makeRequest (reads global singleton)
export const projectsApi = createProjectsApi(legacyMakeRequest);
// ... etc.
```

The legacy exports remain so un-migrated code still compiles. They will be removed after all consumers are migrated.

### 2. `hooks/useApi.ts` — connection-scoped API hook

```typescript
import { useMemo } from 'react';
import { useConnection } from '@/contexts/ConnectionContext';
import { createApi } from '@/lib/api';

export function useApi() {
  const conn = useConnection();
  return useMemo(() => createApi(conn), [conn]);
}
```

### 3. Consumer migration (91 files)

Each file that imports API namespaces from `@/lib/api` gets a mechanical transformation:

**Before:**
```typescript
import { projectsApi, tasksApi } from '@/lib/api';

function MyComponent() {
  // uses projectsApi.getAll(), tasksApi.create(), etc.
}
```

**After:**
```typescript
import { useApi } from '@/hooks/useApi';

function MyComponent() {
  const { projectsApi, tasksApi } = useApi();
  // rest unchanged
}
```

For non-component consumers (utility functions called from hooks), the connection is passed as a parameter:

```typescript
// Before
export async function someUtil() {
  return projectsApi.getAll();
}

// After
export async function someUtil(projectsApi: ReturnType<typeof createApi>['projectsApi']) {
  return projectsApi.getAll();
}
```

### 4. WebSocket hooks — use context instead of singleton

| File | Change |
|------|--------|
| `useJsonPatchWsStream.ts` | Add `conn` parameter or use `useOptionalConnection()` internally; replace `getActiveConnection()` call |
| `useLogStream.ts` | Use `useConnection()` internally |
| `XTermInstance.tsx` | Use `useConnection()` internally |
| `streamJsonPatchEntries.ts` | Add `conn: UnifiedConnection` parameter; callers pass it from context |

### 5. `gatewayMode.ts` cleanup

After all consumers are migrated:
- Remove `activeConnection` singleton
- Remove `getActiveConnection()`, `setActiveConnection()`
- Remove `getGatewayConnection()`, `setGatewayConnection()`, `isGatewayMode()`, `detectGatewayMode()`
- `ConnectionContext.tsx` no longer needs to set/clear the global

### 6. `getWsBaseUrl()` removal

This function exists solely to derive a WS URL from the global singleton. After migration:
- WebSocket hooks get the URL from `conn.url` directly
- `getWsBaseUrl()` can be removed or reduced to a pure function `getWsBaseUrlFrom(conn)`

## Migration Order

1. Add `createApi()` factory and `useApi()` hook (no breaking changes)
2. Migrate WebSocket hooks to use context (4 files)
3. Migrate 91 consumer files (mechanical, batch-processable)
4. Remove legacy global exports and singleton

Steps 1-2 can ship independently. Step 3 is a large but mechanical change.

## What stays the same

- `UnifiedConnection` interface — unchanged
- `ConnectionProvider` / `useConnection()` — unchanged (already works per-tab)
- `QueryClientProvider` per-tab — already correct
- `handleApiResponse` / `ApiError` — unchanged, just receives responses from a different `makeRequest`

## Testing

- Existing TypeScript checks (`pnpm run check`) validate all consumer migrations
- Open two project tabs simultaneously (one direct, one gateway) and verify both load data independently
- Switch between tabs and confirm no stale/wrong data
- Verify WebSocket streams (project list, logs, terminal) work on both tabs concurrently
