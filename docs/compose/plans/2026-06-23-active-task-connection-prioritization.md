# Active-Task Connection Prioritization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proactively close WebSocket streams that belong to non-active tasks so the actively-viewed task always has bandwidth / e2ee-gateway queue capacity, eliminating the "open task B, it won't load until I refresh" failure.

**Architecture:** Introduce a small framework-agnostic `StreamRegistry` singleton that holds the current "active key" (the active attempt's session id) and answers `isActive(scope, ownerKey)`. Three scopes: `global` (always active — projects, approvals/notifications), `active` (active only when `ownerKey === activeKey`), and an implicit background state for everything else. Each stream hook (`useJsonPatchWsStream`, `streamJsonPatchEntries`, `useLogStream`) accepts an optional `streamMeta`, subscribes to the registry, and folds `registry.isActive(...)` into its existing `enabled`/open gate — so a background stream's socket closes via the existing cleanup path and reopens when its task becomes active again. `ProjectTasks` sets the active key from `attempt.session.id`. Terminals and infra control sockets are NOT registered and never auto-closed.

**Tech Stack:** React + TypeScript, Vite, Vitest, existing `UnifiedConnection` abstraction.

---

## File Structure

- **Create** `frontend/src/lib/connections/streamRegistry.ts` — the singleton registry: active-key state, scope/owner classification, subscribe/notify, `isActive()`. Pure TS, no React.
- **Create** `frontend/src/lib/connections/__tests__/streamRegistry.test.ts` — unit tests for the registry truth table + subscribe/notify.
- **Modify** `frontend/src/lib/connections/types.ts` — add `StreamScope` / `StreamMeta` types (used by hooks; openWs signature unchanged — registry is consulted in the hooks, not the transport).
- **Modify** `frontend/src/hooks/useJsonPatchWsStream.ts` — accept optional `streamMeta`, gate the socket on `enabled && registry.isActive(meta)`, re-evaluate on registry change.
- **Modify** `frontend/src/hooks/useExecutionProcesses.ts` — pass `streamMeta` (`scope: 'active'`, `ownerKey: sessionId`).
- **Modify** `frontend/src/hooks/useProjects.ts` and `frontend/src/hooks/useApprovals.ts` — pass `streamMeta` (`scope: 'global'`).
- **Modify** `frontend/src/utils/streamJsonPatchEntries.ts` — accept optional `streamMeta`, register/subscribe, close socket when it becomes background and reopen when active.
- **Modify** `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts` — pass `streamMeta` (`scope: 'active'`, `ownerKey` = attempt session id) into `streamJsonPatchEntries`.
- **Modify** `frontend/src/hooks/useLogStream.ts` — accept optional `streamMeta`, gate open on active.
- **Modify** `frontend/src/pages/ProjectTasks.tsx` — set `streamRegistry.setActiveKey(attempt?.session?.id)` in an effect.
- **Create** `frontend/src/hooks/useStreamActive.ts` — tiny React hook: subscribe to the registry and return `isActive(meta)` reactively (shared by the three stream consumers).

Note: AGENTS.md mandates legacy design styling, but this change is connection/hook logic with no UI, so design tokens do not apply. Always `pnpm i` in the worktree once before frontend type-checks.

---

### Task 1: StreamRegistry core

**Covers:** core of the design (scopes, active-key, classification)

**Files:**
- Create: `frontend/src/lib/connections/streamRegistry.ts`
- Modify: `frontend/src/lib/connections/types.ts`
- Test: `frontend/src/lib/connections/__tests__/streamRegistry.test.ts`

- [ ] **Step 1: Add scope/meta types**

In `frontend/src/lib/connections/types.ts`, append after the `WebSocketLike` interface (after line 21):

```typescript
/**
 * Stream prioritization scope used by the StreamRegistry to decide which
 * WebSocket streams stay open under bandwidth / e2ee-gateway pressure.
 * - 'global'  : always active (e.g. projects list, approvals/notifications)
 * - 'active'  : active only when its ownerKey matches the registry's activeKey
 *               (e.g. the currently-viewed task attempt's session streams)
 */
export type StreamScope = 'global' | 'active';

export interface StreamMeta {
  scope: StreamScope;
  /** Identifier of the owning resource (e.g. attempt session id) for 'active' streams. */
  ownerKey?: string;
}
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/lib/connections/__tests__/streamRegistry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamRegistry } from '../streamRegistry';

beforeEach(() => {
  // Reset to a known state between tests
  streamRegistry.setActiveKey(undefined);
});

describe('streamRegistry.isActive', () => {
  it('global streams are always active regardless of activeKey', () => {
    streamRegistry.setActiveKey(undefined);
    expect(streamRegistry.isActive({ scope: 'global' })).toBe(true);
    streamRegistry.setActiveKey('s1');
    expect(streamRegistry.isActive({ scope: 'global' })).toBe(true);
  });

  it('active streams are active only when ownerKey === activeKey', () => {
    streamRegistry.setActiveKey('s1');
    expect(streamRegistry.isActive({ scope: 'active', ownerKey: 's1' })).toBe(
      true
    );
    expect(streamRegistry.isActive({ scope: 'active', ownerKey: 's2' })).toBe(
      false
    );
  });

  it('active streams with no ownerKey fail open (treated active)', () => {
    streamRegistry.setActiveKey('s1');
    expect(streamRegistry.isActive({ scope: 'active' })).toBe(true);
  });

  it('active streams are background when no activeKey is set', () => {
    streamRegistry.setActiveKey(undefined);
    expect(streamRegistry.isActive({ scope: 'active', ownerKey: 's1' })).toBe(
      false
    );
  });

  it('notifies subscribers when activeKey changes and supports unsubscribe', () => {
    const cb = vi.fn();
    const unsub = streamRegistry.subscribe(cb);
    streamRegistry.setActiveKey('s1');
    expect(cb).toHaveBeenCalledTimes(1);
    streamRegistry.setActiveKey('s1'); // no-op, same value
    expect(cb).toHaveBeenCalledTimes(1);
    streamRegistry.setActiveKey('s2');
    expect(cb).toHaveBeenCalledTimes(2);
    unsub();
    streamRegistry.setActiveKey('s3');
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && pnpm i && pnpm vitest run src/lib/connections/__tests__/streamRegistry.test.ts`
Expected: FAIL — cannot resolve `../streamRegistry`.

- [ ] **Step 4: Implement the registry**

Create `frontend/src/lib/connections/streamRegistry.ts`:

```typescript
import type { StreamMeta } from './types';

/**
 * Tracks which task/attempt is currently "active" (being viewed) and answers
 * whether a given stream should stay open. Background ('active'-scope streams
 * whose ownerKey != activeKey) are closed by their hooks to free bandwidth /
 * e2ee-gateway queue capacity for the active task. 'global'-scope streams
 * (projects, approvals/notifications) are always active.
 *
 * Framework-agnostic singleton: set the active key from routing, subscribe
 * from stream hooks.
 */
class StreamRegistry {
  private activeKey: string | undefined = undefined;
  private subscribers = new Set<() => void>();

  /** Set the currently-active owner key (e.g. the viewed attempt's session id). */
  setActiveKey(key: string | undefined): void {
    if (this.activeKey === key) return;
    this.activeKey = key;
    for (const cb of this.subscribers) {
      try {
        cb();
      } catch {
        /* swallow subscriber errors */
      }
    }
  }

  getActiveKey(): string | undefined {
    return this.activeKey;
  }

  /** True if a stream with this meta should be open right now. */
  isActive(meta: StreamMeta | undefined): boolean {
    if (!meta) return true; // unclassified streams fail open
    if (meta.scope === 'global') return true;
    // scope === 'active'
    if (meta.ownerKey === undefined) return true; // fail open: never starve an unidentifiable active stream
    return meta.ownerKey === this.activeKey;
  }

  /** Subscribe to active-key changes. Returns an unsubscribe function. */
  subscribe(cb: () => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }
}

export const streamRegistry = new StreamRegistry();
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run src/lib/connections/__tests__/streamRegistry.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/connections/streamRegistry.ts frontend/src/lib/connections/types.ts frontend/src/lib/connections/__tests__/streamRegistry.test.ts
git commit -m "feat(streams): add StreamRegistry for active-task connection prioritization"
```

---

### Task 2: useStreamActive React hook

**Covers:** reactive bridge between registry and stream hooks

**Files:**
- Create: `frontend/src/hooks/useStreamActive.ts`
- Test: `frontend/src/hooks/__tests__/useStreamActive.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/__tests__/useStreamActive.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStreamActive } from '../useStreamActive';
import { streamRegistry } from '@/lib/connections/streamRegistry';

beforeEach(() => {
  streamRegistry.setActiveKey(undefined);
});

describe('useStreamActive', () => {
  it('returns true for global scope', () => {
    const { result } = renderHook(() => useStreamActive({ scope: 'global' }));
    expect(result.current).toBe(true);
  });

  it('re-renders when active key changes for an active-scope stream', () => {
    const { result } = renderHook(() =>
      useStreamActive({ scope: 'active', ownerKey: 's1' })
    );
    expect(result.current).toBe(false);
    act(() => streamRegistry.setActiveKey('s1'));
    expect(result.current).toBe(true);
    act(() => streamRegistry.setActiveKey('s2'));
    expect(result.current).toBe(false);
  });

  it('returns true when meta is undefined', () => {
    const { result } = renderHook(() => useStreamActive(undefined));
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run src/hooks/__tests__/useStreamActive.test.ts`
Expected: FAIL — cannot resolve `../useStreamActive`.

- [ ] **Step 3: Implement the hook**

Create `frontend/src/hooks/useStreamActive.ts`:

```typescript
import { useSyncExternalStore } from 'react';
import { streamRegistry } from '@/lib/connections/streamRegistry';
import type { StreamMeta } from '@/lib/connections/types';

/**
 * Reactively report whether a stream with the given meta should be open.
 * Recomputes whenever the registry's active key changes.
 */
export function useStreamActive(meta: StreamMeta | undefined): boolean {
  return useSyncExternalStore(
    (cb) => streamRegistry.subscribe(cb),
    () => streamRegistry.isActive(meta)
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run src/hooks/__tests__/useStreamActive.test.ts`
Expected: PASS (3 tests).

Note: `useSyncExternalStore`'s `getSnapshot` returns a boolean primitive, so referential stability is not a concern (React compares with `Object.is`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useStreamActive.ts frontend/src/hooks/__tests__/useStreamActive.test.ts
git commit -m "feat(streams): add useStreamActive hook bridging registry to React"
```

---

### Task 3: Gate useJsonPatchWsStream on active state

**Covers:** active/global gating for JSON-patch streams (exec processes, projects, approvals)

**Files:**
- Modify: `frontend/src/hooks/useJsonPatchWsStream.ts`

- [ ] **Step 1: Import the new hook and accept streamMeta**

In `frontend/src/hooks/useJsonPatchWsStream.ts`, change the imports (top of file, after line 6) to add:

```typescript
import type { StreamMeta } from '@/lib/connections/types';
import { useStreamActive } from './useStreamActive';
```

- [ ] **Step 2: Extend the signature**

Change the function signature (lines 34-39) from:

```typescript
export const useJsonPatchWsStream = <T extends object>(
  endpoint: string | undefined,
  enabled: boolean,
  initialData: () => T,
  options?: UseJsonPatchStreamOptions<T>
): UseJsonPatchStreamResult<T> => {
```

to:

```typescript
export const useJsonPatchWsStream = <T extends object>(
  endpoint: string | undefined,
  enabled: boolean,
  initialData: () => T,
  options?: UseJsonPatchStreamOptions<T>,
  streamMeta?: StreamMeta
): UseJsonPatchStreamResult<T> => {
```

- [ ] **Step 3: Fold active-state into the gate**

Immediately after `const conn = useConnection();` (line 40), add:

```typescript
  const streamActive = useStreamActive(streamMeta);
  const effectiveEnabled = enabled && streamActive;
```

Then replace every use of `enabled` inside the effect and its dependency array with `effectiveEnabled`:
- Line 77 `if (!enabled || !endpoint) {` → `if (!effectiveEnabled || !endpoint) {`
- Line 221 dependency array `}, [endpoint, enabled, retryNonce, conn]);` → `}, [endpoint, effectiveEnabled, retryNonce, conn]);`

This reuses the EXISTING close-and-reset branch (lines 78-94): when a stream becomes background, `effectiveEnabled` flips false, the effect closes `wsRef.current`, clears retry timers, and resets state. When it becomes active again, the effect re-runs and reopens. No new lifecycle code is needed.

- [ ] **Step 4: Type-check**

Run: `cd frontend && pnpm run check`
Expected: PASS (no type errors). Existing callers omit `streamMeta` (optional), so they still compile.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useJsonPatchWsStream.ts
git commit -m "feat(streams): gate useJsonPatchWsStream on registry active state"
```

---

### Task 4: Tag JSON-patch stream consumers with scope

**Covers:** classification of exec-process (active), projects/approvals (global)

**Files:**
- Modify: `frontend/src/hooks/useExecutionProcesses.ts`
- Modify: `frontend/src/hooks/useProjects.ts`
- Modify: `frontend/src/hooks/useApprovals.ts`

- [ ] **Step 1: Tag useExecutionProcesses as active, owned by sessionId**

In `frontend/src/hooks/useExecutionProcesses.ts`, change the `useJsonPatchWsStream` call (lines 49-54) from:

```typescript
  const { data, isConnected, isInitialized, error } =
    useJsonPatchWsStream<ExecutionProcessState>(
      endpoint,
      !!sessionId,
      initialData
    );
```

to:

```typescript
  const { data, isConnected, isInitialized, error } =
    useJsonPatchWsStream<ExecutionProcessState>(
      endpoint,
      !!sessionId,
      initialData,
      undefined,
      { scope: 'active', ownerKey: sessionId }
    );
```

- [ ] **Step 2: Tag useProjects and useApprovals as global**

Open `frontend/src/hooks/useProjects.ts`. Find its `useJsonPatchWsStream(...)` call and append `{ scope: 'global' }` as the final argument. If the call currently passes no `options`, pass `undefined` for the options slot first. Example — change:

```typescript
useJsonPatchWsStream<...>(endpoint, enabled, initialData)
```

to:

```typescript
useJsonPatchWsStream<...>(endpoint, enabled, initialData, undefined, {
  scope: 'global',
})
```

Apply the identical change in `frontend/src/hooks/useApprovals.ts`.

(Leave `useScratch` and `useSlashCommands` unclassified — they fail open as active, which is acceptable; classifying them is out of scope.)

- [ ] **Step 3: Type-check**

Run: `cd frontend && pnpm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useExecutionProcesses.ts frontend/src/hooks/useProjects.ts frontend/src/hooks/useApprovals.ts
git commit -m "feat(streams): tag exec-process (active) and projects/approvals (global) scopes"
```

---

### Task 5: Gate streamJsonPatchEntries (conversation logs) on active state

**Covers:** active gating for conversation/normalized-logs streams

**Files:**
- Modify: `frontend/src/utils/streamJsonPatchEntries.ts`
- Modify: `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts`
- Test: `frontend/src/utils/__tests__/streamJsonPatchEntries.test.ts`

- [ ] **Step 1: Write the failing test**

In `frontend/src/utils/__tests__/streamJsonPatchEntries.test.ts`, add a new `describe` block at the end of the file (before the final closing of the outer describe — place it as a sibling block). First add the import at the top, after line 3:

```typescript
import { streamRegistry } from '@/lib/connections/streamRegistry';
```

Then add this block inside the top-level `describe('streamJsonPatchEntries', () => {` (e.g. just before its closing `});`):

```typescript
  describe('active-state gating', () => {
    it('closes the socket when its stream becomes background and reopens when active', () => {
      streamRegistry.setActiveKey('s1');
      const controller = streamJsonPatchEntries('/initial', mockConn, {
        streamMeta: { scope: 'active', ownerKey: 's1' },
      });
      expect(MockWebSocket.instances.length).toBe(1);
      const ws0 = MockWebSocket.instances[0];
      ws0.simulateOpen();

      // Become background -> socket should close
      streamRegistry.setActiveKey('s2');
      expect(ws0.closeCalled).toBe(true);

      // Become active again -> a new socket should open
      streamRegistry.setActiveKey('s1');
      expect(MockWebSocket.instances.length).toBe(2);

      controller.close();
      streamRegistry.setActiveKey(undefined);
    });

    it('does not open while background, opens when it becomes active', () => {
      streamRegistry.setActiveKey('other');
      const controller = streamJsonPatchEntries('/initial', mockConn, {
        streamMeta: { scope: 'active', ownerKey: 's1' },
      });
      expect(MockWebSocket.instances.length).toBe(0);

      streamRegistry.setActiveKey('s1');
      expect(MockWebSocket.instances.length).toBe(1);

      controller.close();
      streamRegistry.setActiveKey(undefined);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run src/utils/__tests__/streamJsonPatchEntries.test.ts`
Expected: FAIL — `streamMeta` option not honored; both new tests fail (socket opens immediately / never reacts to registry).

- [ ] **Step 3: Implement gating in streamJsonPatchEntries**

In `frontend/src/utils/streamJsonPatchEntries.ts`:

(a) Add imports after line 5:

```typescript
import type { StreamMeta } from '@/lib/connections/types';
import { streamRegistry } from '@/lib/connections/streamRegistry';
```

(b) Add `streamMeta` to `StreamOptions` (inside the interface, after `reconnect?` block, before the closing brace at line 23):

```typescript
  /** Prioritization metadata; when set, the stream closes while background. */
  streamMeta?: StreamMeta;
```

(c) Inside `streamJsonPatchEntries`, add gating state near the other `let` declarations (after line 59 `let maxEntryIndex = -1;`):

```typescript
  let registryUnsub: (() => void) | null = null;
  let lastConnectUrl: string = url;

  const isActive = () => streamRegistry.isActive(opts.streamMeta);
```

(d) Replace the bottom "Initial connection" section (lines 166-167):

```typescript
  // Initial connection
  openConnection(url);
```

with a guarded open plus a registry subscription that opens/closes on activation changes:

```typescript
  function applyActiveState() {
    if (closed || finished) return;
    if (isActive()) {
      if (!ws) {
        // reopen from where we left off (uses reconnect URL if available)
        const reopenUrl = opts.reconnect
          ? opts.reconnect.getReconnectUrl(maxEntryIndex)
          : lastConnectUrl;
        openConnection(reopenUrl);
      }
    } else {
      // Became background: drop the socket but DO NOT mark closed/finished,
      // so we can reopen when active again.
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      reconnecting = false;
      if (ws) {
        ws.close();
        ws = null;
      }
      connected = false;
    }
  }

  // Track the URL actually used so a reopen without reconnect support resumes.
  const _origOpenConnection = openConnection;
  // (openConnection already assigns ws; we capture the url via lastConnectUrl below)

  // Subscribe to registry changes when this stream is prioritizable.
  if (opts.streamMeta) {
    registryUnsub = streamRegistry.subscribe(applyActiveState);
  }

  // Initial connection (respects current active state)
  applyActiveState();
```

(e) Make `openConnection` record `lastConnectUrl`. Change the first line of `openConnection` (line 139) from:

```typescript
  function openConnection(connectUrl: string) {
    const parsed = new URL(connectUrl, window.location.origin);
```

to:

```typescript
  function openConnection(connectUrl: string) {
    lastConnectUrl = connectUrl;
    const parsed = new URL(connectUrl, window.location.origin);
```

Remove the now-unused `_origOpenConnection` line you added in (d) — it was a placeholder; delete it so there is no unused variable. Final (d) block must NOT contain `_origOpenConnection`.

(f) Guard `scheduleReconnect` so a background stream never schedules reconnects. Change the first line of `scheduleReconnect` (line 123) from:

```typescript
    if (closed || finished || !opts.reconnect) return;
```

to:

```typescript
    if (closed || finished || !opts.reconnect || !isActive()) return;
```

(g) Unsubscribe in `close()`. Inside the `close()` method (after `closed = true;`, line 188), add:

```typescript
      if (registryUnsub) {
        registryUnsub();
        registryUnsub = null;
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run src/utils/__tests__/streamJsonPatchEntries.test.ts`
Expected: PASS — all prior tests plus the 2 new gating tests pass.

- [ ] **Step 5: Tag the conversation streams with scope in useConversationHistoryOld**

In `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts`, both `streamJsonPatchEntries<PatchType>(url, conn, { ... })` calls (line 681 and line 711) must pass `streamMeta`. The owning key is the execution process's attempt session id. The execution process object is available as `executionProcess`; use `executionProcess.session_id` (the session id field on `ExecutionProcess`) as the owner key so it matches the exec-process stream's `ownerKey`.

For the call at line 681, add to its options object:

```typescript
            streamMeta: { scope: 'active', ownerKey: executionProcess.session_id },
```

For the call at line 711, add the same line to its options object.

Verify the field name: open `shared/types.ts` and confirm `ExecutionProcess` has a `session_id` field. If the field is named differently (e.g. `task_attempt_id`), use whatever uniquely maps to the active attempt's session, and update the `ownerKey` in `useExecutionProcesses` (Task 4 Step 1) and `ProjectTasks` (Task 6) to the SAME key so they agree. The three must use the identical key.

- [ ] **Step 6: Type-check**

Run: `cd frontend && pnpm run check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/streamJsonPatchEntries.ts frontend/src/utils/__tests__/streamJsonPatchEntries.test.ts frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts
git commit -m "feat(streams): close conversation log streams while their task is background"
```

---

### Task 6: Gate useLogStream and wire the active key in ProjectTasks

**Covers:** active gating for raw-log streams + the source that sets the active key

**Files:**
- Modify: `frontend/src/hooks/useLogStream.ts`
- Modify: `frontend/src/pages/ProjectTasks.tsx`

- [ ] **Step 1: Add streamMeta gating to useLogStream**

In `frontend/src/hooks/useLogStream.ts`:

(a) Add imports after line 4:

```typescript
import type { StreamMeta } from '@/lib/connections/types';
import { useStreamActive } from './useStreamActive';
```

(b) Change the signature (line 13) from:

```typescript
export const useLogStream = (processId: string): UseLogStreamResult => {
```

to:

```typescript
export const useLogStream = (
  processId: string,
  streamMeta?: StreamMeta
): UseLogStreamResult => {
```

(c) After `const conn = useConnection();` (line 14), add:

```typescript
  const streamActive = useStreamActive(streamMeta);
```

(d) Change the effect guard (line 25) from `if (!processId) {` to:

```typescript
    if (!processId || !streamActive) {
```

(e) Add `streamActive` to the effect dependency array (line 134), changing `}, [processId, conn]);` to `}, [processId, conn, streamActive]);`.

When `streamActive` flips false, the effect cleanup (lines 123-133) closes the socket and clears retry timers; when it flips back true, the effect re-runs and reopens. Existing callers that omit `streamMeta` fail open (always active) — unchanged behavior.

- [ ] **Step 2: Set the active key from ProjectTasks**

In `frontend/src/pages/ProjectTasks.tsx`, add the import near the other imports (top of file):

```typescript
import { streamRegistry } from '@/lib/connections/streamRegistry';
```

Then add an effect that keeps the registry's active key in sync with the viewed attempt's session. Place it alongside the component's other hooks, before the `attemptArea` JSX (before line 1080). Use the SAME key used as `ownerKey` elsewhere (`attempt?.session?.id`):

```typescript
  useEffect(() => {
    streamRegistry.setActiveKey(attempt?.session?.id);
    return () => {
      // On unmount, clear so nothing is considered active (all 'active' streams
      // become background and close).
      streamRegistry.setActiveKey(undefined);
    };
  }, [attempt?.session?.id]);
```

Confirm `useEffect` is already imported in this file; if not, add it to the existing `react` import.

- [ ] **Step 3: Type-check + full test run**

Run: `cd frontend && pnpm run check && pnpm vitest run`
Expected: type-check PASS; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useLogStream.ts frontend/src/pages/ProjectTasks.tsx
git commit -m "feat(streams): gate log streams on active task and wire active key from ProjectTasks"
```

---

### Task 7: Lint, full verification, and manual smoke

**Covers:** verification gate

**Files:** (none — verification only)

- [ ] **Step 1: Lint**

Run: `cd frontend && pnpm run lint`
Expected: PASS (no unused vars — confirm the `_origOpenConnection` placeholder was removed in Task 5).

- [ ] **Step 2: Full frontend check + tests**

Run: `cd frontend && pnpm run check && pnpm vitest run`
Expected: type-check clean; all unit tests green, including `streamRegistry`, `useStreamActive`, and the new `streamJsonPatchEntries` gating tests.

- [ ] **Step 3: Manual smoke (document result; reproduce the original bug)**

With `pnpm run dev`:
1. Open task A whose agent is producing heavy log output (the bandwidth hog).
2. Navigate to task B. Verify task B loads WITHOUT a page refresh.
3. In devtools Network → WS, confirm task A's session/exec-process and conversation-log sockets show as closed after switching to B, and reopen if you switch back to A.
4. Confirm the projects list and approvals/notifications sockets stay open throughout (global scope).
5. Confirm terminal tabs remain connected across the switch (terminals untouched).

Record the observed result in the PR description. If step 2 still fails to load B without refresh, STOP and re-open debugging — the active key may not be propagating (check `streamRegistry.getActiveKey()` in the console).

- [ ] **Step 4: Commit any lint fixups (if needed)**

```bash
git add -A
git commit -m "chore(streams): lint and verification fixups"
```

---

## Self-Review

**Spec coverage:** The approved design (in-conversation) maps to tasks as follows — scopes & registry → Task 1; reactive bridge → Task 2; gate JSON-patch streams → Task 3/4; gate conversation streams → Task 5; gate log streams & set active key → Task 6; verification → Task 7. Terminals explicitly untouched (no task modifies `XTermInstance`). All design elements covered.

**Placeholder scan:** No TBD/TODO. Task 5 explicitly instructs removing the `_origOpenConnection` placeholder to avoid an unused var; Task 7 Step 1 re-checks lint for it. Field-name verification (`session_id`) is called out in Task 5 Step 5 with a fallback instruction to keep all three owner keys identical.

**Type consistency:** `StreamMeta`/`StreamScope` defined once (Task 1) and imported everywhere. `streamRegistry` singleton + `setActiveKey`/`isActive`/`subscribe`/`getActiveKey` names are consistent across tasks. `useStreamActive(meta)` signature consistent. `useJsonPatchWsStream` adds `streamMeta` as the 5th (optional) param — all existing callers compile unchanged; new callers in Task 4 pass `undefined` for the `options` slot then `streamMeta`. The single risk is the owner-key field name on `ExecutionProcess`; Task 5 Step 5 forces verification and consistency across the three call sites.
