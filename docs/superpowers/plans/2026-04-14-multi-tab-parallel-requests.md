# Multi-Tab Parallel Requests Implementation Plan

**Spec**: `docs/superpowers/specs/2026-04-14-multi-tab-parallel-requests-design.md`

## Problem

`api.ts` uses a module-level singleton (`getActiveConnection()`) for all HTTP/WS requests.
When multiple tabs are open, only the visible tab's connection works — background tabs get null or wrong connection.

## Solution

Convert api.ts from singleton-based namespace objects to a **`createApi(conn)` factory** that returns connection-scoped API objects. Add a **`useApi()` hook** that binds to the tab's connection from React context.

## Scope

- **1 new file**: `hooks/useApi.ts`
- **1 major refactor**: `lib/api.ts` (wrap 20 namespaces in factory)
- **4 WebSocket files**: migrate from `getActiveConnection()` to `useConnection()`
- **89 React consumers**: mechanical `import { useApi } from '@/hooks/useApi'` + `const api = useApi()`
- **1 non-React utility**: `searchTagsAndFiles.ts` — add connection parameter
- **1 cleanup**: `gatewayMode.ts` — remove singleton after migration

---

## Task 1: Add `MakeRequestFn` type and `createApi()` factory in `api.ts`

**File**: `frontend/src/lib/api.ts`

### 1a. Export `MakeRequestFn` and `UploadFormDataFn` types

After line 184 (after `Result<T,E>` type), add:

```typescript
export type MakeRequestFn = (
  url: string,
  options?: RequestInit,
  extra?: { timeoutMs?: number }
) => Promise<Response>;

export type UploadFormDataFn = (
  url: string,
  formData: FormData
) => Promise<Response>;
```

### 1b. Create `createApi()` factory function

After the `systemApi` object (line 1512), add a factory that takes `makeReq` and `uploadFd` closures and returns all 20 namespace objects. Each namespace is identical to the current code but uses the injected `makeReq` instead of the module-level `makeRequest`.

```typescript
export function createApi(makeReq: MakeRequestFn, uploadFd: UploadFormDataFn) {
  return {
    projectsApi: {
      getAll: async (): Promise<Project[]> => {
        const response = await makeReq('/api/projects');
        return handleApiResponse<Project[]>(response);
      },
      // ... all methods, same as current projectsApi but using makeReq
    },
    tasksApi: { /* same pattern */ },
    // ... all 20 namespaces
    imagesApi: {
      upload: async (file: File): Promise<ImageResponse> => {
        const formData = new FormData();
        formData.append('image', file);
        const response = await uploadFd('/api/images/upload', formData);
        // ... same handling
      },
      // ... other imagesApi methods use makeReq
    },
  };
}

export type ApiNamespaces = ReturnType<typeof createApi>;
```

### 1c. Keep existing module-level exports as backward-compatible aliases

The existing `export const projectsApi = { ... }` etc. stay as-is during migration. They will be removed in Task 6 after all consumers migrate.

### Verification

```bash
pnpm run check  # TypeScript compiles
```

---

## Task 2: Create `useApi()` hook

**New file**: `frontend/src/hooks/useApi.ts`

```typescript
import { useMemo } from 'react';
import { useConnection } from '@/contexts/ConnectionContext';
import { createApi, type MakeRequestFn, type UploadFormDataFn } from '@/lib/api';
import type { UnifiedConnection } from '@/lib/connections/types';

function makeBoundRequest(conn: UnifiedConnection): MakeRequestFn {
  return async (url, options = {}, extra?) => {
    const headers = new Headers(options.headers ?? {});
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return conn.fetch(url, { ...options, headers }, extra);
  };
}

function makeBoundUpload(conn: UnifiedConnection): UploadFormDataFn {
  return async (url, formData) => {
    return conn.fetch(url, { method: 'POST', body: formData });
  };
}

export function useApi() {
  const conn = useConnection();
  return useMemo(
    () => createApi(makeBoundRequest(conn), makeBoundUpload(conn)),
    [conn]
  );
}
```

### Verification

```bash
pnpm run check
```

---

## Task 3: Migrate WebSocket hooks to use `useConnection()` context

4 files currently import `getActiveConnection` from `gatewayMode.ts` and `getWsBaseUrl` from `api.ts`.
Replace with `useConnection()` from context.

### 3a. `useLogStream.ts` (lines 3-4, 41-53)

**Before:**
```typescript
import { getActiveConnection } from '@/lib/gatewayMode';
import { getWsBaseUrl } from '@/lib/api';
```
**After:**
```typescript
import { useConnection } from '@/contexts/ConnectionContext';
```

In the hook body, add `const conn = useConnection();` and replace the WebSocket creation block (lines 41-53) with:
```typescript
ws = conn.openWs(path);
```

### 3b. `useJsonPatchWsStream.ts` (lines 5-6, 112-136)

Same pattern: replace `getActiveConnection()` + `getWsBaseUrl()` fallback with `conn.openWs(pathname, query)` using `useConnection()`.

### 3c. `streamJsonPatchEntries.ts` (lines 4-5, 138-158)

This is a non-React utility function. Change `openConnection()` to accept a `UnifiedConnection` parameter:

```typescript
export function streamJsonPatchEntries<E = unknown>(
  url: string,
  conn: UnifiedConnection,  // NEW parameter
  opts: StreamOptions<E> = {}
): StreamController<E> {
```

All callers (React hooks) pass `conn` from `useConnection()`.

### 3d. `XTermInstance.tsx` (lines 9-10, 98-105, 189-204)

Replace `getActiveConnection()` + `getWsBaseUrl()` with `useConnection()`. Use `conn.openWs()` for WebSocket creation and `conn.url` for base URL derivation.

### Verification

```bash
pnpm run check
```

---

## Task 4: Migrate 89 React consumer files

Mechanical transformation for each file. See `docs/superpowers/plans/2026-04-14-multi-tab-parallel-requests-consumers.md` for the full file list.

### Pattern

**Before:**
```typescript
import { attemptsApi, sessionsApi } from '@/lib/api';
// ... later in component/hook:
const result = await attemptsApi.create(data);
```

**After:**
```typescript
import { useApi } from '@/hooks/useApi';
// ... in hook/component body:
const { attemptsApi, sessionsApi } = useApi();
const result = await attemptsApi.create(data);
```

**Rules:**
1. If the file is a **custom hook**: add `const { ...namespaces } = useApi();` at the top of the hook function
2. If the file is a **component**: add it at the top of the component function, destructure only the namespaces used
3. Remove the old `import { ...Api } from '@/lib/api'` line (keep type imports like `Result`, `ApiError`)
4. API method calls (`xxxApi.method()`) remain unchanged — the interface is identical

### Batch order (by dependency, 8 batches)

1. **Standalone hooks** (no cross-deps): 40 files — `useAttempt`, `useAttemptBranch`, `useHomeDir`, etc.
2. **Hooks with hook deps**: 16 files — `useAttemptCreation`, `useCreateWorkspace`, etc.
3. **Dialog components**: 10 files
4. **Card/panel components**: 6 files
5. **Page components**: 5 files
6. **Layout components**: 2 files — `Navbar`, `ConfigProvider`
7. **UI components**: 3 files — `actions-dropdown`, `multi-file-search-textarea`, `file-tag-typeahead-plugin`
8. **Remaining**: any stragglers

### Verification after each batch

```bash
pnpm run check && pnpm run lint
```

---

## Task 5: Migrate `searchTagsAndFiles.ts` (non-React utility)

**File**: `frontend/src/lib/searchTagsAndFiles.ts`

Change function signature to accept API namespaces:

```typescript
import type { ApiNamespaces } from '@/lib/api';

export async function searchTagsAndFiles(
  query: string,
  api: Pick<ApiNamespaces, 'projectsApi' | 'searchApi' | 'tagsApi'>,
  options?: SearchOptions
): Promise<SearchResultItem[]> {
  const tags = await api.tagsApi.list();
  // ... use api.searchApi, api.projectsApi instead of bare imports
}
```

Update all callers (React components) to pass `useApi()` result.

---

## Task 6: Clean up singleton

### 6a. Remove module-level namespace exports from `api.ts`

Delete the 20 `export const xxxApi = { ... }` blocks (lines 293-1512). Only keep:
- Imports, types, `ApiError`, `handleApiResponse`, `handleApiResponseAsResult`
- `MakeRequestFn`, `UploadFormDataFn`, `createApi()`, `ApiNamespaces`
- `getWsBaseUrl` (still used by non-migrated WS code if any remain)

### 6b. Remove `makeRequest` and `uploadFormData` module-level functions

Lines 156-178 and 1244-1253. These are replaced by bound closures in `useApi()`.

### 6c. Remove `_getActiveConnectionSync` import

Line 88.

### 6d. Simplify `gatewayMode.ts`

If no code still imports `getActiveConnection()` and `setActiveConnection()`, remove the entire singleton. `ConnectionProvider` only needs to provide via React context.

### Verification

```bash
# Ensure no remaining imports of removed exports
grep -r "from '@/lib/api'" frontend/src/ | grep -v "node_modules" | grep -E "(projectsApi|tasksApi|sessionsApi|attemptsApi|executionProcessesApi|fileSystemApi|repoApi|configApi|tagsApi|mcpServersApi|profilesApi|configTransferApi|imagesApi|approvalsApi|oauthApi|scratchApi|agentsApi|queueApi|searchApi|systemApi)"
# Should return NO results

pnpm run check && pnpm run lint
```

---

## Risk Mitigation

1. **Backward compat during migration**: Old module-level exports stay until Task 6 — app works at every step
2. **Type safety**: `createApi()` return type is inferred — any interface mismatch is caught by TypeScript
3. **No behavior change**: The API method bodies are identical; only _how_ they get their `fetch` changes
4. **Incremental verification**: `pnpm run check` after every batch
