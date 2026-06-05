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

### 1. Core Architecture: One Process Per Session

**Principle**: A session in continuous mode uses ONE ExecutionProcess, ONE MsgStore, ONE LogProcessor, ONE EntryIndexProvider, and ONE DB persistence task for the entire session lifetime.

```
Session (continuous mode)
  └── ExecutionProcess (one, created on first message)
        ├── MsgStore (one, receives stdout + injected user_messages)
        ├── LogProcessor + EntryIndexProvider (one, shared, runs continuously)
        ├── DB persistence task (one, writes all entries to normalized_entries)
        ├── NormalizedEntryStore (one, for live WebSocket streaming)
        └── ActiveProcess (in-memory, holds protocol_peer + provider reference)
              ├── protocol_peer: ProtocolPeer
              ├── entry_index_provider: EntryIndexProvider (shared with LogProcessor)
              ├── execution_process_id: Uuid
              ├── last_active: Instant
              ├── cancel: CancellationToken
              ├── result_notify: Notify
              └── has_cron: AtomicBool
```

**Follow-up messages do NOT create new ExecutionProcesses.** Instead:
1. The user_message is injected into the existing MsgStore using the shared EntryIndexProvider
2. The agent's response flows through the existing LogProcessor → MsgStore → DB pipeline
3. A CodingAgentTurn is created per follow-up (for cost tracking), linked to the single ExecutionProcess

**Why one process**: The MsgStore is bound to the child process's stdout/stderr at spawn time. Creating a new ExecutionProcess creates a new MsgStore disconnected from the live stdout stream. By keeping one process, all entries flow through one pipeline with correct entry_index ordering.

### 2. EntryIndexProvider Sharing

**File**: `crates/executors/src/executors/utils/entry_index.rs`

`EntryIndexProvider` already uses `Arc<AtomicUsize>` internally (line 13), so it's naturally cloneable and thread-safe. The `next()` method uses `fetch_add(1, Relaxed)`.

**The fix**: Store the EntryIndexProvider in ActiveProcess so `send_to_active_process` can use the same provider as the LogProcessor.

```
start_execution_inner:
  1. Spawn child process
  2. Create MsgStore, attach stdout/stderr
  3. Call normalize_logs(sink, dir) → creates LogProcessor with EntryIndexProvider
  4. Capture the EntryIndexProvider
  5. Store it in ActiveProcess.entry_index_provider

send_to_active_process:
  1. Get active.entry_index_provider
  2. Call provider.next() → returns N (next available index)
  3. Create user_message NormalizedEntry
  4. Push ConversationPatch::add_normalized_entry(N, user_entry) to MsgStore
  5. Send message to agent via protocol_peer
  6. Agent responds → LogProcessor processes stdout → provider.next() returns N+1, N+2, ...
  7. user_message at index N, response at N+1, N+2, ... → correct ordering
```

**Thread safety**: `EntryIndexProvider.next()` is atomic. The user_message is pushed BEFORE `send_user_message` returns, so the provider advances before the agent's response entries are processed.

### 3. Session State & Process Lifecycle

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

### 4. ProtocolPeer Changes

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
    if self.keep_alive {
        // Notify upper layer that result is received, keep stdin open
        self.result_tx.notify_one();
    } else if !expect_stop_hook {
        self.close_stdin().await;  // oneshot mode
    }
}
```

**Stop hook handling**: In continuous mode, Stop hook still triggers (for commit), but `close_stdin()` is NOT called after responding.

### 5. `send_to_active_process` Design

**File**: `crates/local-deployment/src/container.rs`

```rust
async fn send_to_active_process(&self, session_id, prompt, ...) {
    let active = self.find_active_process(&session_id).await?;
    
    // 1. Update last_active
    *active.last_active.lock().await = Instant::now();
    
    // 2. Get the original MsgStore
    let msg_store = self.msg_stores.read().await
        .get(&active.execution_process_id).cloned()?;
    
    // 3. Use shared provider to get next index, inject user_message
    let index = active.entry_index_provider.next();
    let user_entry = NormalizedEntry {
        entry_type: NormalizedEntryType::UserMessage,
        content: prompt.to_string(),
        timestamp: None, metadata: None,
    };
    msg_store.push_patch(ConversationPatch::add_normalized_entry(index, user_entry));
    
    // 4. Create CodingAgentTurn for cost tracking
    CodingAgentTurn::create(&self.db.pool, &turn, ...).await?;
    
    // 5. Send message to agent
    active.protocol_peer.send_user_message(prompt).await?;
    
    // 6. Wait for result
    active.protocol_peer.wait_for_result().await;
    
    // 7. Return the original ExecutionProcess
    ExecutionProcess::find_by_id(&self.db.pool, active.execution_process_id).await
}
```

**Key**: No new ExecutionProcess, no new MsgStore, no new LogPipeline. The user_message flows through the same pipeline as the agent's response.

### 6. Exit Monitor

The exit monitor loops instead of exiting after one result:

```rust
loop {
    tokio::select! {
        _ = result_notify.notified() => {
            *last_active.lock().await = Instant::now();
            // Commit handled by caller; continue loop
        }
        _ = tokio::time::sleep(IDLE_TIMEOUT) => {
            if last_active.elapsed() > IDLE_TIMEOUT && !has_cron.load(Relaxed) {
                kill_process_group(); break;
            }
        }
        _ = cancel.cancelled() => { kill_process_group(); break; }
        exit_result = wait_for_exit() => { handle_exit(); break; }
    }
}
active_processes.write().await.remove(&session_id);
```

### 7. Auto-Resume

When a process exits unexpectedly:
1. Wait 2 seconds (avoid rapid loop)
2. Spawn new process with `--resume <session_id>`
3. New MsgStore + LogProcessor + EntryIndexProvider (starts from DB max index)
4. Update ActiveProcess
5. Track crash count: 3 crashes in 30s → stop auto-resume

### 8. Frontend Changes

**Conversation display**:
- First prompt: synthetic user_message from `executor_action.prompt` (unchanged)
- Follow-up prompts: real user_message entries from DB
- Remove user_message filter in `flattenEntriesForEmit` and `parseWithUserMessages`

**TOC (ProcessesTab)**:
- Change from ExecutionProcess list to CodingAgentTurn list
- Each turn shows one row (prompt preview, cost, status)
- Click to scroll to that turn in the conversation

**Input behavior**:
- Input always enabled (not disabled when process is running)
- Send directly to active process (no queue)
- Stop button stops the active session process

### 9. Stopping Conditions

| Trigger | Action |
|---------|--------|
| User clicks Stop | Send cancel signal → kill process group → mark Stopped |
| Idle timeout (15min, no cron) | Kill process group → mark Stopped |
| Task status (merge/cancel/done) | Send cancel signal → mark Stopped |
| Process crash | Mark Stopped → auto-resume if eligible |
| 3 crashes in 30s | Mark Stopped + error, no auto-resume |

### 10. Configuration

```json
{ "continuous": true }  // default: true
```

When `continuous: false`, behavior matches current oneshot mode.

### 11. has_cron Detection

- Parse MsgStore history for `CronCreate` tool calls → set `has_cron = true`
- Poll every 30 seconds via `tokio::time::interval`
- When `has_cron` is true, idle timeout is disabled

## Files to Modify

| File | Change |
|------|--------|
| `crates/executors/src/executors/claude/protocol.rs` | Keep-alive mode, result notification (already done) |
| `crates/executors/src/executors/claude.rs` | `continuous` field, pass `keep_alive` to ProtocolPeer (already done) |
| `crates/executors/src/executors/mod.rs` | `SpawnedChild.protocol_peer_rx`, `supports_continuous()` (already done) |
| `crates/local-deployment/src/container.rs` | **Major rewrite**: `send_to_active_process` uses shared EntryIndexProvider, no new ExecutionProcess. `ActiveProcess` holds `entry_index_provider`. |
| `crates/services/src/services/container.rs` | `SendToActiveResult::Sent` returns original EP (already done) |
| `crates/server/src/routes/sessions/mod.rs` | Follow-up checks active process first (already done) |
| `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts` | Remove user_message filter, keep synthetic for first prompt |
| `frontend/src/hooks/useConversationHistory/useConversationWindow.ts` | Remove user_message filter |
| `frontend/src/components/tasks/TaskDetails/ProcessesTab.tsx` | Change TOC from ExecutionProcess to CodingAgentTurn list |
| `frontend/src/components/tasks/TaskFollowUpSection.tsx` | Input always enabled (already done) |

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
