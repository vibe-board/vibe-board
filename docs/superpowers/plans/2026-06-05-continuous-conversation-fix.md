# Continuous Conversation Fix: Shared EntryIndexProvider

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix entry_index collision in continuous conversation mode by sharing a single EntryIndexProvider between the LogProcessor and follow-up message injection.

**Architecture:** One session = one ExecutionProcess = one MsgStore = one EntryIndexProvider. The provider is created in `start_execution_inner`, passed to `normalize_logs` (via updated trait signature), and stored in `ActiveProcess` for follow-up injection.

**Tech Stack:** Rust (tokio, serde_json), TypeScript (React)

---

## File Map

| File | Change |
|------|--------|
| `crates/executors/src/executors/mod.rs` | `normalize_logs` trait: add `entry_index_provider` parameter |
| `crates/executors/src/executors/claude.rs` | Use passed-in provider instead of creating one |
| `crates/executors/src/executors/*.rs` | ~30 executors: accept provider param (mechanical) |
| `crates/local-deployment/src/container.rs` | `ActiveProcess` + `entry_index_provider` field; `start_execution_inner` creates provider; `send_to_active_process` uses shared provider |
| `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts` | Remove user_message filter |
| `frontend/src/hooks/useConversationHistory/useConversationWindow.ts` | Remove user_message filter |

---

### Task 1: Change `normalize_logs` Trait Signature

**Files:**
- Modify: `crates/executors/src/executors/mod.rs`

- [ ] **Step 1: Update trait definition**

Change the `normalize_logs` method signature to accept an `EntryIndexProvider`:

```rust
fn normalize_logs(
    &self,
    _sink: std::sync::Arc<dyn crate::logs::utils::ConversationSink>,
    _worktree_path: &Path,
    _entry_index_provider: crate::executors::logs::utils::entry_index::EntryIndexProvider,
);
```

- [ ] **Step 2: Run cargo check to see all compilation errors**

```bash
cargo check -p executors 2>&1 | grep "fn normalize_logs" | head -5
```

Expected: errors in every executor that implements the trait.

- [ ] **Step 3: Commit**

```bash
git add crates/executors/src/executors/mod.rs
git commit -m "refactor(executors): add entry_index_provider param to normalize_logs trait"
```

---

### Task 2: Update All Executor Implementations (Mechanical)

**Files:**
- Modify: All `crates/executors/src/executors/*.rs` files that implement `normalize_logs`

This is a mechanical change: add the `_entry_index_provider: EntryIndexProvider` parameter to each implementation. For most executors, the parameter is unused (prefixed with `_`).

- [ ] **Step 1: Find all files implementing normalize_logs**

```bash
grep -l "fn normalize_logs" crates/executors/src/executors/*.rs
```

- [ ] **Step 2: For each file, add the parameter**

For executors that delegate to a standalone function (like codex, mimo_code, opencode), also update the standalone function signature.

For executors that create their own `EntryIndexProvider::start_from(sink)`:
- Remove the `EntryIndexProvider::start_from` call
- Use the passed-in provider instead

For executors that don't create an EntryIndexProvider (e.g., they call a standalone function that does):
- Add `_entry_index_provider: EntryIndexProvider` to the trait impl
- Pass it to the standalone function if needed, or ignore it

**Key executors to update:**

1. `claude.rs` - creates its own provider at line 303. Change to use passed-in provider.
2. `codex.rs` - delegates to `normalize_logs(msg_store, worktree_path)`. Update standalone function.
3. `mimo_code.rs` - delegates to `normalize_logs_with_api`. Update standalone function.
4. `opencode.rs` - delegates to standalone. Update standalone function.
5. `amp.rs` - check if it creates its own provider.
6. `copilot.rs` - check if it creates its own provider.
7. All others (`deepagents.rs`, `qa_mock.rs`, `qwen.rs`, `auggie.rs`, `crow_cli.rs`, `gemini.rs`, `autohand.rs`, `mistral_vibe.rs`, `junie.rs`, `kilo.rs`, `minion_code.rs`, `goose.rs`, `qoder.rs`, `dimcode.rs`, `nova.rs`, `cline.rs`, `pi_acp.rs`, `kimi.rs`, `stakpak.rs`, `cursor.rs`, `corust_agent.rs`, `fast_agent.rs`, `droid.rs`, `codebuddy_code.rs`) - add unused parameter.

For each file:
```rust
// Before:
fn normalize_logs(&self, msg_store: Arc<dyn ConversationSink>, worktree_path: &Path) {

// After:
fn normalize_logs(
    &self,
    msg_store: Arc<dyn ConversationSink>,
    worktree_path: &Path,
    _entry_index_provider: EntryIndexProvider,
) {
```

For executors that create their own provider internally, also update to use the passed-in one.

- [ ] **Step 3: Run cargo check**

```bash
cargo check -p executors
```

Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add crates/executors/
git commit -m "refactor(executors): update all normalize_logs implementations"
```

---

### Task 3: Update `start_execution_inner` to Create and Store Provider

**Files:**
- Modify: `crates/local-deployment/src/container.rs`

- [ ] **Step 1: Add `entry_index_provider` field to `ActiveProcess`**

```rust
pub struct ActiveProcess {
    pub protocol_peer: ProtocolPeer,
    pub session_id: Uuid,
    pub execution_process_id: Uuid,
    pub entry_index_provider: executors::executors::logs::utils::entry_index::EntryIndexProvider,
    pub last_active: Arc<tokio::sync::Mutex<tokio::time::Instant>>,
    pub cancel: CancellationToken,
    pub result_notify: Arc<tokio::sync::Notify>,
    pub has_cron: Arc<AtomicBool>,
    pub crash_count: Arc<AtomicU32>,
    pub last_crash: Arc<tokio::sync::Mutex<Option<tokio::time::Instant>>>,
}
```

- [ ] **Step 2: In `start_execution_inner`, create the provider before calling `normalize_logs`**

Find where `normalize_logs` is called (around line 1402 in `start_execution` in the ContainerService impl). Before the call, create the provider:

```rust
use executors::executors::logs::utils::entry_index::EntryIndexProvider;

// Create shared EntryIndexProvider
let entry_index_provider = EntryIndexProvider::start_from(msg_store.as_ref());

// Call normalize_logs with the provider
executor.normalize_logs(sink, &working_dir, entry_index_provider.clone());
```

- [ ] **Step 3: Store provider in ActiveProcess**

In the ActiveProcess creation block (around line 1718), add the provider:

```rust
let active = ActiveProcess {
    protocol_peer,
    session_id: execution_process.session_id,
    execution_process_id: execution_process.id,
    entry_index_provider: entry_index_provider.clone(),
    last_active: Arc::new(tokio::sync::Mutex::new(tokio::time::Instant::now())),
    cancel,
    result_notify: Arc::new(tokio::sync::Notify::new()),
    has_cron: Arc::new(AtomicBool::new(false)),
    crash_count: Arc::new(AtomicU32::new(0)),
    last_crash: Arc::new(tokio::sync::Mutex::new(None)),
};
```

- [ ] **Step 4: Run cargo check**

```bash
cargo check -p local-deployment
```

- [ ] **Step 5: Commit**

```bash
git add crates/local-deployment/src/container.rs
git commit -m "feat(container): store shared EntryIndexProvider in ActiveProcess"
```

---

### Task 4: Fix `send_to_active_process` to Use Shared Provider

**Files:**
- Modify: `crates/local-deployment/src/container.rs`

- [ ] **Step 1: Replace the local provider with the shared one**

In `send_to_active_process` (around line 1986), change:

```rust
// Before:
let index_provider = EntryIndexProvider::start_from(&store);
let next_index = index_provider.next();

// After:
let next_index = active.entry_index_provider.next();
```

Also remove the unused import of `EntryIndexProvider` from the function's local `use` block.

- [ ] **Step 2: Run cargo check**

```bash
cargo check -p local-deployment
```

- [ ] **Step 3: Commit**

```bash
git add crates/local-deployment/src/container.rs
git commit -m "fix(container): use shared EntryIndexProvider in send_to_active_process"
```

---

### Task 5: Frontend — Remove user_message Filter

**Files:**
- Modify: `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts`
- Modify: `frontend/src/hooks/useConversationHistory/useConversationWindow.ts`

- [ ] **Step 1: In `useConversationHistoryOld.ts`, remove the filter in `flattenEntriesForEmit`**

Find the filter that removes user_message entries (around line 345):

```typescript
// Before:
const filteredEntries = p.entries.filter(
  (e) =>
    e.type !== 'NORMALIZED_ENTRY' ||
    e.content.entry_type.type !== 'user_message'
);

// After:
const filteredEntries = p.entries;
```

Also remove the filter in the `loadMore` function (around line 1049) and any other places that filter user_message entries.

- [ ] **Step 2: In `useConversationWindow.ts`, remove the filter in `parseWithUserMessages`**

Find the filter (around line 67):

```typescript
// Before:
if (
  parsed.type === 'NORMALIZED_ENTRY' &&
  parsed.content.entry_type.type === 'user_message'
) {
  continue;
}

// After:
// Keep real user_message entries from DB (follow-ups in continuous mode)
```

- [ ] **Step 3: Run frontend checks**

```bash
cd frontend && pnpm run check
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useConversationHistory/
git commit -m "fix(frontend): show real user_message entries for follow-ups"
```

---

### Task 6: Verify and Clean Up

- [ ] **Step 1: Run all Rust tests**

```bash
cargo test --workspace
```

- [ ] **Step 2: Run frontend checks**

```bash
cd frontend && pnpm run check && pnpm run lint
```

- [ ] **Step 3: Commit any remaining fixes**

```bash
git add -A && git commit -m "fix: continuous conversation entry ordering"
```
