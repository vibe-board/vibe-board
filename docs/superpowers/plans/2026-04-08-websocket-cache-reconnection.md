# WebSocket Cache Reconnection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a WebSocket drops during a running task, reconnect using the existing live endpoint (`/normalized-logs-live/ws?after={index}`) so only new entries are fetched — preserving cached entries in-memory and eliminating the scroll-from-top flicker.

**Architecture:** Add reconnection with resume to `streamJsonPatchEntries.ts`. Track the max entry index from JSON patch paths. On unclean close, reconnect to the live endpoint URL (provided via callback). The snapshot is preserved across reconnections. `useConversationHistoryOld.ts` passes the reconnect config with a `getReconnectUrl` callback that builds the live endpoint URL.

**Tech Stack:** TypeScript, React, Vitest, WebSocket API, rfc6902 JSON Patch

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `frontend/src/utils/streamJsonPatchEntries.ts` | Add reconnection logic, maxEntryIndex tracking, exponential backoff |
| Modify | `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts` | Pass `reconnect` config to `streamJsonPatchEntries` for normalized-logs streams |
| Create | `frontend/src/utils/__tests__/streamJsonPatchEntries.test.ts` | Unit tests for reconnection, index tracking, backoff, snapshot preservation |

---

### Task 1: Add maxEntryIndex tracking and reconnection to streamJsonPatchEntries

**Files:**
- Modify: `frontend/src/utils/streamJsonPatchEntries.ts`

- [ ] **Step 1: Add `reconnect` option to `StreamOptions` and `isReconnecting` to `StreamController`**

In `frontend/src/utils/streamJsonPatchEntries.ts`, update the `StreamOptions` interface to accept a `reconnect` config, and update `StreamController` to expose reconnection state:

```typescript
export interface StreamOptions<E = unknown> {
  initial?: PatchContainer<E>;
  /** called after each successful patch application */
  onEntries?: (entries: E[]) => void;
  onConnect?: () => void;
  onError?: (err: unknown) => void;
  /** called once when a "finished" event is received */
  onFinished?: (entries: E[]) => void;
  /** If provided, enables auto-reconnect on unclean close */
  reconnect?: {
    maxRetries: number;
    /** Build the URL for reconnection given the highest entry index seen so far */
    getReconnectUrl: (maxEntryIndex: number) => string;
  };
}

interface StreamController<E = unknown> {
  /** Current entries array (immutable snapshot) */
  getEntries(): E[];
  /** Full { entries } snapshot */
  getSnapshot(): PatchContainer<E>;
  /** Best-effort connection state */
  isConnected(): boolean;
  /** True while attempting to reconnect after a drop */
  isReconnecting(): boolean;
  /** Subscribe to updates; returns an unsubscribe function */
  onChange(cb: (entries: E[]) => void): () => void;
  /** Close the stream (prevents further reconnection) */
  close(): void;
}
```

- [ ] **Step 2: Implement reconnection logic inside `streamJsonPatchEntries`**

Replace the body of the `streamJsonPatchEntries` function with the following. The key changes are:
1. Extract `openConnection(url)` helper that can be called for both initial and reconnect.
2. Track `maxEntryIndex` from incoming patch paths.
3. On unclean WS close (not `finished`, not intentional), schedule reconnect with exponential backoff.
4. On reconnect, use `getReconnectUrl(maxEntryIndex)` for the URL.
5. Snapshot is never reset across reconnections.

```typescript
export function streamJsonPatchEntries<E = unknown>(
  url: string,
  opts: StreamOptions<E> = {}
): StreamController<E> {
  let connected = false;
  let reconnecting = false;
  let closed = false; // set by close() to stop reconnection
  let finished = false;
  let ws: WebSocket | RemoteWs | null = null;
  let retryAttempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let maxEntryIndex = -1;

  let snapshot: PatchContainer<E> = structuredClone(
    opts.initial ?? ({ entries: [] } as PatchContainer<E>)
  );

  const subscribers = new Set<(entries: E[]) => void>();
  if (opts.onEntries) subscribers.add(opts.onEntries);

  const notify = () => {
    for (const cb of subscribers) {
      try {
        cb(snapshot.entries);
      } catch {
        /* swallow subscriber errors */
      }
    }
  };

  /** Extract the highest /entries/{N} index from a set of patch ops */
  function updateMaxIndex(ops: Operation[]) {
    for (const op of ops) {
      const match = op.path.match(/^\/entries\/(\d+)$/);
      if (match) {
        const idx = parseInt(match[1], 10);
        if (idx > maxEntryIndex) {
          maxEntryIndex = idx;
        }
      }
    }
  }

  function handleMessage(event: MessageEvent) {
    try {
      const msg = JSON.parse(event.data);

      if (msg.JsonPatch) {
        const raw = msg.JsonPatch as Operation[];
        const ops = dedupeOps(raw);

        updateMaxIndex(ops);

        const next = structuredClone(snapshot);
        applyUpsertPatch(next, ops);

        if (JSON.stringify(next) === JSON.stringify(snapshot)) {
          return;
        }

        snapshot = next;
        notify();
      }

      if (msg.finished !== undefined) {
        finished = true;
        opts.onFinished?.(snapshot.entries);
        ws?.close();
      }
    } catch (err) {
      opts.onError?.(err);
    }
  }

  function scheduleReconnect() {
    if (closed || finished || !opts.reconnect) return;
    if (retryAttempts >= opts.reconnect.maxRetries) return;

    reconnecting = true;
    const delay = Math.min(8000, 500 * Math.pow(2, retryAttempts));
    retryAttempts++;

    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (closed || finished) return;
      const reconnectUrl = opts.reconnect!.getReconnectUrl(maxEntryIndex);
      openConnection(reconnectUrl);
    }, delay);
  }

  function openConnection(connectUrl: string) {
    const conn = getGatewayConnection();
    if (conn) {
      const parsed = new URL(connectUrl, window.location.origin);
      ws = conn.openWsStream(
        parsed.pathname,
        parsed.search?.substring(1) || undefined
      );
    } else {
      const wsUrl = connectUrl.replace(/^http/, 'ws');
      ws = new WebSocket(wsUrl);
    }

    ws.onopen = () => {
      connected = true;
      reconnecting = false;
      retryAttempts = 0;
      opts.onConnect?.();
    };

    ws.onmessage = handleMessage;

    ws.onerror = (err) => {
      connected = false;
      opts.onError?.(err);
    };

    ws.onclose = () => {
      connected = false;
      ws = null;

      if (!closed && !finished) {
        scheduleReconnect();
      }
    };
  }

  // Initial connection
  openConnection(url);

  return {
    getEntries(): E[] {
      return snapshot.entries;
    },
    getSnapshot(): PatchContainer<E> {
      return snapshot;
    },
    isConnected(): boolean {
      return connected;
    },
    isReconnecting(): boolean {
      return reconnecting;
    },
    onChange(cb: (entries: E[]) => void): () => void {
      subscribers.add(cb);
      cb(snapshot.entries);
      return () => subscribers.delete(cb);
    },
    close(): void {
      closed = true;
      reconnecting = false;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      ws?.close();
      ws = null;
      subscribers.clear();
      connected = false;
    },
  };
}
```

- [ ] **Step 3: Verify type-check passes**

Run:
```bash
cd frontend && pnpm run check
```
Expected: No type errors related to `streamJsonPatchEntries.ts`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/streamJsonPatchEntries.ts
git commit -m "feat(ws): add reconnect-with-resume to streamJsonPatchEntries

Track maxEntryIndex from JSON patch paths. On unclean WS close,
reconnect to a caller-provided URL (live endpoint) with exponential
backoff. Snapshot is preserved across reconnections so cached entries
are never cleared."
```

---

### Task 2: Wire up reconnect config in useConversationHistoryOld

**Files:**
- Modify: `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts`

- [ ] **Step 1: Pass reconnect config for normalized-logs streams**

In `useConversationHistoryOld.ts`, find the `loadRunningAndEmit` callback. Locate the normalized-logs block (around line 694-738) where `streamJsonPatchEntries` is called with `url = /api/execution-processes/${executionProcess.id}/normalized-logs/ws`. Add the `reconnect` config:

Change this block (starting at the `const controller = streamJsonPatchEntries<PatchType>(url, {` call for normalized-logs):

```typescript
      // Normalized logs: WS replay full history + live updates
      const url = `/api/execution-processes/${executionProcess.id}/normalized-logs/ws`;

      return new Promise<void>((resolve, reject) => {
        const controller = streamJsonPatchEntries<PatchType>(url, {
          onEntries(allEntries) {
```

To:

```typescript
      // Normalized logs: WS replay full history + live updates
      const url = `/api/execution-processes/${executionProcess.id}/normalized-logs/ws`;

      return new Promise<void>((resolve, reject) => {
        const controller = streamJsonPatchEntries<PatchType>(url, {
          reconnect: {
            maxRetries: 10,
            getReconnectUrl: (maxIndex) =>
              `/api/execution-processes/${executionProcess.id}/normalized-logs-live/ws?after=${maxIndex}`,
          },
          onEntries(allEntries) {
```

No other changes needed in this file. The `onEntries` callback already receives the full snapshot array (including cached + new entries) and replaces the displayed state, so it works correctly for both initial load and reconnection.

- [ ] **Step 2: Verify type-check passes**

Run:
```bash
cd frontend && pnpm run check
```
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts
git commit -m "feat(ws): enable reconnect-with-resume for normalized-logs streams

Pass reconnect config to streamJsonPatchEntries so that on WS drop,
it reconnects to /normalized-logs-live/ws?after={maxIndex} instead
of replaying full history from /normalized-logs/ws."
```

---

### Task 3: Add unit tests for reconnection behavior

**Files:**
- Create: `frontend/src/utils/__tests__/streamJsonPatchEntries.test.ts`

- [ ] **Step 1: Write tests covering reconnection, index tracking, and snapshot preservation**

Create `frontend/src/utils/__tests__/streamJsonPatchEntries.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamJsonPatchEntries } from '../streamJsonPatchEntries';

// Mock gatewayMode to return null (no E2EE, use native WebSocket)
vi.mock('@/lib/gatewayMode', () => ({
  getGatewayConnection: () => null,
}));

/**
 * Minimal WebSocket mock that lets us control open/message/close events.
 */
class MockWebSocket {
  static instances: MockWebSocket[] = [];

  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  url: string;
  closeCalled = false;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.closeCalled = true;
  }

  // Test helpers
  simulateOpen() {
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  }

  simulateClose(code = 1006, wasClean = false) {
    this.onclose?.(new CloseEvent('close', { code, wasClean }));
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('streamJsonPatchEntries', () => {
  describe('maxEntryIndex tracking', () => {
    it('tracks the highest entry index from patch paths', () => {
      const onEntries = vi.fn();
      const getReconnectUrl = vi.fn((maxIndex: number) => `/live?after=${maxIndex}`);

      const controller = streamJsonPatchEntries('/initial', {
        onEntries,
        reconnect: { maxRetries: 3, getReconnectUrl },
      });

      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      // Send entries 0, 1, 2
      ws.simulateMessage({ JsonPatch: [{ op: 'add', path: '/entries/0', value: { type: 'A' } }] });
      ws.simulateMessage({ JsonPatch: [{ op: 'add', path: '/entries/1', value: { type: 'B' } }] });
      ws.simulateMessage({ JsonPatch: [{ op: 'add', path: '/entries/2', value: { type: 'C' } }] });

      expect(controller.getEntries()).toHaveLength(3);

      // Simulate unclean close — should reconnect with after=2
      ws.simulateClose(1006, false);
      vi.advanceTimersByTime(500); // first backoff: 500ms

      expect(MockWebSocket.instances).toHaveLength(2);
      expect(getReconnectUrl).toHaveBeenCalledWith(2);
      expect(MockWebSocket.instances[1].url).toBe('/live?after=2');

      controller.close();
    });
  });

  describe('snapshot preservation across reconnects', () => {
    it('preserves cached entries when reconnecting', () => {
      const onEntries = vi.fn();

      const controller = streamJsonPatchEntries('/initial', {
        onEntries,
        reconnect: {
          maxRetries: 3,
          getReconnectUrl: (maxIndex) => `/live?after=${maxIndex}`,
        },
      });

      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();

      // Receive 3 entries
      ws1.simulateMessage({ JsonPatch: [{ op: 'add', path: '/entries/0', value: { id: 0 } }] });
      ws1.simulateMessage({ JsonPatch: [{ op: 'add', path: '/entries/1', value: { id: 1 } }] });
      ws1.simulateMessage({ JsonPatch: [{ op: 'add', path: '/entries/2', value: { id: 2 } }] });

      expect(controller.getEntries()).toHaveLength(3);

      // Drop connection
      ws1.simulateClose(1006, false);
      vi.advanceTimersByTime(500);

      // Entries still present before reconnect completes
      expect(controller.getEntries()).toHaveLength(3);

      // Reconnect opens, sends entry 3
      const ws2 = MockWebSocket.instances[1];
      ws2.simulateOpen();
      ws2.simulateMessage({ JsonPatch: [{ op: 'add', path: '/entries/3', value: { id: 3 } }] });

      // Now we have 4 entries — 3 cached + 1 new
      expect(controller.getEntries()).toHaveLength(4);
      expect(controller.getEntries()[0]).toEqual({ id: 0 });
      expect(controller.getEntries()[3]).toEqual({ id: 3 });

      controller.close();
    });
  });

  describe('replace operations after reconnect', () => {
    it('applies replace patches to existing cached entries', () => {
      const onEntries = vi.fn();

      const controller = streamJsonPatchEntries('/initial', {
        onEntries,
        reconnect: {
          maxRetries: 3,
          getReconnectUrl: (maxIndex) => `/live?after=${maxIndex}`,
        },
      });

      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();

      ws1.simulateMessage({ JsonPatch: [{ op: 'add', path: '/entries/0', value: { status: 'pending' } }] });
      expect(controller.getEntries()[0]).toEqual({ status: 'pending' });

      // Drop and reconnect
      ws1.simulateClose(1006, false);
      vi.advanceTimersByTime(500);

      const ws2 = MockWebSocket.instances[1];
      ws2.simulateOpen();

      // Server sends a replace for entry 0 (status updated)
      ws2.simulateMessage({ JsonPatch: [{ op: 'replace', path: '/entries/0', value: { status: 'success' } }] });

      expect(controller.getEntries()[0]).toEqual({ status: 'success' });
      expect(controller.getEntries()).toHaveLength(1);

      controller.close();
    });
  });

  describe('exponential backoff', () => {
    it('uses exponential backoff: 500ms, 1s, 2s, 4s, 8s', () => {
      const controller = streamJsonPatchEntries('/initial', {
        reconnect: {
          maxRetries: 5,
          getReconnectUrl: () => '/live',
        },
      });

      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();
      ws1.simulateClose(1006, false);

      // Attempt 1: 500ms
      vi.advanceTimersByTime(499);
      expect(MockWebSocket.instances).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(2);

      // Attempt 2: 1000ms
      MockWebSocket.instances[1].simulateClose(1006, false);
      vi.advanceTimersByTime(999);
      expect(MockWebSocket.instances).toHaveLength(2);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(3);

      // Attempt 3: 2000ms
      MockWebSocket.instances[2].simulateClose(1006, false);
      vi.advanceTimersByTime(1999);
      expect(MockWebSocket.instances).toHaveLength(3);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(4);

      // Attempt 4: 4000ms
      MockWebSocket.instances[3].simulateClose(1006, false);
      vi.advanceTimersByTime(3999);
      expect(MockWebSocket.instances).toHaveLength(4);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(5);

      // Attempt 5: 8000ms (capped)
      MockWebSocket.instances[4].simulateClose(1006, false);
      vi.advanceTimersByTime(7999);
      expect(MockWebSocket.instances).toHaveLength(5);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(6);

      controller.close();
    });

    it('stops retrying after maxRetries', () => {
      const controller = streamJsonPatchEntries('/initial', {
        reconnect: {
          maxRetries: 2,
          getReconnectUrl: () => '/live',
        },
      });

      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();
      ws1.simulateClose(1006, false);

      // Retry 1
      vi.advanceTimersByTime(500);
      expect(MockWebSocket.instances).toHaveLength(2);
      MockWebSocket.instances[1].simulateClose(1006, false);

      // Retry 2
      vi.advanceTimersByTime(1000);
      expect(MockWebSocket.instances).toHaveLength(3);
      MockWebSocket.instances[2].simulateClose(1006, false);

      // No more retries
      vi.advanceTimersByTime(10000);
      expect(MockWebSocket.instances).toHaveLength(3);

      controller.close();
    });

    it('resets retry count on successful reconnect', () => {
      const controller = streamJsonPatchEntries('/initial', {
        reconnect: {
          maxRetries: 3,
          getReconnectUrl: () => '/live',
        },
      });

      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();
      ws1.simulateClose(1006, false);

      // Retry 1: 500ms
      vi.advanceTimersByTime(500);
      const ws2 = MockWebSocket.instances[1];
      ws2.simulateOpen(); // success — resets retry count

      // Drop again
      ws2.simulateClose(1006, false);

      // Should start from 500ms again, not 1000ms
      vi.advanceTimersByTime(500);
      expect(MockWebSocket.instances).toHaveLength(3);

      controller.close();
    });
  });

  describe('no-reconnect scenarios', () => {
    it('does not reconnect after finished message', () => {
      const controller = streamJsonPatchEntries('/initial', {
        reconnect: {
          maxRetries: 3,
          getReconnectUrl: () => '/live',
        },
      });

      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();
      ws1.simulateMessage({ finished: true });

      // finished triggers ws.close() — should NOT reconnect
      vi.advanceTimersByTime(10000);
      expect(MockWebSocket.instances).toHaveLength(1);

      controller.close();
    });

    it('does not reconnect after close() is called', () => {
      const controller = streamJsonPatchEntries('/initial', {
        reconnect: {
          maxRetries: 3,
          getReconnectUrl: () => '/live',
        },
      });

      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();

      controller.close();
      ws1.simulateClose(1006, false);

      vi.advanceTimersByTime(10000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('does not reconnect when no reconnect config is provided', () => {
      const controller = streamJsonPatchEntries('/initial', {});

      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();
      ws1.simulateClose(1006, false);

      vi.advanceTimersByTime(10000);
      expect(MockWebSocket.instances).toHaveLength(1);

      controller.close();
    });
  });

  describe('isReconnecting state', () => {
    it('returns true during reconnection attempts', () => {
      const controller = streamJsonPatchEntries('/initial', {
        reconnect: {
          maxRetries: 3,
          getReconnectUrl: () => '/live',
        },
      });

      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();
      expect(controller.isReconnecting()).toBe(false);

      ws1.simulateClose(1006, false);
      expect(controller.isReconnecting()).toBe(true);

      vi.advanceTimersByTime(500);
      const ws2 = MockWebSocket.instances[1];
      ws2.simulateOpen();
      expect(controller.isReconnecting()).toBe(false);

      controller.close();
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they pass**

Run:
```bash
cd frontend && pnpm run test -- --run src/utils/__tests__/streamJsonPatchEntries.test.ts
```
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/__tests__/streamJsonPatchEntries.test.ts
git commit -m "test(ws): add unit tests for streamJsonPatchEntries reconnection

Tests cover: maxEntryIndex tracking, snapshot preservation across
reconnects, replace operations after reconnect, exponential backoff
timing, maxRetries limit, retry count reset, no-reconnect scenarios
(finished, close(), no config), and isReconnecting state."
```

---

### Task 4: Verify full frontend build

**Files:** (none — verification only)

- [ ] **Step 1: Run type-check**

Run:
```bash
cd frontend && pnpm run check
```
Expected: No errors.

- [ ] **Step 2: Run lint**

Run:
```bash
cd frontend && pnpm run lint
```
Expected: No errors.

- [ ] **Step 3: Run all tests**

Run:
```bash
cd frontend && pnpm run test
```
Expected: All tests pass, including the new `streamJsonPatchEntries.test.ts`.

- [ ] **Step 4: Run backend check (ensure no regressions)**

Run:
```bash
pnpm run backend:check
```
Expected: No errors (no backend files were changed).
