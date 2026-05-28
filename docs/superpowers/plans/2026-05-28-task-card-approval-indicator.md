# Task Card Pending Approval Indicator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a visual indicator on kanban TaskCards when a task has a pending approval (AskUserQuestion or tool approval), and stop showing the blue `Loader2` spinner when the attempt is in fact paused waiting on the user.

**Architecture:** Backend extends `ApprovalInfo` with `task_id: Uuid` so the existing approvals WebSocket stream (`/api/approvals/stream/ws`) is self-sufficient for mapping approvals to tasks — no per-task WebSocket. Frontend adds two small hooks (`useTaskApprovalsIndex` for grouping + GC + `markSeen`, `useTaskApprovalIndicator` for per-card lookup) and wires the indicator into `TaskCard.tsx`. localStorage tracks "seen" approval ids per device.

**Tech Stack:** Rust (axum, sqlx, ts-rs, tokio), React 18 + TypeScript, Vite, Vitest, Tailwind (legacy config), lucide-react, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-05-28-task-card-approval-indicator-design.md`

---

## File Structure

### Backend (modify)
- `crates/services/src/services/approvals.rs`
  - `ApprovalInfo` struct: add `pub task_id: Uuid`
  - `PendingApproval` struct: add `pub task_id: Uuid` (so `pending_infos()` can read it without a DB hop)
  - `create_with_waiter(request, is_question, task_id)`: new param, threads to both structs
  - `pending_infos()`: populate the new field
- `crates/services/src/services/approvals/executor_approvals.rs`
  - `create_internal`: hoist `ExecutionProcess::load_context` to *before* `create_with_waiter`, extract `task_id`, pass it in

### Frontend (create)
- `frontend/src/hooks/seenApprovalsStorage.ts` — pure helpers for the `vk:seen_approvals` localStorage entry
- `frontend/src/hooks/__tests__/seenApprovalsStorage.test.ts`
- `frontend/src/hooks/useTaskApprovalsIndex.tsx` — provider + hook; groups approvals by task_id, owns localStorage GC and `markSeen` (file extension is `.tsx` because the provider returns JSX)
- `frontend/src/hooks/__tests__/useTaskApprovalsIndex.test.tsx`
- `frontend/src/hooks/useTaskApprovalIndicator.ts` — per-task selector returning `{ kind, seen, approvalIds, toolName } | null`
- `frontend/src/hooks/__tests__/useTaskApprovalIndicator.test.tsx`

### Frontend (modify)
- `frontend/src/components/tasks/TaskCard.tsx`
  - Use `useTaskApprovalIndicator(task.id)`
  - Replace `Loader2` with indicator icon when indicator is non-null
  - On `handleClick`, also `markSeen(task.id)`
  - Update `memo` comparator to include `kind` and `seen`

### Auto-generated (do not edit by hand)
- `shared/types.ts` — regenerated via `pnpm run generate-types`

---

## Task 1: Add `task_id` to backend approval types

**Files:**
- Modify: `crates/services/src/services/approvals.rs` (PendingApproval at lines 20-28, ApprovalInfo at lines 39-47, create_with_waiter at line 86, pending_infos at line 275)

- [ ] **Step 1: Add `task_id` field to `PendingApproval`**

Edit `crates/services/src/services/approvals.rs`. Modify the existing struct:

```rust
#[derive(Debug)]
struct PendingApproval {
    execution_process_id: Uuid,
    task_id: Uuid,
    tool_name: String,
    is_question: bool,
    created_at: DateTime<Utc>,
    timeout_at: DateTime<Utc>,
    response_tx: oneshot::Sender<ApprovalOutcome>,
}
```

- [ ] **Step 2: Add `task_id` field to `ApprovalInfo`**

```rust
/// Info about a currently pending approval, sent to the frontend via WebSocket.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct ApprovalInfo {
    pub approval_id: String,
    pub tool_name: String,
    pub execution_process_id: Uuid,
    pub task_id: Uuid,
    pub is_question: bool,
    pub created_at: DateTime<Utc>,
    pub timeout_at: DateTime<Utc>,
}
```

- [ ] **Step 3: Update `create_with_waiter` signature and bodies**

Change the signature to accept `task_id: Uuid` and thread it through both struct constructions:

```rust
pub async fn create_with_waiter(
    &self,
    request: ApprovalRequest,
    is_question: bool,
    task_id: Uuid,
) -> Result<(ApprovalRequest, ApprovalWaiter), ApprovalError> {
    let (tx, rx) = oneshot::channel();
    let default_timeout = ApprovalOutcome::TimedOut;
    let waiter: ApprovalWaiter = rx
        .map(move |result| result.unwrap_or(default_timeout))
        .boxed()
        .shared();
    let req_id = request.id.clone();

    let info = ApprovalInfo {
        approval_id: req_id.clone(),
        tool_name: request.tool_name.clone(),
        execution_process_id: request.execution_process_id,
        task_id,
        is_question,
        created_at: request.created_at,
        timeout_at: request.timeout_at,
    };

    let pending_approval = PendingApproval {
        execution_process_id: request.execution_process_id,
        task_id,
        tool_name: request.tool_name.clone(),
        is_question,
        created_at: request.created_at,
        timeout_at: request.timeout_at,
        response_tx: tx,
    };

    self.pending.insert(req_id.clone(), pending_approval);

    let _ = self
        .patches_tx
        .send(crate::services::events::patches::approvals_patch::created(
            &info,
        ));

    self.spawn_timeout_watcher(req_id.clone(), request.timeout_at, waiter.clone());
    Ok((request, waiter))
}
```

- [ ] **Step 4: Update `pending_infos()` to include the new field**

```rust
fn pending_infos(&self) -> Vec<ApprovalInfo> {
    self.pending
        .iter()
        .map(|entry| {
            let p = entry.value();
            ApprovalInfo {
                approval_id: entry.key().clone(),
                tool_name: p.tool_name.clone(),
                execution_process_id: p.execution_process_id,
                task_id: p.task_id,
                is_question: p.is_question,
                created_at: p.created_at,
                timeout_at: p.timeout_at,
            }
        })
        .collect()
}
```

- [ ] **Step 5: Build the services crate to surface compile errors**

Run:
```bash
cargo check -p services
```

Expected: ONE error in `crates/services/src/services/approvals/executor_approvals.rs` line ~50 because `create_with_waiter` now requires 3 args. That's fixed in Task 2.

Do NOT commit yet — the workspace will not compile until Task 2 is done.

---

## Task 2: Bridge — hoist load_context and pass task_id

**Files:**
- Modify: `crates/services/src/services/approvals/executor_approvals.rs` lines 40-94 (`create_internal`)

The bridge already calls `ExecutionProcess::load_context(...)` for the notification title (line 62). That call returns an `ExecutionContext` containing `task: Task` (see `crates/db/src/models/execution_process.rs:103`). We hoist that call to *before* `create_with_waiter`, then pass `task_id = ctx.task.id` into the service.

Today `load_context` failure is tolerated and a fallback workspace name is used. Because the indicator hard-depends on `task_id`, treat a failed `load_context` as a hard error here — the rest of the flow already fails when the DB is unreachable.

- [ ] **Step 1: Rewrite `create_internal`**

Replace the body of `create_internal` (lines 40-94) with:

```rust
async fn create_internal(
    &self,
    tool_name: &str,
    is_question: bool,
    question_count: Option<usize>,
) -> Result<String, ExecutorApprovalError> {
    let ctx = ExecutionProcess::load_context(&self.db.pool, self.execution_process_id)
        .await
        .map_err(|e| {
            ExecutorApprovalError::request_failed(format!(
                "failed to load execution context for approval: {e}"
            ))
        })?;
    let task_id = ctx.task.id;
    let workspace_name = ctx
        .workspace
        .name
        .clone()
        .unwrap_or_else(|| ctx.workspace.branch.clone());

    let request = ApprovalRequest::new(tool_name.to_string(), self.execution_process_id);

    let (request, waiter) = self
        .approvals
        .create_with_waiter(request, is_question, task_id)
        .await
        .map_err(ExecutorApprovalError::request_failed)?;

    let approval_id = request.id.clone();

    // Store waiter for the wait phase
    self.waiters
        .lock()
        .await
        .insert(approval_id.clone(), waiter);

    let (title, message) = if let Some(count) = question_count {
        if count == 1 {
            (
                format!("Question Asked: {}", workspace_name),
                "1 question requires an answer".to_string(),
            )
        } else {
            (
                format!("Question Asked: {}", workspace_name),
                format!("{} questions require answers", count),
            )
        }
    } else {
        (
            format!("Approval Needed: {}", workspace_name),
            format!("Tool '{}' requires approval", tool_name),
        )
    };

    self.notification_service.notify(&title, &message).await;

    Ok(approval_id)
}
```

- [ ] **Step 2: Run cargo check across the workspace**

```bash
cargo check --workspace
```

Expected: clean. If you see a complaint about an unused import inside `executor_approvals.rs` (e.g., the old fallback string), remove it.

- [ ] **Step 3: Run the existing services test suite**

```bash
cargo test -p services
```

Expected: green. No tests in this crate exercise approvals end-to-end at the moment, so this just confirms no regression elsewhere.

- [ ] **Step 4: Commit**

```bash
git add crates/services/src/services/approvals.rs \
        crates/services/src/services/approvals/executor_approvals.rs
git commit -m "feat(approvals): include task_id in ApprovalInfo

ApprovalInfo now carries task_id so the frontend approvals WebSocket
stream is self-sufficient for mapping pending approvals back to kanban
tasks. The executor bridge fetches task_id from ExecutionContext before
creating the approval."
```

---

## Task 3: Regenerate `shared/types.ts`

**Files:**
- Generate: `shared/types.ts` (auto)

The TS derive macro on `ApprovalInfo` automatically emits the field; no edit to `crates/server/src/bin/generate_types.rs` is needed (`ApprovalInfo` is already on line 66 of that file per repo layout).

- [ ] **Step 1: Run the generator**

```bash
pnpm run generate-types
```

- [ ] **Step 2: Verify the diff includes `task_id` on `ApprovalInfo`**

```bash
git diff shared/types.ts | grep -A 1 ApprovalInfo
```

Expected: the generated `export type ApprovalInfo = { ... task_id: string, ... };` shows the new field. (Rust `Uuid` serializes as `string` in TS.)

- [ ] **Step 3: Type-check the frontend**

```bash
pnpm run check
```

Expected: clean. (No frontend code reads `task_id` yet, so adding the field cannot break anything.)

- [ ] **Step 4: Commit**

```bash
git add shared/types.ts
git commit -m "chore(types): regenerate shared types with ApprovalInfo.task_id"
```

---

## Task 4: localStorage helpers (pure)

We extract the seen-approvals storage into pure functions before wrapping them in a hook. Pure functions are easier to test and easier to reuse across the two new hooks. Read/write failures from a broken localStorage degrade silently to "always treated as unseen", which is safe.

**Files:**
- Create: `frontend/src/hooks/seenApprovalsStorage.ts`
- Create: `frontend/src/hooks/__tests__/seenApprovalsStorage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/__tests__/seenApprovalsStorage.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SEEN_APPROVALS_KEY,
  loadSeenApprovals,
  markApprovalsSeen,
  pruneSeenApprovals,
} from '../seenApprovalsStorage';

describe('seenApprovalsStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('returns an empty map when nothing is stored', () => {
    expect(loadSeenApprovals()).toEqual({});
  });

  it('returns an empty map when stored value is corrupt JSON', () => {
    localStorage.setItem(SEEN_APPROVALS_KEY, '{not json');
    expect(loadSeenApprovals()).toEqual({});
  });

  it('markApprovalsSeen writes ids with the provided timestamp and merges with existing', () => {
    markApprovalsSeen(['a'], 1000);
    markApprovalsSeen(['b', 'c'], 2000);
    expect(loadSeenApprovals()).toEqual({ a: 1000, b: 2000, c: 2000 });
  });

  it('markApprovalsSeen overwrites the timestamp for an id seen again', () => {
    markApprovalsSeen(['a'], 1000);
    markApprovalsSeen(['a'], 2000);
    expect(loadSeenApprovals()).toEqual({ a: 2000 });
  });

  it('markApprovalsSeen with an empty array is a no-op', () => {
    markApprovalsSeen(['a'], 1000);
    markApprovalsSeen([], 9999);
    expect(loadSeenApprovals()).toEqual({ a: 1000 });
  });

  it('pruneSeenApprovals keeps only ids in the live set', () => {
    markApprovalsSeen(['a', 'b', 'c'], 1000);
    pruneSeenApprovals(new Set(['b']));
    expect(loadSeenApprovals()).toEqual({ b: 1000 });
  });

  it('pruneSeenApprovals does not touch storage when nothing would change', () => {
    markApprovalsSeen(['a'], 1000);
    const before = localStorage.getItem(SEEN_APPROVALS_KEY);
    pruneSeenApprovals(new Set(['a']));
    expect(localStorage.getItem(SEEN_APPROVALS_KEY)).toBe(before);
  });

  it('survives a throwing localStorage.setItem without crashing', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota exceeded');
    };
    try {
      expect(() => markApprovalsSeen(['a'], 1000)).not.toThrow();
      expect(loadSeenApprovals()).toEqual({});
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && pnpm test src/hooks/__tests__/seenApprovalsStorage.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement the helpers**

Create `frontend/src/hooks/seenApprovalsStorage.ts`:

```ts
export const SEEN_APPROVALS_KEY = 'vk:seen_approvals';

export type SeenApprovals = Record<string, number>;

export function loadSeenApprovals(): SeenApprovals {
  try {
    const raw = localStorage.getItem(SEEN_APPROVALS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as SeenApprovals;
    }
    return {};
  } catch {
    return {};
  }
}

function save(value: SeenApprovals): void {
  try {
    localStorage.setItem(SEEN_APPROVALS_KEY, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled — degrade silently. The badge will
    // re-render as unseen on next load, which is safe.
  }
}

export function markApprovalsSeen(approvalIds: string[], now: number): void {
  if (approvalIds.length === 0) return;
  const current = loadSeenApprovals();
  let changed = false;
  for (const id of approvalIds) {
    if (current[id] !== now) {
      current[id] = now;
      changed = true;
    }
  }
  if (changed) save(current);
}

export function pruneSeenApprovals(liveIds: Set<string>): void {
  const current = loadSeenApprovals();
  let changed = false;
  for (const id of Object.keys(current)) {
    if (!liveIds.has(id)) {
      delete current[id];
      changed = true;
    }
  }
  if (changed) save(current);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && pnpm test src/hooks/__tests__/seenApprovalsStorage.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/seenApprovalsStorage.ts \
        frontend/src/hooks/__tests__/seenApprovalsStorage.test.ts
git commit -m "feat(approvals): add seen-approvals localStorage helpers"
```

---

## Task 5: `useTaskApprovalsIndex` hook

This hook is rendered once per page (next to `useApprovals` in `ProjectTasks.tsx`). It produces a `Map<task_id, ApprovalInfo[]>`, runs GC on `pendingApprovals` changes, and exposes a `markSeen(taskId)` callback. Sharing happens via React context so every `TaskCard` reads the same `Map` and the same `markSeen` without prop-drilling.

**Files:**
- Create: `frontend/src/hooks/useTaskApprovalsIndex.ts`
- Create: `frontend/src/hooks/__tests__/useTaskApprovalsIndex.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/__tests__/useTaskApprovalsIndex.test.tsx`:

```tsx
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApprovalInfo } from 'shared/types';
import { TaskApprovalsProvider, useTaskApprovalsIndex } from '../useTaskApprovalsIndex';
import {
  SEEN_APPROVALS_KEY,
  loadSeenApprovals,
} from '../seenApprovalsStorage';

const pendingApprovalsMock = vi.hoisted(() => ({ current: [] as ApprovalInfo[] }));
vi.mock('../useApprovals', () => ({
  useApprovals: () => ({ pendingApprovals: pendingApprovalsMock.current }),
}));

function makeApproval(overrides: Partial<ApprovalInfo>): ApprovalInfo {
  return {
    approval_id: 'a1',
    tool_name: 'Bash',
    execution_process_id: 'ep1',
    task_id: 'task-1',
    is_question: false,
    created_at: '2026-05-28T00:00:00Z',
    timeout_at: '2026-05-28T00:01:00Z',
    ...overrides,
  } as ApprovalInfo;
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <TaskApprovalsProvider>{children}</TaskApprovalsProvider>;
}

describe('useTaskApprovalsIndex', () => {
  beforeEach(() => {
    localStorage.clear();
    pendingApprovalsMock.current = [];
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('groups approvals by task_id', () => {
    pendingApprovalsMock.current = [
      makeApproval({ approval_id: 'a1', task_id: 'task-1' }),
      makeApproval({ approval_id: 'a2', task_id: 'task-1', is_question: true }),
      makeApproval({ approval_id: 'a3', task_id: 'task-2' }),
    ];
    const { result } = renderHook(() => useTaskApprovalsIndex(), { wrapper });
    expect(result.current.byTaskId.get('task-1')?.map((a) => a.approval_id)).toEqual(['a1', 'a2']);
    expect(result.current.byTaskId.get('task-2')?.map((a) => a.approval_id)).toEqual(['a3']);
  });

  it('markSeen writes approval ids for the given task', () => {
    pendingApprovalsMock.current = [
      makeApproval({ approval_id: 'a1', task_id: 'task-1' }),
      makeApproval({ approval_id: 'a2', task_id: 'task-1' }),
      makeApproval({ approval_id: 'a3', task_id: 'task-2' }),
    ];
    const { result } = renderHook(() => useTaskApprovalsIndex(), { wrapper });
    act(() => {
      result.current.markSeen('task-1');
    });
    const stored = loadSeenApprovals();
    expect(Object.keys(stored).sort()).toEqual(['a1', 'a2']);
    expect(stored.a3).toBeUndefined();
  });

  it('markSeen on a task with no pending approvals is a no-op', () => {
    pendingApprovalsMock.current = [
      makeApproval({ approval_id: 'a1', task_id: 'task-1' }),
    ];
    const { result } = renderHook(() => useTaskApprovalsIndex(), { wrapper });
    act(() => {
      result.current.markSeen('task-other');
    });
    expect(localStorage.getItem(SEEN_APPROVALS_KEY)).toBeNull();
  });

  it('GC prunes seen ids that are no longer in pending', () => {
    pendingApprovalsMock.current = [
      makeApproval({ approval_id: 'a1', task_id: 'task-1' }),
      makeApproval({ approval_id: 'a2', task_id: 'task-1' }),
    ];
    const { result, rerender } = renderHook(() => useTaskApprovalsIndex(), { wrapper });
    act(() => {
      result.current.markSeen('task-1');
    });
    expect(Object.keys(loadSeenApprovals()).sort()).toEqual(['a1', 'a2']);

    pendingApprovalsMock.current = [
      makeApproval({ approval_id: 'a2', task_id: 'task-1' }),
    ];
    rerender();
    expect(Object.keys(loadSeenApprovals())).toEqual(['a2']);
  });

  it('all consumers under one provider share the same Map identity per render', () => {
    pendingApprovalsMock.current = [
      makeApproval({ approval_id: 'a1', task_id: 'task-1' }),
    ];
    let firstSeen: unknown;
    let secondSeen: unknown;
    function Probe({ label }: { label: string }) {
      const idx = useTaskApprovalsIndex();
      if (label === 'first') firstSeen = idx.byTaskId;
      if (label === 'second') secondSeen = idx.byTaskId;
      return null;
    }
    render(
      <TaskApprovalsProvider>
        <Probe label="first" />
        <Probe label="second" />
      </TaskApprovalsProvider>
    );
    expect(firstSeen).toBe(secondSeen);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && pnpm test src/hooks/__tests__/useTaskApprovalsIndex.test.tsx
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement the hook and provider**

Create `frontend/src/hooks/useTaskApprovalsIndex.tsx` (note `.tsx` — the provider returns JSX):

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import type { ApprovalInfo } from 'shared/types';
import { useApprovals } from './useApprovals';
import {
  markApprovalsSeen,
  pruneSeenApprovals,
} from './seenApprovalsStorage';

export interface TaskApprovalsIndex {
  byTaskId: Map<string, ApprovalInfo[]>;
  markSeen: (taskId: string) => void;
}

const TaskApprovalsContext = createContext<TaskApprovalsIndex | null>(null);

export function TaskApprovalsProvider({ children }: { children: ReactNode }) {
  const { pendingApprovals } = useApprovals();

  const byTaskId = useMemo(() => {
    const map = new Map<string, ApprovalInfo[]>();
    for (const approval of pendingApprovals) {
      const list = map.get(approval.task_id);
      if (list) list.push(approval);
      else map.set(approval.task_id, [approval]);
    }
    return map;
  }, [pendingApprovals]);

  // Garbage-collect any seen ids that no longer correspond to a live approval.
  useEffect(() => {
    const liveIds = new Set(pendingApprovals.map((a) => a.approval_id));
    pruneSeenApprovals(liveIds);
  }, [pendingApprovals]);

  const markSeen = useCallback(
    (taskId: string) => {
      const approvals = byTaskId.get(taskId);
      if (!approvals || approvals.length === 0) return;
      markApprovalsSeen(
        approvals.map((a) => a.approval_id),
        Date.now()
      );
    },
    [byTaskId]
  );

  const value = useMemo<TaskApprovalsIndex>(
    () => ({ byTaskId, markSeen }),
    [byTaskId, markSeen]
  );

  return (
    <TaskApprovalsContext.Provider value={value}>
      {children}
    </TaskApprovalsContext.Provider>
  );
}

export function useTaskApprovalsIndex(): TaskApprovalsIndex {
  const ctx = useContext(TaskApprovalsContext);
  if (!ctx) {
    throw new Error(
      'useTaskApprovalsIndex must be used inside <TaskApprovalsProvider>'
    );
  }
  return ctx;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && pnpm test src/hooks/__tests__/useTaskApprovalsIndex.test.tsx
```

Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useTaskApprovalsIndex.tsx \
        frontend/src/hooks/__tests__/useTaskApprovalsIndex.test.tsx
git commit -m "feat(approvals): add useTaskApprovalsIndex hook + provider

Groups pending approvals by task_id, GCs the seen-approvals localStorage
record on every change, and exposes markSeen so TaskCards can mark
acknowledged when the user opens the detail view."
```

---

## Task 6: `useTaskApprovalIndicator` hook

Per-card selector. Reads from `useTaskApprovalsIndex()` and `loadSeenApprovals()`. Returns `null` when there is no pending approval for the task.

**Files:**
- Create: `frontend/src/hooks/useTaskApprovalIndicator.ts`
- Create: `frontend/src/hooks/__tests__/useTaskApprovalIndicator.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/__tests__/useTaskApprovalIndicator.test.tsx`:

```tsx
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApprovalInfo } from 'shared/types';
import {
  TaskApprovalsProvider,
  useTaskApprovalsIndex,
} from '../useTaskApprovalsIndex';
import { useTaskApprovalIndicator } from '../useTaskApprovalIndicator';

const pendingApprovalsMock = vi.hoisted(() => ({
  current: [] as ApprovalInfo[],
}));
vi.mock('../useApprovals', () => ({
  useApprovals: () => ({ pendingApprovals: pendingApprovalsMock.current }),
}));

function makeApproval(overrides: Partial<ApprovalInfo>): ApprovalInfo {
  return {
    approval_id: 'a1',
    tool_name: 'Bash',
    execution_process_id: 'ep1',
    task_id: 'task-1',
    is_question: false,
    created_at: '2026-05-28T00:00:00Z',
    timeout_at: '2026-05-28T00:01:00Z',
    ...overrides,
  } as ApprovalInfo;
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <TaskApprovalsProvider>{children}</TaskApprovalsProvider>;
}

describe('useTaskApprovalIndicator', () => {
  beforeEach(() => {
    localStorage.clear();
    pendingApprovalsMock.current = [];
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('returns null when the task has no pending approvals', () => {
    pendingApprovalsMock.current = [
      makeApproval({ approval_id: 'a1', task_id: 'task-other' }),
    ];
    const { result } = renderHook(() => useTaskApprovalIndicator('task-1'), {
      wrapper,
    });
    expect(result.current).toBeNull();
  });

  it('returns kind="tool_approval" for is_question=false', () => {
    pendingApprovalsMock.current = [
      makeApproval({
        approval_id: 'a1',
        task_id: 'task-1',
        is_question: false,
        tool_name: 'Bash',
      }),
    ];
    const { result } = renderHook(() => useTaskApprovalIndicator('task-1'), {
      wrapper,
    });
    expect(result.current?.kind).toBe('tool_approval');
    expect(result.current?.toolName).toBe('Bash');
    expect(result.current?.approvalIds).toEqual(['a1']);
  });

  it('returns kind="question" for is_question=true', () => {
    pendingApprovalsMock.current = [
      makeApproval({
        approval_id: 'a1',
        task_id: 'task-1',
        is_question: true,
        tool_name: 'AskUserQuestion',
      }),
    ];
    const { result } = renderHook(() => useTaskApprovalIndicator('task-1'), {
      wrapper,
    });
    expect(result.current?.kind).toBe('question');
  });

  it('prioritises question over tool_approval when both exist', () => {
    pendingApprovalsMock.current = [
      makeApproval({
        approval_id: 'a1',
        task_id: 'task-1',
        is_question: false,
        tool_name: 'Bash',
      }),
      makeApproval({
        approval_id: 'a2',
        task_id: 'task-1',
        is_question: true,
        tool_name: 'AskUserQuestion',
      }),
    ];
    const { result } = renderHook(() => useTaskApprovalIndicator('task-1'), {
      wrapper,
    });
    expect(result.current?.kind).toBe('question');
    expect(result.current?.toolName).toBe('AskUserQuestion');
    expect(result.current?.approvalIds.sort()).toEqual(['a1', 'a2']);
  });

  it('seen is false when storage is empty', () => {
    pendingApprovalsMock.current = [
      makeApproval({ approval_id: 'a1', task_id: 'task-1' }),
    ];
    const { result } = renderHook(() => useTaskApprovalIndicator('task-1'), {
      wrapper,
    });
    expect(result.current?.seen).toBe(false);
  });

  it('seen flips true after markSeen, false again when a new approval arrives', () => {
    pendingApprovalsMock.current = [
      makeApproval({ approval_id: 'a1', task_id: 'task-1' }),
    ];
    const { result, rerender } = renderHook(
      () => {
        const idx = useTaskApprovalsIndex();
        const indicator = useTaskApprovalIndicator('task-1');
        return { idx, indicator };
      },
      { wrapper }
    );
    act(() => {
      result.current.idx.markSeen('task-1');
    });
    rerender();
    expect(result.current.indicator?.seen).toBe(true);

    pendingApprovalsMock.current = [
      makeApproval({ approval_id: 'a1', task_id: 'task-1' }),
      makeApproval({ approval_id: 'a2', task_id: 'task-1', is_question: true }),
    ];
    rerender();
    expect(result.current.indicator?.seen).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && pnpm test src/hooks/__tests__/useTaskApprovalIndicator.test.tsx
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement the hook**

Create `frontend/src/hooks/useTaskApprovalIndicator.ts`:

```ts
import { useMemo } from 'react';
import type { ApprovalInfo } from 'shared/types';
import { useTaskApprovalsIndex } from './useTaskApprovalsIndex';
import { loadSeenApprovals } from './seenApprovalsStorage';

export type ApprovalIndicatorKind = 'question' | 'tool_approval';

export interface TaskApprovalIndicator {
  kind: ApprovalIndicatorKind;
  seen: boolean;
  approvalIds: string[];
  toolName: string;
}

function pickWinner(approvals: ApprovalInfo[]): ApprovalInfo {
  // Priority: AskUserQuestion (is_question) > tool approval.
  return approvals.find((a) => a.is_question) ?? approvals[0];
}

export function useTaskApprovalIndicator(
  taskId: string
): TaskApprovalIndicator | null {
  const { byTaskId } = useTaskApprovalsIndex();
  const approvals = byTaskId.get(taskId);

  return useMemo<TaskApprovalIndicator | null>(() => {
    if (!approvals || approvals.length === 0) return null;
    const winner = pickWinner(approvals);
    const seenMap = loadSeenApprovals();
    const approvalIds = approvals.map((a) => a.approval_id);
    const seen = approvalIds.every((id) => id in seenMap);
    return {
      kind: winner.is_question ? 'question' : 'tool_approval',
      seen,
      approvalIds,
      toolName: winner.tool_name,
    };
  }, [approvals]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && pnpm test src/hooks/__tests__/useTaskApprovalIndicator.test.tsx
```

Expected: PASS (all 6 tests).

> **Note on `seen` reactivity:** `loadSeenApprovals` is called inside `useMemo` keyed on `approvals`. When `markSeen` writes to localStorage, the existing `approvals` reference does not change, so the memo would not recompute on its own. That recompute happens when `pendingApprovals` next changes, OR when the consumer re-renders for any other reason (the cheap path: `TaskCard.handleClick` triggers `onViewDetails` which navigates / opens the panel and re-renders the kanban). This is acceptable for v1 — the visual transition from "pulsing" to "dim" happens within the same user interaction. If we ever observe stale `seen` flapping, the fix is to bump a counter in the provider on `markSeen` and include it in the memo key. Do not add that until needed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useTaskApprovalIndicator.ts \
        frontend/src/hooks/__tests__/useTaskApprovalIndicator.test.tsx
git commit -m "feat(approvals): add useTaskApprovalIndicator selector hook"
```

---

## Task 7: Mount the provider in `ProjectTasks`

Wrap the part of the tree that renders TaskCards (the kanban) in `<TaskApprovalsProvider>`. Existing `useApprovals()` calls in this subtree continue to work — the provider does not replace `useApprovals`, it consumes it.

**Files:**
- Modify: `frontend/src/pages/ProjectTasks.tsx`

- [ ] **Step 1: Locate the kanban subtree**

Open `frontend/src/pages/ProjectTasks.tsx`. Find the JSX that renders `TaskKanbanBoard` (or whatever renders the columns and cards). The provider should wrap that, *not* the whole page — keeping the provider as low as possible avoids re-rendering unrelated subtrees.

- [ ] **Step 2: Add the import and wrap**

At the top of the file:

```ts
import { TaskApprovalsProvider } from '@/hooks/useTaskApprovalsIndex';
```

In the JSX, wrap the kanban region:

```tsx
<TaskApprovalsProvider>
  <TaskKanbanBoard ... />
  {/* …anything else inside the kanban region that needs the indicator… */}
</TaskApprovalsProvider>
```

If `TaskKanbanBoard` is the only consumer site, the wrap is exactly one extra element.

- [ ] **Step 3: Type-check**

```bash
cd frontend && pnpm run check
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ProjectTasks.tsx
git commit -m "feat(approvals): mount TaskApprovalsProvider around the kanban"
```

---

## Task 8: Wire the indicator into `TaskCard`

This is the user-visible change. Three things happen here:

1. When the indicator is non-null, render `MessageCircleQuestion` (question) or `ShieldQuestion` (tool_approval) instead of `Loader2`.
2. `seen` controls color and animation: unseen → `text-warning` + `animate-pulse`; seen → `text-warning/60`, no animation.
3. `handleClick` also calls `markSeen(task.id)` so the dim state takes effect on the next render.

**Files:**
- Modify: `frontend/src/components/tasks/TaskCard.tsx`

- [ ] **Step 1: Add imports**

At the top of `TaskCard.tsx`, alongside the existing lucide import line:

```tsx
import {
  Link,
  Loader2,
  MessageCircleQuestion,
  Settings2,
  ShieldQuestion,
  SquareTerminal,
  XCircle,
} from 'lucide-react';
import { useTaskApprovalsIndex } from '@/hooks/useTaskApprovalsIndex';
import { useTaskApprovalIndicator } from '@/hooks/useTaskApprovalIndicator';
```

- [ ] **Step 2: Call the hooks inside the component**

Inside `TaskCard`, near the top of the function body (next to the other hook calls):

```tsx
const { markSeen } = useTaskApprovalsIndex();
const approvalIndicator = useTaskApprovalIndicator(task.id);
```

- [ ] **Step 3: Mark seen on click**

Modify `handleClick`:

```tsx
const handleClick = useCallback(() => {
  if (approvalIndicator) {
    markSeen(task.id);
  }
  onViewDetails(task);
}, [task, onViewDetails, markSeen, approvalIndicator]);
```

- [ ] **Step 4: Render the indicator (replacing the spinner conditionally)**

Replace the current spinner line:

```tsx
{task.has_in_progress_attempt && (
  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
)}
```

With:

```tsx
{approvalIndicator ? (
  approvalIndicator.kind === 'question' ? (
    <MessageCircleQuestion
      className={
        approvalIndicator.seen
          ? 'h-4 w-4 text-warning/60'
          : 'h-4 w-4 text-warning animate-pulse'
      }
      aria-label={t('approvalIndicator.waitingAnswer', 'Waiting for your answer')}
      title={t('approvalIndicator.waitingAnswer', 'Waiting for your answer')}
    />
  ) : (
    <ShieldQuestion
      className={
        approvalIndicator.seen
          ? 'h-4 w-4 text-warning/60'
          : 'h-4 w-4 text-warning animate-pulse'
      }
      aria-label={t('approvalIndicator.awaitingApproval', 'Awaiting approval: {{tool}}', {
        tool: approvalIndicator.toolName,
      })}
      title={t('approvalIndicator.awaitingApproval', 'Awaiting approval: {{tool}}', {
        tool: approvalIndicator.toolName,
      })}
    />
  )
) : task.has_in_progress_attempt ? (
  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
) : null}
```

> The `title` prop gives native browser tooltips; `aria-label` carries the same string for screen readers. If the project has a shared `Tooltip` primitive used by other indicators in this slot, you may swap to that instead — but the existing icons (Loader2, XCircle, SquareTerminal) use no tooltip at all, so native `title` is consistent and lightweight.
>
> If `useTranslation('tasks')` is not loaded with these specific keys, the second argument to `t(...)` acts as the default. Keys can be added to translation files later without blocking this task.

- [ ] **Step 5: Update the `memo` comparator**

The existing `(prev, next) => { ... }` comparator returns `true` only when nothing the card depends on changed. Add the indicator-affecting state. Because the indicator comes from hooks (not props), we cannot compare it via `prev` / `next` — but we can derive equivalent state from the same hooks inside the comparator. Simpler and safer: rely on React's default behavior for hook-driven state.

The `memo` HOC re-renders when *props or state from hooks* changes. The current custom comparator only sees props. Because the indicator state is driven by hooks (which always trigger a re-render when their source changes), we do not need to extend the comparator — but we DO need to be careful that the comparator does not prevent re-renders that hooks would otherwise cause. With a custom `areEqual` returning `true`, React skips the re-render even though the hook dependency changed.

The fix: include `task.id` in the comparator (it already is, indirectly via `prev.task.id`). React will still re-render the component when hooks update. **Confirm by reading React docs**: `memo`'s `arePropsEqual` skips the render only based on props; if internal state from `useState` / `useReducer` changes, React still re-renders. **Hooks like `useContext` are also state — when context value identity changes, React re-renders the consumer even with `memo`**.

So no change is needed for context-driven updates from `TaskApprovalsProvider` — the context will trigger re-renders. The existing comparator is fine.

**However**, if `useTaskApprovalsIndex` is invoked from inside `TaskCard`, and the context value changes on every pending-approvals update (it does — `byTaskId` is a new `Map` instance per render), then *every* `TaskCard` re-renders on *every* approvals change. That is N cards × M approval updates. For a typical board (≤200 cards, infrequent approval events) this is fine. If we ever need to throttle, the fix is to memoize the indicator hook's *output* per-card and compare by value, but **do not add that now**.

- [ ] **Step 6: Type-check**

```bash
cd frontend && pnpm run check
```

Expected: clean.

- [ ] **Step 7: Lint**

```bash
cd frontend && pnpm run lint
```

Expected: clean.

- [ ] **Step 8: Run all frontend tests**

```bash
cd frontend && pnpm test
```

Expected: all green (existing tests + the 3 new test files from tasks 4-6).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/tasks/TaskCard.tsx
git commit -m "feat(tasks): show pending approval indicator on TaskCard

Replaces the blue Loader2 spinner with MessageCircleQuestion (for
AskUserQuestion) or ShieldQuestion (for tool approvals) when the task
has a pending approval. Unseen approvals pulse in text-warning; once
the user opens the task they dim to text-warning/60. The Loader2
spinner now exclusively means 'model is generating tokens'."
```

---

## Task 9: Manual smoke test

This step is verification, not implementation. Required before opening a PR.

- [ ] **Step 1: Start the dev environment**

```bash
pnpm run dev
```

Wait until both the backend and the Vite server are up. Open the URL the script prints.

- [ ] **Step 2: Trigger an AskUserQuestion in a real attempt**

In the dev UI:
1. Create or pick an active task whose attempt is running.
2. Send a prompt that will cause the agent to ask a question (e.g., `"Ask me which framework I prefer between React and Vue using AskUserQuestion."`).
3. **Stay on the kanban view** (do not open the task detail).

**Expect:**
- A browser/system notification fires (existing behavior).
- The corresponding task card stops showing the blue spinner and shows an orange `MessageCircleQuestion` with `animate-pulse`.
- Hovering the icon shows "Waiting for your answer".

- [ ] **Step 3: Open the task, then return to the kanban**

Click the task card.

**Expect:**
- The detail panel opens, `AskUserQuestionBanner` is visible inside.
- Close / navigate back to the kanban. The icon on the card is now dimmed to `text-warning/60` and no longer pulses.

- [ ] **Step 4: Reload the page while the question is still unanswered**

Hit refresh on the browser.

**Expect:**
- The dim indicator is still on the same card (localStorage `vk:seen_approvals` survived).

- [ ] **Step 5: Answer the question**

Open the card again, answer the question in the banner.

**Expect:**
- The indicator disappears.
- If the attempt is still working, the blue spinner returns.
- localStorage entry for that approval id has been GC'd (check via DevTools → Application → Local Storage).

- [ ] **Step 6: Trigger a tool approval (not a question)**

Configure or pick an agent that requests tool approval (e.g., Bash with confirmation). Send a prompt that triggers a tool call.

**Expect:**
- Notification fires.
- Card shows `ShieldQuestion` orange + pulse.
- Tooltip: "Awaiting approval: Bash" (or whatever tool name).

- [ ] **Step 7: Confirm column-move still acts as the inreview signal**

Mark a task as Done or have an attempt complete and move to In Review.

**Expect:**
- The card moves columns. No new icon appears for `inreview`. This is intentional — that's the spec.

If any step fails, do not check the box. Capture what happened, then go back and fix.

---

## Self-Review

Done after writing the plan. Cross-reference against the spec.

1. **Spec coverage:**
   - Goal (visual indicator + spinner fix): Tasks 8, 9
   - Scope (only pending approval, not inreview): Task 9 step 7 explicitly verifies
   - Visual design (MessageCircleQuestion / ShieldQuestion / text-warning / animate-pulse / seen variants): Task 8 step 4
   - Spinner replacement rule: Task 8 step 4 (the ternary)
   - Tooltip text: Task 8 step 4 (title + aria-label)
   - Backend `task_id` on ApprovalInfo: Tasks 1, 2
   - Frontend mapping (group by task_id): Task 5
   - Seen state (localStorage `vk:seen_approvals`): Tasks 4, 5
   - GC owner (centralized in provider): Task 5 step 3 (effect in provider)
   - Write path (mark seen on open): Task 8 step 3
   - Read path (every approval id in storage): Task 6 step 3 (`every((id) => id in seenMap)`)
   - Components: New files in Tasks 4, 5, 6; modified in Tasks 7, 8
   - Edge cases (approval resolves, new approval arrives, multiple kinds, localStorage failure): Covered by tests in Tasks 4-6 and smoke steps in Task 9
   - Testing (backend unit, frontend hooks, manual smoke): Tasks 1-2 (cargo), 4-6 (vitest), 9 (manual)

2. **Placeholder scan:** No TBDs, no "handle errors appropriately" — every step has runnable code or an exact command.

3. **Type consistency:**
   - `task_id: Uuid` in Rust → `task_id: string` in TS (Uuid serializes as string). Test fixtures and types use the string form. ✓
   - `kind: 'question' | 'tool_approval'` everywhere consistent. ✓
   - `markSeen(taskId: string)` — same name, same signature in tests and implementation. ✓
   - `useTaskApprovalsIndex` returns `{ byTaskId, markSeen }` — consistent across tests, hook impl, and consumer in Task 8. ✓
   - `TaskApprovalIndicator` shape (`{ kind, seen, approvalIds, toolName }`) — consistent. ✓

No gaps found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-28-task-card-approval-indicator.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — I execute tasks in this session using `executing-plans`, batch execution with checkpoints for review.

Which approach?
