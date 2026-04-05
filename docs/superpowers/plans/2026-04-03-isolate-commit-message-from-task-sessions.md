# Isolate Commit-Message Agent from Task Sessions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple commit-message agent execution from the workspace→session→execution_process hierarchy so it never affects task-level fields (executor, has_in_progress_attempt) or session ordering.

**Architecture:** Store commit-message conversation directly in the `merges` table instead of creating a session + execution_process. The agent subprocess is spawned inline, its stdout piped through MsgStore + normalizer in-memory, and the resulting normalized entries serialized to JSON in the merge record.

**Tech Stack:** Rust (SQLx, tokio), SQLite migrations

---

### Task 1: Add `task_id` and `commit_message_conversation` to merges table

**Files:**
- Create: `crates/db/migrations/20260403000000_add_merge_task_id_and_conversation.sql`
- Modify: `crates/db/src/models/merge.rs:26-34` (DirectMerge struct)
- Modify: `crates/db/src/models/merge.rs:37-45` (PrMerge struct)
- Modify: `crates/db/src/models/merge.rs:88-127` (create_direct function)

- [ ] **Step 1: Create the migration file**

```sql
-- crates/db/migrations/20260403000000_add_merge_task_id_and_conversation.sql

-- Weak association: find merges by task without going through workspace
ALTER TABLE merges ADD COLUMN task_id BLOB REFERENCES tasks(id);

-- JSON text storing normalized entries from commit-message agent run
ALTER TABLE merges ADD COLUMN commit_message_conversation TEXT;

-- Index for future "find merges by task" queries
CREATE INDEX idx_merges_task_id ON merges(task_id);

-- Backfill task_id from existing data
UPDATE merges SET task_id = (
    SELECT w.task_id FROM workspaces w WHERE w.id = merges.workspace_id
);
```

- [ ] **Step 2: Add fields to DirectMerge and PrMerge structs**

In `crates/db/src/models/merge.rs`, add to `DirectMerge` (after `created_at`):

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct DirectMerge {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub repo_id: Uuid,
    pub merge_commit: String,
    pub target_branch_name: String,
    pub created_at: DateTime<Utc>,
    pub task_id: Option<Uuid>,
    pub commit_message_conversation: Option<String>,
}
```

Add same two fields to `PrMerge` (after `pr_info`):

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PrMerge {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub repo_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub target_branch_name: String,
    pub pr_info: PullRequestInfo,
    pub task_id: Option<Uuid>,
    pub commit_message_conversation: Option<String>,
}
```

- [ ] **Step 3: Update all SQLx queries that SELECT from merges**

Every `sqlx::query_as!` that returns `DirectMerge` or `PrMerge` needs to include the new columns. Search for all queries in `merge.rs` that `SELECT ... FROM merges` and add `task_id`, `commit_message_conversation` to each SELECT list. The query_as! macro will fail at compile time if columns are missing, so `cargo check --package db` will catch any you miss.

- [ ] **Step 4: Update `Merge::create_direct` to accept new parameters**

```rust
pub async fn create_direct(
    pool: &SqlitePool,
    workspace_id: Uuid,
    repo_id: Uuid,
    target_branch_name: &str,
    merge_commit: &str,
    task_id: Uuid,
    commit_message_conversation: Option<&str>,
) -> Result<DirectMerge, sqlx::Error> {
```

Update the INSERT query to include the new columns:

```sql
INSERT INTO merges (id, workspace_id, repo_id, merge_type, merge_commit, target_branch_name, created_at, task_id, commit_message_conversation)
VALUES ($1, $2, $3, 'direct', $4, $5, $6, $7, $8)
```

And bind the two new parameters.

- [ ] **Step 5: Update all callers of `Merge::create_direct`**

Search the codebase for `Merge::create_direct` calls. Update each to pass `task_id` and `commit_message_conversation`. For now, pass `None` for `commit_message_conversation` — it will be wired up in Task 3.

The main caller is in `crates/server/src/routes/task_attempts.rs` at the `merge_task_attempt` handler (~line 878). The `task` variable is already in scope there, so pass `task.id`.

- [ ] **Step 6: Run prepare-db and verify compilation**

```bash
pnpm run prepare-db && cargo check --workspace
```

- [ ] **Step 7: Regenerate TypeScript types**

```bash
pnpm run generate-types
```

Verify `shared/types.ts` now includes `task_id` and `commit_message_conversation` on `DirectMerge` and `PrMerge`.

- [ ] **Step 8: Commit**

```bash
git add crates/db/migrations/20260403000000_add_merge_task_id_and_conversation.sql \
  crates/db/src/models/merge.rs \
  crates/db/.sqlx/ \
  crates/server/src/routes/task_attempts.rs \
  shared/types.ts
git commit -m "feat(merges): add task_id and commit_message_conversation columns"
```

---

### Task 2: Remove `commitmessage` from task status calculation

**Files:**
- Modify: `crates/services/src/services/events.rs:88-94`

- [ ] **Step 1: Remove `commitmessage` from has_in_progress query**

In `crates/services/src/services/events.rs`, function `update_task_attempt_status` (~line 88-94), change:

```rust
// Before
"SELECT COUNT(*) FROM workspaces w
 JOIN sessions s ON s.workspace_id = w.id
 JOIN execution_processes ep ON ep.session_id = s.id
 WHERE w.task_id = $1 AND ep.status = 'running'
   AND ep.run_reason IN ('setupscript','cleanupscript','codingagent','commitmessage')
 LIMIT 1",
```

to:

```rust
// After
"SELECT COUNT(*) FROM workspaces w
 JOIN sessions s ON s.workspace_id = w.id
 JOIN execution_processes ep ON ep.session_id = s.id
 WHERE w.task_id = $1 AND ep.status = 'running'
   AND ep.run_reason IN ('setupscript','cleanupscript','codingagent')
 LIMIT 1",
```

- [ ] **Step 2: Run prepare-db and verify compilation**

```bash
pnpm run prepare-db && cargo check --workspace
```

- [ ] **Step 3: Commit**

```bash
git add crates/services/src/services/events.rs crates/db/.sqlx/
git commit -m "fix(sessions): exclude commitmessage from task has_in_progress calculation"
```

---

### Task 3: Rewrite `generate_commit_message_via_agent` to run inline

This is the core task. The function currently creates a Session, ExecutionProcess, CodingAgentTurn, spawns via `container.start_execution`, polls for completion, and reads the summary from CodingAgentTurn. The new version spawns the agent subprocess directly, collects output via an ephemeral MsgStore, normalizes in-memory, and returns both the commit message and the conversation JSON.

**Files:**
- Modify: `crates/server/src/routes/task_attempts.rs:500-629` (rewrite function)
- Modify: `crates/server/src/routes/task_attempts.rs:810-868` (update caller)
- Modify: `crates/local-deployment/src/container.rs` (add `run_commit_message_agent` method)

- [ ] **Step 1: Add `run_commit_message_agent` to LocalContainerService**

This method handles subprocess spawning, MsgStore wiring, normalization, and entry collection without touching the DB. Add it to `crates/local-deployment/src/container.rs`:

```rust
/// Run a coding agent inline for commit message generation.
/// Returns (last_assistant_message, normalized_entries_json) without creating
/// any DB records (no Session, no ExecutionProcess, no CodingAgentTurn).
pub async fn run_commit_message_agent(
    &self,
    executor_profile_id: &ExecutorProfileId,
    prompt: &str,
    working_dir: &Path,
) -> Option<(String, String)> {
    use std::time::Duration;
    use futures::StreamExt;
    use tokio_stream::wrappers::BroadcastStream;

    // 1. Resolve executor
    let executor = ExecutorConfigs::get_cached()
        .get_coding_agent(executor_profile_id)?;

    // 2. Build minimal ExecutionEnv (no VB_* env vars needed for commit messages)
    let repo_context = RepoContext::new(working_dir.to_path_buf(), vec![]);
    let env = ExecutionEnv::new(repo_context, false, String::new());

    // 3. Spawn subprocess with 30s start timeout
    let approvals: Arc<dyn ExecutorApprovalService> =
        Arc::new(NoopExecutorApprovalService {});
    let mut spawned = tokio::time::timeout(
        Duration::from_secs(30),
        executor.spawn(working_dir, prompt, &env),
    )
    .await
    .ok()?
    .ok()?;

    // 4. Create ephemeral MsgStore, wire stdout/stderr
    let msg_store = Arc::new(MsgStore::new());
    {
        let out = spawned.child.inner().stdout.take().expect("no stdout");
        let err = spawned.child.inner().stderr.take().expect("no stderr");
        let out = tokio_stream::StreamExt::map(
            tokio_util::io::ReaderStream::new(out),
            |r| r.map(|chunk| LogMsg::Stdout(String::from_utf8_lossy(&chunk).into_owned())),
        );
        let err = tokio_stream::StreamExt::map(
            tokio_util::io::ReaderStream::new(err),
            |r| r.map(|chunk| LogMsg::Stderr(String::from_utf8_lossy(&chunk).into_owned())),
        );
        let merged = futures::stream::select(out, err);
        msg_store.clone().spawn_forwarder(merged);
    }

    // 5. Start normalizer (background tasks that push JsonPatch into msg_store)
    executor.normalize_logs(msg_store.clone(), working_dir);

    // 6. Wait for process completion with 90s timeout
    const TIMEOUT: Duration = Duration::from_secs(90);
    let exit_status = tokio::time::timeout(TIMEOUT, spawned.child.wait()).await;

    let timed_out = exit_status.is_err();
    if timed_out {
        // Kill the process on timeout
        let _ = command::kill_process_group(&mut spawned.child).await;
    }

    // 7. Signal finished so normalizer tasks complete
    msg_store.push_finished();

    // Brief delay to let normalizer process remaining entries
    tokio::time::sleep(Duration::from_millis(500)).await;

    if timed_out {
        return None;
    }

    // 8. Collect normalized entries and last assistant message from MsgStore
    let history = msg_store.get_history();
    let mut entries: Vec<NormalizedEntry> = Vec::new();
    let mut last_assistant_message: Option<String> = None;

    for msg in &history {
        if let LogMsg::JsonPatch(patch) = msg {
            if let Some((_index, entry)) = extract_normalized_entry_from_patch(patch) {
                if matches!(entry.entry_type, NormalizedEntryType::AssistantMessage) {
                    let content = entry.content.trim();
                    if !content.is_empty() {
                        last_assistant_message = Some(content.to_string());
                    }
                }
                entries.push(entry);
            }
        }
    }

    let assistant_msg = last_assistant_message?;
    let entries_json = serde_json::to_string(&entries).unwrap_or_default();

    Some((assistant_msg, entries_json))
}
```

Add the necessary imports at the top of the file. Key imports needed:
- `executors::logs::NormalizedEntry` and `NormalizedEntryType`
- `executors::logs::utils::patch::extract_normalized_entry_from_patch`
- `executors::approvals::NoopExecutorApprovalService`
- `executors::profile::{ExecutorConfigs, ExecutorProfileId}`
- `executors::env::{ExecutionEnv, RepoContext}`
- `utils::log_msg::LogMsg`
- `utils::msg_store::MsgStore`

- [ ] **Step 2: Add `run_commit_message_agent` to the ContainerService trait**

In `crates/services/src/services/container.rs`, add the method signature to the trait (near the other public methods):

```rust
async fn run_commit_message_agent(
    &self,
    executor_profile_id: &ExecutorProfileId,
    prompt: &str,
    working_dir: &Path,
) -> Option<(String, String)>;
```

- [ ] **Step 3: Rewrite `generate_commit_message_via_agent` in task_attempts.rs**

Replace the entire function body (lines 500-629) with:

```rust
async fn generate_commit_message_via_agent(
    deployment: &DeploymentImpl,
    workspace: &Workspace,
    executor_profile_id: &ExecutorProfileId,
    current_branch: &str,
    target_branch: &str,
    prompt: &str,
) -> Option<(String, String)> {
    let working_dir = workspace
        .agent_working_dir
        .as_ref()
        .filter(|d| !d.is_empty())
        .map(|d| {
            PathBuf::from(
                workspace.container_ref.as_deref().unwrap_or_default(),
            )
            .join(d)
        })
        .or_else(|| {
            workspace
                .container_ref
                .as_ref()
                .map(PathBuf::from)
        })?;

    let prompt = prompt
        .replace("{current_branch}", current_branch)
        .replace("{target_branch}", target_branch);

    let (assistant_msg, entries_json) = deployment
        .container()
        .run_commit_message_agent(executor_profile_id, &prompt, &working_dir)
        .await?;

    // Extract commit message from agent response (same logic as before)
    let raw = extract_commit_message_from_agent_response(&assistant_msg);
    let raw = raw.trim();
    let lines: Vec<&str> = raw
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();
    let subject = lines.first().map(|s| (*s).to_string()).unwrap_or_default();
    if subject.is_empty() {
        return None;
    }
    let message = if lines.len() <= 1 {
        subject
    } else {
        let body = lines[1..].join("\n");
        format!("{}\n\n{}", subject, body)
    };
    Some((message, entries_json))
}
```

Note: the return type changed from `Option<String>` to `Option<(String, String)>`.

- [ ] **Step 4: Update the caller in `merge_task_attempt`**

In `merge_task_attempt` (~lines 810-868), update the commit message generation block. Currently:

```rust
let commit_message = if request.commit_message_enabled {
    // ...
    generate_commit_message_via_agent(...)
        .await
        .unwrap_or_else(|| legacy_commit_message(&task))
} else {
    legacy_commit_message(&task)
};
```

Change to capture both message and conversation:

```rust
let (commit_message, commit_message_conversation) = if request.commit_message_enabled {
    if let Some(msg) = single_commit_message {
        (msg, None)
    } else {
        match generate_commit_message_via_agent(
            &deployment,
            &workspace,
            commit_message_profile,
            &workspace.branch,
            &workspace_repo.target_branch,
            &commit_message_prompt,
        )
        .await
        {
            Some((msg, entries_json)) => (msg, Some(entries_json)),
            None => (legacy_commit_message(&task), None),
        }
    }
} else {
    (legacy_commit_message(&task), None)
};
```

Then pass `commit_message_conversation.as_deref()` to `Merge::create_direct`:

```rust
Merge::create_direct(
    pool,
    workspace.id,
    workspace_repo.repo_id,
    &workspace_repo.target_branch,
    &merge_commit_id,
    task.id,
    commit_message_conversation.as_deref(),
)
.await?;
```

- [ ] **Step 5: Verify compilation**

```bash
cargo check --workspace
```

- [ ] **Step 6: Commit**

```bash
git add crates/local-deployment/src/container.rs \
  crates/services/src/services/container.rs \
  crates/server/src/routes/task_attempts.rs
git commit -m "feat(merge): run commit-message agent inline without session/execution_process"
```

---

### Task 4: Clean up old commit-message session creation code

After Task 3, the old `Session::create` and `container.start_execution` paths for commit messages are dead code. Clean up references.

**Files:**
- Modify: `crates/server/src/routes/task_attempts.rs` (remove old imports if unused)

- [ ] **Step 1: Remove unused imports**

Check `task_attempts.rs` for imports that were only used by the old `generate_commit_message_via_agent`:
- `CreateSession` (if no longer used elsewhere in the file)
- `ExecutionProcessRunReason::CommitMessage` (may still be referenced in tests or elsewhere — check with grep)
- `CodingAgentTurn` (if no longer used elsewhere)

Only remove imports that have zero remaining uses in the file. Use `cargo check` to validate.

- [ ] **Step 2: Verify no other code creates CommitMessage execution processes**

```bash
# Search for any remaining CommitMessage creation paths
```

Search for `CommitMessage` in `crates/` to verify there are no other code paths that create CommitMessage execution processes (other than the enum definition and DB migration).

- [ ] **Step 3: Verify compilation and run tests**

```bash
cargo check --workspace && cargo test --workspace
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove dead code from old commit-message session path"
```

---

### Task 5: Run prepare-db, generate types, and final verification

**Files:**
- Modify: `crates/db/.sqlx/` (updated query cache)
- Modify: `shared/types.ts` (regenerated)

- [ ] **Step 1: Prepare SQLx offline data**

```bash
pnpm run prepare-db
```

- [ ] **Step 2: Regenerate TypeScript types**

```bash
pnpm run generate-types
```

- [ ] **Step 3: Run full test suite**

```bash
cargo test --workspace
```

- [ ] **Step 4: Run frontend checks**

```bash
pnpm run check && pnpm run lint
```

- [ ] **Step 5: Commit any remaining changes**

```bash
git add crates/db/.sqlx/ shared/types.ts
git commit -m "chore: update sqlx cache and regenerate types"
```
