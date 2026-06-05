# Continuous Conversation Mode

**Date**: 2026-06-04
**Status**: Draft
**Scope**: Claude Code executor, architecture generic

## Problem

Current vibe-kanban spawns a new OS process for every user message (oneshot). Each message goes through:

1. `CodingAgentFollowUpRequest` → `spawn_follow_up()` → `claude -p --resume <session_id>`
2. Agent responds → `Result` message → ProtocolPeer closes stdin → process exits
3. `spawn_exit_monitor` runs post-completion logic (commit, finalize, queue)

This prevents:
- **In-process tools**: Claude Code's `CronCreate` creates jobs in process memory; they die when the process exits
- **Continuous dialogue**: Users must wait for process exit before sending the next message
- **Resource efficiency**: Each message pays the cost of spawning a new process and re-initializing the session

Verified via POC that Claude Code CLI fully supports multi-round conversation via stream-json protocol — the oneshot behavior is a vibe-kanban design choice, not a CLI limitation.

## Goals

1. Keep agent process alive between user messages (continuous conversation)
2. Support in-process tools (CronCreate, CronList, etc.) across message rounds
3. Auto-resume on process crash
4. Configurable mode (default: continuous, fallback: oneshot)
5. Per-round git commit preserved (Stop hook still triggers, just doesn't close stdin)

## Non-Goals

- Supporting other executors (Codex, OpenCode, MiMoCode) in this phase — architecture should be extensible but implementation is Claude Code only
- Changing the git commit strategy (remains per-round)
- Modifying the frontend conversation history display (only input behavior changes)

## Design

### 1. Session State & Process Lifecycle

Introduce `ActiveProcess` to hold a running process reference:

```
Session (DB) ──1:0..1──> ActiveProcess (in-memory)
                           ├── child: AsyncGroupChild
                           ├── protocol_peer: ProtocolPeer
                           ├── session_id: String (agent-native)
                           ├── last_active: Instant
                           ├── cancel: CancellationToken
                           ├── result_notify: Notify
                           └── has_cron: AtomicBool
```

**State machine:**

```
Idle ─[user message]─> Running ─[Result]─> Idle (process stays alive)
  │                      │
  │                      ├──[timeout/stop]──> Stopped
  │                      ├──[crash]────────> Stopped (auto-resume if eligible)
  │                      └──[task status]──> Stopped
```

- `Idle`: Process alive, waiting for next message (stdin open)
- `Running`: Processing a user message
- `Stopped`: Process exited, next follow-up requires `--resume`

### 2. ProtocolPeer Changes

**File**: `crates/executors/src/executors/claude/protocol.rs`

Current behavior:
```rust
Ok(CLIMessage::Result(_)) => {
    if !expect_stop_hook {
        self.close_stdin().await;  // causes process exit
    }
}
```

New behavior:
```rust
Ok(CLIMessage::Result(_)) => {
    if self.config.keep_alive {
        // Notify upper layer that result is received
        self.result_tx.send(()).ok();
    } else if !expect_stop_hook {
        self.close_stdin().await;  // oneshot mode
    }
}
```

**Stop hook handling**: In continuous mode, Stop hook still triggers (for commit), but `close_stdin()` is NOT called after responding. The `STOP_GIT_CHECK_CALLBACK_ID` branch skips stdin close when `keep_alive` is true.

**New method**: `send_user_message(content: String)` — writes a user message JSON to stdin.

### 3. ContainerService Changes

**File**: `crates/services/src/services/container.rs`, `crates/local-deployment/src/container.rs`

**New field** in `ContainerServiceInner`:
```rust
active_processes: Arc<RwLock<HashMap<Uuid, ActiveProcess>>>,
```

**Follow-up flow change**:

```
POST /api/sessions/{id}/follow-up
  → container.follow_up(session, prompt, ...)
  → check active_processes for session.id
    ├─ Found active process → send_user_message(prompt) via ProtocolPeer
    └─ Not found → spawn new process (--resume <session_id>)
```

**`send_user_message` path** (when active process exists):
1. Update `last_active` timestamp
2. Create `ExecutionProcess` DB record (for tracking)
3. Create `CodingAgentTurn` DB record
4. Call `protocol_peer.send_user_message(prompt)`
5. Wait for `result_notify` (or cancel/timeout)
6. On Result: execute commit, update `CodingAgentTurn` with session_id/cost
7. Return to Idle state

### 4. Exit Monitor Changes

**File**: `crates/local-deployment/src/container.rs` (`spawn_exit_monitor`)

Replace the current "wait for process exit" with a loop:

```rust
loop {
    tokio::select! {
        // Result received (round complete)
        _ = result_notify.notified() => {
            // Execute commit, update state
            // Reset last_active
            // Continue loop (wait for next message)
        }
        // Idle timeout (15 min, only when no cron)
        _ = tokio::time::sleep(IDLE_TIMEOUT) => {
            if last_active.elapsed() > IDLE_TIMEOUT
                && !has_cron.load(Ordering::Relaxed)
            {
                kill_process_group(&mut child).await;
                break;
            }
        }
        // User cancelled / task status changed
        _ = cancel.cancelled() => {
            kill_process_group(&mut child).await;
            break;
        }
        // Process exited on its own (crash or CLI decided to exit)
        exit_result = wait_for_exit(&mut child) => {
            handle_process_exit(exit_result, ...);
            break;
        }
    }
}
// Clean up active_processes entry
```

### 5. Auto-Resume Logic

When a process exits unexpectedly:

```rust
fn should_auto_resume(
    exit_code: Option<i32>,
    was_stopped: bool,
    has_queued_messages: bool,
    has_cron: bool,
) -> bool {
    if was_stopped { return false; }  // user-initiated stop
    if exit_code == Some(0) { return false; }  // normal exit
    if has_queued_messages || has_cron { return true; }  // pending work
    false
}
```

**Auto-resume flow**:
1. Wait 2 seconds (avoid rapid loop)
2. Spawn new process with `--resume <session_id>`
3. Update `active_processes` with new process
4. Track crash count in `ActiveProcess.crash_count: AtomicU32` and `last_crash: Mutex<Instant>`
5. If same session crashes 3 times in 30 seconds → stop auto-resume, mark session as `error`

### 6. Stopping Conditions

| Trigger | Action |
|---------|--------|
| User clicks Stop | Send cancel signal → kill process group → mark Stopped |
| Idle timeout (15min, no cron) | Kill process group → mark Stopped |
| Task status (merge/cancel/done) | Send cancel signal → mark Stopped |
| Process crash | Mark Stopped → auto-resume if eligible |
| 3 crashes in 30s | Mark Stopped + error, no auto-resume |

### 7. API Changes

| Endpoint | Change |
|----------|--------|
| `POST /api/sessions/{id}/follow-up` | Check active process first, send message directly if found |
| `POST /api/sessions/{id}/stop` (new) | Stop active process for session |
| `GET /api/sessions/{id}/process-status` (new) | Return `idle`/`running`/`stopped`, `has_cron`, `last_active` |

### 8. Frontend Changes

- **Input box**: Always enabled (not disabled when process is running)
- **Stop button**: Stops the active session process (not just current execution)
- **Process status indicator**: Show `idle` (green) / `running` (blue animated) / `stopped` (gray)
- **Queue system**: Messages queued while running are sent directly to active process stdin

### 9. Configuration

Executor profile config addition:

```json
{
  "continuous": true  // default: true
}
```

When `continuous: false`, behavior matches current oneshot mode (ProtocolPeer closes stdin after Result).

### 10. has_cron Detection

Track whether the agent has created cron jobs:

- Parse stdout for `CronCreate` tool calls → set `has_cron = true`
- Parse stdout for `CronDelete` / `CronList` showing empty → set `has_cron = false`
- Alternative: query the cron store directly

When `has_cron` is true, idle timeout is disabled (process stays alive until cron fires or user stops).

## Files to Modify

| File | Change |
|------|--------|
| `crates/executors/src/executors/claude/protocol.rs` | Keep-alive mode, `send_user_message()`, result notification |
| `crates/executors/src/executors/claude.rs` | Pass `keep_alive` config to ProtocolPeer |
| `crates/executors/src/executors/mod.rs` | `StandardCodingAgentExecutor` trait: add `send_message()` method |
| `crates/local-deployment/src/container.rs` | Active process management, exit monitor loop, auto-resume |
| `crates/services/src/services/container.rs` | `ContainerService` trait: add active process fields, follow-up logic |
| `crates/server/src/routes/sessions/mod.rs` | Follow-up API: check active process, new stop/status endpoints |
| `frontend/src/lib/api.ts` | New stop/status API calls |
| `frontend/src/hooks/useAttemptExecution.ts` | Handle continuous mode process status |
| `frontend/src/components/tasks/TaskFollowUpSection.tsx` | Input always enabled, status indicator |

## Risks

1. **Memory leaks**: Active processes must be cleaned up on all exit paths
2. **Zombie processes**: Process group kill must be reliable (verified via `command_group`)
3. **Race conditions**: Multiple follow-ups sent simultaneously to same session
4. **CLI compatibility**: `--input-format=stream-json` behavior may change across CLI versions
5. **Stdin buffering**: Large messages or rapid sends may cause partial reads

## Verification

- POC confirmed: Claude Code CLI supports 3+ rounds on same process with `-p` flag
- POC confirmed: `CronCreate` job survives across rounds
- POC confirmed: `--resume` mode supports multi-round with context preservation
