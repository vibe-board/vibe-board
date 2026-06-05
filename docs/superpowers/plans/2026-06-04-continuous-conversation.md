# Continuous Conversation Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Claude Code agent processes alive between user messages, enabling in-process tools (CronCreate) and continuous dialogue.

**Architecture:** ProtocolPeer gains a `keep_alive` mode that prevents stdin close after Result. ContainerService holds active process references in memory. Follow-up messages write directly to the running process's stdin instead of spawning a new process.

**Tech Stack:** Rust (tokio, serde_json), TypeScript (React, TanStack Query)

---

## File Map

| File | Responsibility |
|------|---------------|
| `crates/executors/src/executors/claude/protocol.rs` | ProtocolPeer: keep-alive mode, result notification |
| `crates/executors/src/executors/claude.rs` | ClaudeCode: pass keep_alive to ProtocolPeer, expose `send_user_message` |
| `crates/executors/src/executors/mod.rs` | `StandardCodingAgentExecutor` trait: add `supports_continuous()` and `send_message()` |
| `crates/local-deployment/src/container.rs` | ActiveProcess store, continuous exit monitor, auto-resume |
| `crates/services/src/services/container.rs` | `ContainerService` trait: add `send_to_active_process()`, `stop_session_process()`, `session_process_status()` |
| `crates/server/src/routes/sessions/mod.rs` | Follow-up API: check active process first, new stop/status endpoints |
| `frontend/src/lib/api.ts` | New `stopSession()` and `getSessionProcessStatus()` API calls |
| `frontend/src/hooks/useAttemptExecution.ts` | Use session process status for `isAttemptRunning` |
| `frontend/src/components/tasks/TaskFollowUpSection.tsx` | Input always enabled in continuous mode, status indicator |

---

### Task 1: ProtocolPeer Keep-Alive Mode

**Files:**
- Modify: `crates/executors/src/executors/claude/protocol.rs`

- [ ] **Step 1: Add keep_alive config and result notification to ProtocolPeer**

Add a `keep_alive` field and a `result_tx`/`result_rx` pair to `ProtocolPeer`:

```rust
use tokio::sync::{Notify, watch};

/// Handles bidirectional control protocol communication
#[derive(Clone)]
pub struct ProtocolPeer {
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    keep_alive: bool,
    result_tx: Arc<Notify>,
}
```

- [ ] **Step 2: Modify `spawn()` to accept `keep_alive` parameter**

```rust
pub fn spawn(
    stdin: ChildStdin,
    stdout: ChildStdout,
    client: Arc<ClaudeAgentClient>,
    cancel: CancellationToken,
    expect_stop_hook: bool,
    keep_alive: bool,
) -> Self {
    let result_tx = Arc::new(Notify::new());
    let peer = Self {
        stdin: Arc::new(Mutex::new(Some(stdin))),
        keep_alive,
        result_tx: result_tx.clone(),
    };
    // ... rest unchanged
    peer
}
```

- [ ] **Step 3: Modify `read_loop` to keep stdin open when keep_alive is true**

In `read_loop`, change the `CLIMessage::Result` handling:

```rust
Ok(CLIMessage::Result(_)) => {
    if self.keep_alive {
        // Notify upper layer that result is received, keep stdin open
        self.result_tx.notify_one();
    } else if !expect_stop_hook {
        self.close_stdin().await;
    }
}
```

- [ ] **Step 4: Modify Stop hook handling for keep_alive mode**

In `handle_control_request`, change the `STOP_GIT_CHECK_CALLBACK_ID` branch:

```rust
if callback_id == STOP_GIT_CHECK_CALLBACK_ID {
    if !self.keep_alive {
        self.close_stdin().await;
    }
    // In keep_alive mode, don't close stdin — the process stays alive
}
```

- [ ] **Step 5: Add `wait_for_result()` public method**

```rust
/// Wait for the next Result message from the agent.
/// Returns when a result is received or the peer is closed.
pub async fn wait_for_result(&self) {
    self.result_tx.notified().await;
}
```

- [ ] **Step 6: Verify `send_user_message()` already exists**

The existing `send_user_message()` method at line 222 already works. No changes needed.

- [ ] **Step 7: Run cargo check**

```bash
cargo check -p executors
```

Expected: compiles without errors.

- [ ] **Step 8: Commit**

```bash
git add crates/executors/src/executors/claude/protocol.rs
git commit -m "feat(executors): add keep_alive mode to ProtocolPeer"
```

---

### Task 2: ClaudeCode Executor Keep-Alive Integration

**Files:**
- Modify: `crates/executors/src/executors/claude.rs`
- Modify: `crates/executors/src/executors/mod.rs`

- [ ] **Step 1: Add `continuous` field to ClaudeCode struct**

In `crates/executors/src/executors/claude.rs`, add to the `ClaudeCode` struct (around line 104):

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS, JsonSchema)]
pub struct ClaudeCode {
    // ... existing fields
    #[serde(default)]
    pub continuous: Option<bool>,
}
```

- [ ] **Step 2: Pass `keep_alive` to ProtocolPeer in `spawn_internal`**

In `spawn_internal()` (around line 431), change the `ProtocolPeer::spawn` call:

```rust
let keep_alive = self.continuous.unwrap_or(true);
let protocol_peer = ProtocolPeer::spawn(
    child_stdin,
    child_stdout,
    client.clone(),
    cancel_for_task.clone(),
    commit_reminder,
    keep_alive,
);
```

- [ ] **Step 3: Store ProtocolPeer reference for external access**

The `spawn_internal` currently creates the ProtocolPeer inside a `tokio::spawn` block. We need to make it accessible. Add a return channel:

In `spawn_internal`, create a oneshot channel to pass the ProtocolPeer back:

```rust
let (peer_tx, peer_rx) = tokio::sync::oneshot::channel::<ProtocolPeer>();

tokio::spawn(async move {
    // ... existing setup ...
    let protocol_peer = ProtocolPeer::spawn(
        child_stdin,
        child_stdout,
        client.clone(),
        cancel_for_task.clone(),
        commit_reminder,
        keep_alive,
    );
    let _ = peer_tx.send(protocol_peer.clone());
    // ... rest of existing code ...
});
```

Change `SpawnedChild` to include the peer receiver:

In `crates/executors/src/executors/mod.rs`, add to `SpawnedChild`:

```rust
pub struct SpawnedChild {
    pub child: AsyncGroupChild,
    pub exit_signal: Option<ExecutorExitSignal>,
    pub cancel: Option<CancellationToken>,
    pub protocol_peer_rx: Option<tokio::sync::oneshot::Receiver<ProtocolPeer>>,
}
```

Update `spawn_internal` return:

```rust
Ok(SpawnedChild {
    child,
    exit_signal: None,
    cancel: Some(cancel),
    protocol_peer_rx: Some(peer_rx),
})
```

Update all other `SpawnedChild` constructions to add `protocol_peer_rx: None`.

- [ ] **Step 4: Add `supports_continuous()` and `send_message()` to trait**

In `crates/executors/src/executors/mod.rs`, add to `StandardCodingAgentExecutor`:

```rust
/// Whether this executor supports continuous conversation mode.
fn supports_continuous(&self) -> bool {
    false
}
```

- [ ] **Step 5: Implement `supports_continuous()` for ClaudeCode**

```rust
impl StandardCodingAgentExecutor for ClaudeCode {
    fn supports_continuous(&self) -> bool {
        self.continuous.unwrap_or(true)
    }
    // ... rest unchanged
}
```

- [ ] **Step 6: Run cargo check**

```bash
cargo check -p executors
```

Expected: compiles without errors.

- [ ] **Step 7: Commit**

```bash
git add crates/executors/src/executors/claude.rs crates/executors/src/executors/mod.rs
git commit -m "feat(executors): wire keep_alive through ClaudeCode executor"
```

---

### Task 3: ActiveProcess Store in ContainerService

**Files:**
- Modify: `crates/local-deployment/src/container.rs`

- [ ] **Step 1: Define ActiveProcess struct**

Add at the top of `container.rs`:

```rust
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use tokio::sync::Notify;
use tokio::time::Instant;

/// Represents a running agent process that can accept follow-up messages.
pub struct ActiveProcess {
    pub child: Arc<tokio::sync::RwLock<AsyncGroupChild>>,
    pub protocol_peer: executors::executors::claude::protocol::ProtocolPeer,
    pub session_id: String,
    pub last_active: Arc<tokio::sync::Mutex<Instant>>,
    pub cancel: CancellationToken,
    pub result_notify: Arc<Notify>,
    pub has_cron: Arc<AtomicBool>,
    pub crash_count: Arc<AtomicU32>,
    pub last_crash: Arc<tokio::sync::Mutex<Option<Instant>>>,
}
```

- [ ] **Step 2: Add active_processes field to LocalContainerService**

In the `LocalContainerService` struct, add:

```rust
pub active_processes: Arc<tokio::sync::RwLock<HashMap<Uuid, ActiveProcess>>>,
```

Initialize it in the constructor.

- [ ] **Step 3: Add helper methods for active process management**

```rust
impl LocalContainerService {
    /// Find an active process for a session.
    pub async fn find_active_process(&self, session_id: Uuid) -> Option<ActiveProcess> {
        let processes = self.active_processes.read().await;
        processes.get(&session_id).cloned()
    }

    /// Remove an active process.
    pub async fn remove_active_process(&self, session_id: Uuid) {
        let mut processes = self.active_processes.write().await;
        processes.remove(&session_id);
    }

    /// Insert an active process.
    pub async fn insert_active_process(&self, session_id: Uuid, process: ActiveProcess) {
        let mut processes = self.active_processes.write().await;
        processes.insert(session_id, process);
    }
}
```

- [ ] **Step 4: Run cargo check**

```bash
cargo check -p local-deployment
```

Expected: compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add crates/local-deployment/src/container.rs
git commit -m "feat(container): add ActiveProcess store to LocalContainerService"
```

---

### Task 4: Continuous Exit Monitor

**Files:**
- Modify: `crates/local-deployment/src/container.rs`

- [ ] **Step 1: Create `spawn_continuous_exit_monitor` method**

This is a new variant of `spawn_exit_monitor` that loops instead of exiting after one result:

```rust
const IDLE_TIMEOUT: Duration = Duration::from_secs(15 * 60); // 15 minutes
const CRASH_LOOP_THRESHOLD: u32 = 3;
const CRASH_LOOP_WINDOW: Duration = Duration::from_secs(30);

pub fn spawn_continuous_exit_monitor(
    &self,
    exec_id: &Uuid,
    session_id: Uuid,
    active_process: ActiveProcess,
) -> JoinHandle<()> {
    let exec_id = *exec_id;
    let container = self.clone();
    let active_processes = container.active_processes.clone();

    tokio::spawn(async move {
        let mut process_exit_rx = container.spawn_os_exit_watcher(exec_id);
        let cancel = active_process.cancel.clone();
        let result_notify = active_process.result_notify.clone();
        let last_active = active_process.last_active.clone();
        let has_cron = active_process.has_cron.clone();

        loop {
            tokio::select! {
                // Result received — round complete, continue loop
                _ = result_notify.notified() => {
                    *last_active.lock().await = Instant::now();
                    // Commit and update state handled by the caller
                    continue;
                }
                // Idle timeout
                _ = tokio::time::sleep(IDLE_TIMEOUT) => {
                    if last_active.lock().await.elapsed() > IDLE_TIMEOUT
                        && !has_cron.load(Ordering::Relaxed)
                    {
                        tracing::info!("Idle timeout for session {}", session_id);
                        // Kill the process group
                        if let Some(child_lock) = container.child_store.read().await.get(&exec_id) {
                            let mut child = child_lock.write().await;
                            let _ = command::kill_process_group(&mut child).await;
                        }
                        break;
                    }
                }
                // User cancelled
                _ = cancel.cancelled() => {
                    tracing::info!("Cancel signal for session {}", session_id);
                    if let Some(child_lock) = container.child_store.read().await.get(&exec_id) {
                        let mut child = child_lock.write().await;
                        let _ = command::kill_process_group(&mut child).await;
                    }
                    break;
                }
                // Process exited on its own
                exit_result = &mut process_exit_rx => {
                    tracing::info!("Process exited for session {:?}: {:?}", session_id, exit_result);
                    break;
                }
            }
        }

        // Clean up
        active_processes.write().await.remove(&session_id);
    })
}
```

- [ ] **Step 2: Run cargo check**

```bash
cargo check -p local-deployment
```

Expected: compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add crates/local-deployment/src/container.rs
git commit -m "feat(container): add continuous exit monitor with idle timeout"
```

---

### Task 5: ContainerService Trait Extension

**Files:**
- Modify: `crates/services/src/services/container.rs`

- [ ] **Step 1: Add new methods to ContainerService trait**

```rust
/// Result of attempting to send a message to an active process.
pub enum SendToActiveResult {
    /// Message sent to active process successfully.
    Sent(ExecutionProcess),
    /// No active process found, caller should spawn a new one.
    NotFound,
}

/// Status of a session's active process.
pub enum SessionProcessStatus {
    Idle,
    Running,
    Stopped,
}

#[async_trait]
pub trait ContainerService: Send + Sync + 'static {
    // ... existing methods ...

    /// Try to send a follow-up message to an already-running process for this session.
    /// Returns NotFound if no active process exists, in which case the caller
    /// should fall through to the normal spawn path.
    async fn send_to_active_process(
        &self,
        session_id: Uuid,
        prompt: &str,
        executor_profile_id: &ExecutorProfileId,
    ) -> Result<SendToActiveResult, ContainerError>;

    /// Stop the active process for a session.
    async fn stop_session_process(&self, session_id: Uuid) -> Result<(), ContainerError>;

    /// Get the status of a session's active process.
    async fn session_process_status(&self, session_id: Uuid) -> SessionProcessStatus;
}
```

- [ ] **Step 2: Add default implementations that return NotFound/Stopped**

```rust
// In a default impl block or as standalone defaults:
async fn send_to_active_process(
    &self,
    _session_id: Uuid,
    _prompt: &str,
    _executor_profile_id: &ExecutorProfileId,
) -> Result<SendToActiveResult, ContainerError> {
    Ok(SendToActiveResult::NotFound)
}

async fn stop_session_process(&self, _session_id: Uuid) -> Result<(), ContainerError> {
    Ok(())
}

async fn session_process_status(&self, _session_id: Uuid) -> SessionProcessStatus {
    SessionProcessStatus::Stopped
}
```

- [ ] **Step 3: Run cargo check**

```bash
cargo check -p services
```

Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add crates/services/src/services/container.rs
git commit -m "feat(services): add continuous conversation methods to ContainerService trait"
```

---

### Task 6: Implement `send_to_active_process` in LocalContainerService

**Files:**
- Modify: `crates/local-deployment/src/container.rs`

- [ ] **Step 1: Implement `send_to_active_process`**

```rust
async fn send_to_active_process(
    &self,
    session_id: Uuid,
    prompt: &str,
    executor_profile_id: &ExecutorProfileId,
) -> Result<SendToActiveResult, ContainerError> {
    let active = {
        let processes = self.active_processes.read().await;
        processes.get(&session_id).cloned()
    };

    let Some(active) = active else {
        return Ok(SendToActiveResult::NotFound);
    };

    // Create ExecutionProcess DB record
    let workspace = Workspace::find_by_session(&self.db.pool, session_id).await?;
    let execution_process = ExecutionProcess::create(
        &self.db.pool,
        session_id,
        ExecutionProcessRunReason::CodingAgent,
        // ... other fields
    ).await?;

    // Create CodingAgentTurn
    let turn = CodingAgentTurn::create(
        &self.db.pool,
        execution_process.id,
        prompt,
        &executor_profile_id.to_string(),
    ).await?;

    // Update last_active
    *active.last_active.lock().await = Instant::now();

    // Send message
    active.protocol_peer.send_user_message(prompt.to_string()).await
        .map_err(|e| ContainerError::Other(anyhow!("Failed to send message: {}", e)))?;

    // Wait for result
    active.protocol_peer.wait_for_result().await;

    // Aggregate cost
    let _ = CodingAgentTurn::aggregate_turn_cost(&self.db.pool, execution_process.id).await;

    Ok(SendToActiveResult::Sent(execution_process))
}
```

- [ ] **Step 2: Implement `stop_session_process`**

```rust
async fn stop_session_process(&self, session_id: Uuid) -> Result<(), ContainerError> {
    let active = {
        let mut processes = self.active_processes.write().await;
        processes.remove(&session_id)
    };

    if let Some(active) = active {
        active.cancel.cancel();
    }
    Ok(())
}
```

- [ ] **Step 3: Implement `session_process_status`**

```rust
async fn session_process_status(&self, session_id: Uuid) -> SessionProcessStatus {
    let processes = self.active_processes.read().await;
    if processes.contains_key(&session_id) {
        SessionProcessStatus::Idle // or Running, depending on state tracking
    } else {
        SessionProcessStatus::Stopped
    }
}
```

- [ ] **Step 4: Run cargo check**

```bash
cargo check -p local-deployment
```

Expected: compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add crates/local-deployment/src/container.rs
git commit -m "feat(container): implement send_to_active_process for continuous mode"
```

---

### Task 7: Wire Continuous Mode into Follow-up Flow

**Files:**
- Modify: `crates/local-deployment/src/container.rs`
- Modify: `crates/server/src/routes/sessions/mod.rs`

- [ ] **Step 1: Modify `start_execution` to register active process**

After spawning in `start_execution`, if the executor supports continuous mode and the spawned child has a `protocol_peer_rx`, register it as an active process:

```rust
// In start_execution, after spawn:
let keep_alive = executor_action.base_executor()
    .map(|e| e.supports_continuous())
    .unwrap_or(false);

if keep_alive {
    if let Some(peer_rx) = spawned.protocol_peer_rx {
        if let Ok(protocol_peer) = peer_rx.await {
            let active = ActiveProcess {
                child: spawned.child.clone(),
                protocol_peer,
                session_id: session.id,
                last_active: Arc::new(tokio::sync::Mutex::new(Instant::now())),
                cancel: spawned.cancel.clone().unwrap_or_else(|| CancellationToken::new()),
                result_notify: Arc::new(Notify::new()),
                has_cron: Arc::new(AtomicBool::new(false)),
                crash_count: Arc::new(AtomicU32::new(0)),
                last_crash: Arc::new(tokio::sync::Mutex::new(None)),
            };
            self.insert_active_process(session.id, active).await;
            // Use continuous exit monitor instead of the normal one
            self.spawn_continuous_exit_monitor(&execution_process.id, session.id, active.clone());
        }
    }
} else {
    // Normal exit monitor (existing behavior)
    self.spawn_exit_monitor(&execution_process.id, spawned.exit_signal);
}
```

- [ ] **Step 2: Modify follow_up route to check active process first**

In `crates/server/src/routes/sessions/mod.rs`, modify the `follow_up` function:

```rust
pub async fn follow_up(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateFollowUpAttempt>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess>>, ApiError> {
    let pool = &deployment.db().pool;

    // Try to send to active process first
    let result = deployment.container().send_to_active_process(
        session.id,
        &payload.prompt,
        &payload.executor_profile_id,
    ).await?;

    match result {
        SendToActiveResult::Sent(ep) => {
            // Clear draft scratch
            let _ = Scratch::delete(pool, session.id, &ScratchType::DraftFollowUp).await;
            return Ok(ResponseJson(ApiResponse::success(ep)));
        }
        SendToActiveResult::NotFound => {
            // Fall through to existing spawn logic
        }
    }

    // ... existing follow_up logic (workspace lookup, executor validation, etc.)
}
```

- [ ] **Step 3: Run cargo check**

```bash
cargo check -p server
```

Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add crates/local-deployment/src/container.rs crates/server/src/routes/sessions/mod.rs
git commit -m "feat: wire continuous mode into follow-up flow"
```

---

### Task 8: Add Stop and Status API Endpoints

**Files:**
- Modify: `crates/server/src/routes/sessions/mod.rs`

- [ ] **Step 1: Add stop endpoint handler**

```rust
pub async fn stop_session_process(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    deployment.container().stop_session_process(session.id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}
```

- [ ] **Step 2: Add process status endpoint handler**

```rust
#[derive(Serialize, TS)]
pub struct SessionProcessStatusResponse {
    pub status: String, // "idle" | "running" | "stopped"
}

pub async fn get_session_process_status(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<SessionProcessStatusResponse>>, ApiError> {
    let status = deployment.container().session_process_status(session.id).await;
    let status_str = match status {
        SessionProcessStatus::Idle => "idle",
        SessionProcessStatus::Running => "running",
        SessionProcessStatus::Stopped => "stopped",
    };
    Ok(ResponseJson(ApiResponse::success(SessionProcessStatusResponse {
        status: status_str.to_string(),
    })))
}
```

- [ ] **Step 3: Register routes**

In the session router setup:

```rust
let session_id_router = Router::new()
    .route("/", get(get_session))
    .route("/conversation-entries", get(get_conversation_entries))
    .route("/follow-up", post(follow_up))
    .route("/reset", post(reset_process))
    .route("/review", post(review::start_review))
    .route("/queue", queue::routes())
    .route("/stop", post(stop_session_process))       // NEW
    .route("/process-status", get(get_session_process_status));  // NEW
```

- [ ] **Step 4: Run cargo check**

```bash
cargo check -p server
```

Expected: compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/routes/sessions/mod.rs
git commit -m "feat(server): add session stop and process-status API endpoints"
```

---

### Task 9: Frontend API Integration

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add stop and status API calls**

In the `_sessionsApi` object, add:

```typescript
stopProcess: (sessionId: string) =>
  makeReq<ApiResponse<null>>(`/api/sessions/${sessionId}/stop`, {
    method: 'POST',
  }),

getProcessStatus: (sessionId: string) =>
  makeReq<ApiResponse<{ status: 'idle' | 'running' | 'stopped' }>>(
    `/api/sessions/${sessionId}/process-status`
  ),
```

- [ ] **Step 2: Run frontend type check**

```bash
cd frontend && pnpm run check
```

Expected: compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(frontend): add session stop and process-status API calls"
```

---

### Task 10: Frontend Input Always Enabled

**Files:**
- Modify: `frontend/src/components/tasks/TaskFollowUpSection.tsx`

- [ ] **Step 1: Remove disable-on-running logic for continuous mode**

Find where the input is disabled when `isAttemptRunning` is true. In continuous mode, the input should stay enabled.

The key change: when `isAttemptRunning` is true AND the session has an active process, the send button should send directly (not queue). The `useSessionSend` hook's `send()` function already calls `sessionsApi.followUp()` — the backend will handle routing to the active process.

- [ ] **Step 2: Add process status indicator**

Add a small status dot near the session name or input area:

```typescript
const { data: processStatus } = useQuery({
  queryKey: ['sessionProcessStatus', sessionId],
  queryFn: () => sessionsApi.getProcessStatus(sessionId!),
  enabled: !!sessionId,
  refetchInterval: 5000,
});
```

Show a colored dot based on `processStatus.data.status`:
- `idle`: green dot
- `running`: blue animated dot
- `stopped`: gray dot

- [ ] **Step 3: Update stop button to use session stop**

When the session has an active process, the stop button should call `sessionsApi.stopProcess(sessionId)` instead of `attemptsApi.stop(attemptId)`.

- [ ] **Step 4: Run frontend checks**

```bash
cd frontend && pnpm run check && pnpm run lint
```

Expected: passes without errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/tasks/TaskFollowUpSection.tsx
git commit -m "feat(frontend): keep input enabled in continuous mode, add status indicator"
```

---

### Task 11: has_cron Detection

**Files:**
- Modify: `crates/local-deployment/src/container.rs`

The exit monitor needs to know if the agent created cron jobs so it can skip idle timeout.

- [ ] **Step 1: Add cron detection to the log processing pipeline**

In the continuous exit monitor, listen for normalized entries that indicate cron tool use. The normalized entries are already processed by `normalize_logs`. We need to scan them for cron-related tool calls.

Add a helper to detect cron tool usage from the entry stream:

```rust
/// Check if a normalized entry indicates a CronCreate or CronDelete tool call.
fn entry_indicates_cron(entry: &NormalizedEntry) -> bool {
    if entry.entry_type != NormalizedEntryType::ToolUse {
        return false;
    }
    let name = entry.tool_name.as_deref().unwrap_or("");
    matches!(name, "CronCreate" | "CronDelete" | "CronList")
}
```

- [ ] **Step 2: Wire cron detection into the continuous exit monitor**

In `spawn_continuous_exit_monitor`, add a branch that watches for cron-related entries from the message store. When a `CronCreate` is seen, set `has_cron = true`. When `CronDelete` is seen and no cron jobs remain, set `has_cron = false`.

```rust
// In the select! loop, add a branch watching for new normalized entries
entries = watch_for_new_entries(&msg_store, exec_id) => {
    for entry in entries {
        if entry_indicates_cron(&entry) {
            let name = entry.tool_name.as_deref().unwrap_or("");
            if name == "CronCreate" {
                has_cron.store(true, Ordering::Relaxed);
            }
            // CronDelete detection would need to query the cron store
        }
    }
}
```

- [ ] **Step 3: Run cargo check**

```bash
cargo check -p local-deployment
```

Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add crates/local-deployment/src/container.rs
git commit -m "feat(container): detect CronCreate tool calls to manage idle timeout"
```

---

### Task 12: Integration Test — Multi-Round Conversation

**Files:**
- Create: `crates/local-deployment/tests/continuous_tests.rs`

- [ ] **Step 1: Write integration test for multi-round conversation**

```rust
#[cfg(test)]
mod continuous_tests {
    use super::*;

    #[tokio::test]
    async fn test_send_message_to_active_process() {
        // Setup: create a mock active process with a ProtocolPeer
        // Send two messages
        // Verify both get results
        // Verify process stays alive
    }

    #[tokio::test]
    async fn test_idle_timeout_stops_process() {
        // Setup: create active process with short timeout
        // Wait for timeout
        // Verify process is removed from active_processes
    }

    #[tokio::test]
    async fn test_cancel_stops_process() {
        // Setup: create active process
        // Send cancel
        // Verify process is removed
    }
}
```

- [ ] **Step 2: Run the test**

```bash
cargo test -p local-deployment continuous_tests
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add crates/local-deployment/src/container_continuous_test.rs
git commit -m "test: add integration tests for continuous conversation mode"
```

---

### Task 12: End-to-End Verification

- [ ] **Step 1: Run all Rust tests**

```bash
cargo test --workspace
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend checks**

```bash
cd frontend && pnpm run check && pnpm run lint
```

Expected: passes.

- [ ] **Step 3: Manual verification**

Start the dev server:
```bash
pnpm run dev
```

1. Create a new task with Claude Code executor
2. Send first message — verify process starts and stays alive after response
3. Send second message — verify it goes to the same process (check logs for "Sending to active process")
4. Wait 15 minutes (or set shorter timeout for testing) — verify process exits on idle timeout
5. Send another message — verify it spawns a new process with `--resume`
6. Test CronCreate — create a cron job, verify it survives to next message
7. Test stop button — verify it kills the active process

- [ ] **Step 4: Final commit with any fixes**

```bash
git add -A
git commit -m "feat: continuous conversation mode for Claude Code"
```
