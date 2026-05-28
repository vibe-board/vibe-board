# Task Card Pending Approval Indicator

## Goal

When a notification fires for a pending approval (AskUserQuestion or a tool
approval), the user should be able to tell *which* task triggered it from the
kanban board, without opening each card. Today the notification toast and sound
fire but the kanban cards look identical, so the user cannot locate the task
that needs attention.

This also fixes an existing UI misuse: the blue `Loader2` spinner on a task
card is shown whenever `has_in_progress_attempt` is true, including when the
attempt is actually paused waiting for the user to answer an `AskUserQuestion`
or approve a tool call. "Spinner" should mean "model is generating tokens",
not "stalled waiting on the human".

## Current State

### Notification path (already working)

`frontend/src/hooks/useTaskNotifications.ts` watches two sources and fires
browser notifications + sounds when something new arrives:

- `pendingApprovals` from `useApprovals()` (WebSocket
  `/api/approvals/stream/ws`). Each item has `approval_id`,
  `execution_process_id`, `is_question`, `tool_name`, `created_at`,
  `timeout_at`.
- `tasksById` status transitions to `inreview`.

The hook plays a sound and shows a browser notification. For `inreview` the
body is `task title + agent name`; for approvals the body is just the
`tool_name` — the task title is not surfaced because the hook doesn't have
the link from approval to task. Nothing on screen changes.

### Task card UI

`frontend/src/components/tasks/TaskCard.tsx` and `TaskCardHeader.tsx` render a
title and a right-side slot of small icons:

| Icon | Source | Meaning today |
|---|---|---|
| `Loader2` (blue, spinning) | `task.has_in_progress_attempt` | "Attempt running" — but conflates generating and paused-for-user |
| `XCircle` (destructive) | `task.last_attempt_failed` | Last attempt failed |
| `Link` (button) | `task.parent_workspace_id` | Jump to parent attempt |
| `SquareTerminal` (emerald) | `hasTerminalForTask(task.id)` | Terminal session open for this task |
| `ActionsDropdown` | always | Per-task menu |

There is no signal that a task has a pending approval.

### What the backend already exposes

- `ApprovalInfo` (shared/types.ts) carries `approval_id`,
  `execution_process_id`, `is_question`, `tool_name`, `created_at`,
  `timeout_at`. Pushed to the client via `/api/approvals/stream/ws`
  (`useApprovals`).
- `WorkspaceSummary` has `has_pending_approval: bool` per workspace/attempt,
  but `WorkspaceSummary` is not loaded for every kanban card.
- `Task` (the payload streamed by `useProjectTasks`) carries
  `has_in_progress_attempt` and `last_attempt_failed` but **not**
  `execution_process_id` or any pending-approval flag.

### Missing link

There is no client-side way to map `pendingApprovals[i].execution_process_id`
back to a kanban `Task.id` without opening a per-attempt WebSocket
(`useExecutionProcesses(sessionId)`) for every visible task. With 200 tasks on
a board that is N WebSockets, which is unacceptable.

The minimal backend change is to add `task_id: String` to `ApprovalInfo` so
the existing `useApprovals` stream is self-sufficient. The backend already
has this mapping — execution process → attempt → task — and just needs to
include it in the payload.

## Scope

| Trigger | Notification (today) | Card indicator (new) |
|---|---|---|
| AskUserQuestion (`is_question=true`) | Yes | Yes |
| Generic tool approval (`is_question=false`) | Yes | Yes |
| Status transitions to `inreview` | Yes | **No** — card moves to the In Review column, which is already the visual signal |

The indicator is strictly for *pending approval* state on a task.

## Visual Design

All tokens follow the legacy design system per `CLAUDE.md`. The legacy palette
exposes semantic tokens `warning`, `destructive`, `accent`, `primary`
(`brand` is new-design only and is not used here).

### Icons (lucide)

| Situation | Icon | Color | Animation |
|---|---|---|---|
| In progress, no pending approval | `Loader2` | `text-blue-500` | `animate-spin` |
| AskUserQuestion pending, **unseen** | `MessageCircleQuestion` | `text-warning` | `animate-pulse` |
| AskUserQuestion pending, **seen** | `MessageCircleQuestion` | `text-warning/60` | none |
| Tool approval pending, **unseen** | `ShieldQuestion` | `text-warning` | `animate-pulse` |
| Tool approval pending, **seen** | `ShieldQuestion` | `text-warning/60` | none |
| Attempt failed | `XCircle` | `text-destructive` | none |

### Spinner replacement rule

When a task has both `has_in_progress_attempt = true` and at least one pending
approval matching one of its execution processes, the spinner is **replaced**
(not stacked) by the approval icon. Once the approval is resolved and the
attempt is still running, the spinner returns.

If multiple pending approvals exist for the same task at once (e.g., the
attempt asked a question and is also waiting on a queued tool approval),
choose the icon in this priority order:

1. `MessageCircleQuestion` (AskUserQuestion) — most user-facing
2. `ShieldQuestion` (tool approval)

### Tooltip text

Hovering the indicator shows:

- AskUserQuestion: `Waiting for your answer`
- Tool approval: `Awaiting approval: {tool_name}`

`{tool_name}` is from `ApprovalInfo.tool_name`.

### Placement

Inside the existing `right` slot of `TaskCardHeader`. No new layout slot, no
card border change, no corner badge sticking out.

## Data Flow

```
Backend (new field):
  ApprovalInfo { approval_id, execution_process_id, task_id, is_question, ... }

Frontend:
  useApprovals()  →  pendingApprovals: ApprovalInfo[]
                          │
                          │ group by task_id
                          ▼
  useTaskApprovalsIndex()  → Map<task_id, ApprovalInfo[]>
                          │
                          ▼
  useTaskApprovalIndicator(taskId)
   returns:
     {
       kind: 'question' | 'tool_approval',
       seen: boolean,
       approvalIds: string[],
       toolName: string,
     }
   or null when there is no pending approval for the task.
```

### Backend change

Single struct field addition: `task_id: String` on `ApprovalInfo`. The
backend already has the data — when an approval is created or surfaced, the
service knows which task_attempt and therefore which task it belongs to.
Wherever `ApprovalInfo` is constructed for the WebSocket stream, populate
`task_id`.

Regenerate `shared/types.ts` via `pnpm run generate-types` after editing
`crates/server/src/bin/generate_types.rs` if needed.

### Frontend mapping

With `task_id` on every `ApprovalInfo`, grouping is a one-line reduce over
`pendingApprovals`. No per-task WebSocket, no walking
attempts/execution_processes on the client.

## Seen State (localStorage)

### Why localStorage

State-driven plus device-local "seen". The badge always reflects the current
truth (approval still pending → indicator stays). The "seen" overlay tracks
whether *this device* has acknowledged a given approval, so it survives page
reloads without needing backend involvement and without leaking one user's
read state to another device.

### Storage shape

```ts
// localStorage key: "vk:seen_approvals"
type SeenApprovals = Record<
  string /* approval_id */,
  number   /* unix ms when marked seen */
>;
```

The shape is intentionally flat: the key is the approval id itself. Both
AskUserQuestion approvals and tool approvals share the same record, because
both come from the same `ApprovalInfo` stream and both have unique
`approval_id`s.

### Write path

When the user opens a task detail view (`onViewDetails(task)` in
`TaskCard.tsx`), collect every `approval_id` currently pending for that task
and write them into `seen_approvals` with `Date.now()`.

This includes both kinds — opening the task acknowledges *all* outstanding
approvals belonging to it.

### Read path

`useTaskApprovalIndicator(taskId)` computes `seen` as: every approval id in
the task's pending set is present in `seen_approvals`. If a new approval
appears later, `seen` flips back to false until the user reopens the task.

### Garbage collection

On every change to `pendingApprovals`, the indicator layer trims
`seen_approvals` so it only contains ids still present in the live stream.
This prevents unbounded growth and avoids stale entries colliding with future
ids.

GC happens client-side; there is no cross-tab coordination required because
each tab independently observes the same `pendingApprovals` stream.

### Cross-tab / multi-device

- Same browser, multiple tabs: localStorage is shared. A tab that marks an
  approval seen will make the other tabs catch up on the next render or
  storage event. We do not need to listen for `storage` events explicitly;
  rerendering on `pendingApprovals` change is enough for first iteration.
- Different devices: not synced. Each device has its own seen state. This is
  acceptable because notifications are also per-device.

## Components and Modules

### New (frontend)

- `frontend/src/hooks/useTaskApprovalsIndex.ts`
  - Wraps `useApprovals()`. Returns `Map<task_id, ApprovalInfo[]>` derived
    from `pendingApprovals` via a single `useMemo`.
  - Owns localStorage GC: one `useEffect` watches `pendingApprovals` and
    trims `seen_approvals` to ids still present in the live stream. There is
    exactly one GC runner per page, not one per card.
  - Provides a `markSeen(taskId)` callback that writes every currently
    pending `approval_id` for that task into `seen_approvals` with
    `Date.now()`.
- `frontend/src/hooks/useTaskApprovalIndicator.ts`
  - Input: `taskId`.
  - Consumes `useTaskApprovalsIndex()`.
  - Returns `{ kind, seen, approvalIds, toolName } | null`.
  - `kind` picks the priority winner; `toolName` reflects that winner.
  - `seen` is true iff every `approval_id` for this task is present in
    `seen_approvals`.

The indicator icon is rendered inline in `TaskCard.tsx` (no separate
`TaskCardApprovalIcon` component). Keep it co-located until it grows past a
handful of lines.

### Changed (frontend)

- `frontend/src/components/tasks/TaskCard.tsx`
  - Call `useTaskApprovalIndicator(task.id)`.
  - When the hook returns non-null:
    - If `has_in_progress_attempt` is true, render the indicator icon
      *instead of* `Loader2`.
    - If `has_in_progress_attempt` is false, render the indicator icon on
      its own (an attempt may be paused between turns and still owe an
      answer).
  - On `handleClick` (which calls `onViewDetails`), also call
    `markSeen(task.id)` from `useTaskApprovalsIndex`.
  - Extend the `memo` comparator to depend on `kind` and `seen` (cheap
    string + boolean compare) so the card re-renders when these change.
- `frontend/src/components/tasks/TaskCardHeader.tsx`
  - No structural change.

### Changed (backend)

- `ApprovalInfo` Rust struct (in `crates/api-types` per repo layout):
  add `task_id: String` (TS-derived via ts-rs). Populate at every
  construction site for the WebSocket payload.
- Regenerate TS types: `pnpm run generate-types`.

### Untouched

- `useTaskNotifications.ts` keeps firing for all three current triggers,
  including `inreview`. (Future improvement, out of scope here: notification
  body could include task title — already possible once `task_id` is on
  `ApprovalInfo`. Noted, not done.)
- `useApprovals.ts` shape stays the same.
- `WorkspaceSummary`, `useExecutionProcesses`, `AskUserQuestionBanner.tsx`,
  the task detail view.

## Edge Cases and Failure Modes

- **Approval resolves while the card is mounted**: `pendingApprovals` drops
  the id, indicator returns null, icon disappears, spinner reappears if the
  attempt is still in progress. GC removes the id from `seen_approvals` on
  the same tick.
- **New approval arrives for a task the user just viewed**: `seen` is
  computed from the *current* set of pending approval ids. A brand-new id is
  not in `seen_approvals` yet, so `seen` flips back to false and the
  indicator pulses again. This is the desired behavior.
- **Task has multiple concurrent approvals (question + tool approval)**:
  priority order picks AskUserQuestion. Opening the task marks both as seen
  in one write.
- **Many tasks have pending approvals at once**: GC keeps `seen_approvals`
  bounded to the size of the live `pendingApprovals` stream. No unbounded
  growth.
- **localStorage unavailable / quota exceeded**: the hook should treat reads
  as empty and silently no-op on writes. Failure to persist "seen" downgrades
  the experience to "always treated as unseen", which is safe.
- **Spinner-vs-approval flapping**: if the attempt enters and exits pending
  approval quickly, the icon will flip. This is acceptable; the underlying
  state is genuinely changing. No debounce.
- **Card not currently mounted when approval arrives**: when the kanban
  re-renders with new approval state the card mounts with `seen=false` and
  pulses, same as if it were already mounted. No special handling.

## Out of Scope

- `inreview` does not get an icon (the column move is the signal).
- No card-level border or background highlight.
- No manual "mark as read" button.
- No cross-device sync of seen state.
- No change to `useTaskNotifications.ts` triggers or notification body
  formatting (despite the new `task_id` making richer notifications easy,
  this is a separate change).
- No change to `AskUserQuestionBanner.tsx` or to how the user answers.
- No other backend changes beyond adding `task_id` to `ApprovalInfo`.

## Testing

- Backend: a unit test for whatever service constructs `ApprovalInfo` to
  confirm `task_id` is populated correctly across the existing approval
  types.
- Unit test `useTaskApprovalsIndex` + `useTaskApprovalIndicator` together
  (or split) with a fake `useApprovals` source and a fake localStorage:
  - returns null when no approvals match the task
  - returns `kind: 'question'` for `is_question=true`
  - returns `kind: 'tool_approval'` for `is_question=false`
  - returns `kind: 'question'` when both are present (priority)
  - `seen=false` initially, `seen=true` after the hook's "mark seen" callback
  - flips `seen` back to false when a new approval id appears
  - GC removes stale ids on next pending update
  - degrades gracefully when localStorage throws
- Manual smoke on the kanban board:
  - Trigger an AskUserQuestion; confirm the orange `MessageCircleQuestion`
    pulses on the right task card and the spinner is gone.
  - Open the task; confirm the icon stops pulsing and dims to `brand/60`.
  - Answer the question; confirm the icon disappears and the spinner returns
    if the attempt keeps running.
  - Reload the page while the approval is still pending; the dim indicator
    should still be there.
