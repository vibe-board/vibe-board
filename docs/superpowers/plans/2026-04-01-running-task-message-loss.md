# Running Task Message Loss Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix running tasks losing early streaming messages when the user switches away and back, by introducing a dedicated `NormalizedEntryStore` that serves normalized entries from memory for running processes.

**Architecture:** Add a per-process `NormalizedEntryStore` to hold normalized entries in memory (no eviction). `spawn_stream_raw_logs_to_file` populates it alongside the existing DB batch flush. `stream_normalized_logs` and `stream_live_normalized_logs` read from this store for running tasks. The frontend `loadRunningAndEmit` switches to using the `normalized-logs/ws` endpoint (full history replay + live) instead of REST+live WS. Scroll-up pagination still uses REST from DB.

**Tech Stack:** Rust (tokio, broadcast channel), TypeScript/React

---

### Task 1: Create `NormalizedEntryStore` module

**NOTE:** `utils` cannot depend on `executors` (circular dep). Place this module in `crates/services/src/services/normalized_entry_store.rs` and register in `crates/services/src/services/mod.rs`.

**Files:**
- Create: `crates/services/src/services/normalized_entry_store.rs`
- Modify: `crates/services/src/services/mod.rs`

- [ ] **Step 1: Create `normalized_entry_store.rs`**

```rust
use std::sync::{Arc, RwLock};

use futures::StreamExt;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;

use utils::log_msg::LogMsg;
use executors::logs::{NormalizedEntry, utils::patch::ConversationPatch};

/// Per-entry operation type for broadcast messages.
#[derive(Debug, Clone)]
pub enum EntryOp {
    Add(usize, NormalizedEntry),
    Replace(usize, NormalizedEntry),
}

/// Per-process in-memory store for normalized entries.
/// Unlike MsgStore, this has NO eviction — entries are small and kept
/// for the lifetime of the running process.
pub struct NormalizedEntryStore {
    /// Sorted by index. Entries may be replaced in-place (streaming text updates).
    entries: RwLock<Vec<(usize, NormalizedEntry)>>,
    sender: broadcast::Sender<EntryOp>,
}

impl Default for NormalizedEntryStore {
    fn default() -> Self {
        Self::new()
    }
}

impl NormalizedEntryStore {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(10000);
        Self {
            entries: RwLock::new(Vec::with_capacity(64)),
            sender,
        }
    }

    /// Add a new entry at the given index.
    pub fn push(&self, index: usize, entry: NormalizedEntry) {
        {
            let mut entries = self.entries.write().unwrap();
            entries.push((index, entry.clone()));
        }
        let _ = self.sender.send(EntryOp::Add(index, entry));
    }

    /// Replace an existing entry at the given index (streaming text updates).
    pub fn replace(&self, index: usize, entry: NormalizedEntry) {
        {
            let mut entries = self.entries.write().unwrap();
            if let Some(pos) = entries.iter().position(|(i, _)| *i == index) {
                entries[pos] = (index, entry.clone());
            } else {
                // If the entry doesn't exist yet, treat as add
                entries.push((index, entry.clone()));
            }
        }
        let _ = self.sender.send(EntryOp::Replace(index, entry));
    }

    /// Return a snapshot of all entries.
    pub fn snapshot(&self) -> Vec<(usize, NormalizedEntry)> {
        self.entries.read().unwrap().clone()
    }

    /// Stream: replay full history as LogMsg::JsonPatch, then live updates.
    /// Emits LogMsg::Finished at the end when the broadcast sender is dropped.
    pub fn history_plus_live(
        &self,
    ) -> futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>> {
        let history = self.snapshot();
        let rx = self.sender.subscribe();

        let hist = futures::stream::iter(history.into_iter().map(|(index, entry)| {
            let patch = ConversationPatch::add_normalized_entry(index, entry);
            Ok::<_, std::io::Error>(LogMsg::JsonPatch(patch))
        }));

        let live = BroadcastStream::new(rx).filter_map(|res| async move {
            match res {
                Ok(op) => {
                    let msg = match op {
                        EntryOp::Add(index, entry) => {
                            let patch = ConversationPatch::add_normalized_entry(index, entry);
                            LogMsg::JsonPatch(patch)
                        }
                        EntryOp::Replace(index, entry) => {
                            let patch = ConversationPatch::replace_normalized_entry(index, entry);
                            LogMsg::JsonPatch(patch)
                        }
                    };
                    Some(Ok::<_, std::io::Error>(msg))
                }
                Err(_) => None,
            }
        });

        Box::pin(hist.chain(live))
    }
}
```

- [ ] **Step 2: Check if `ConversationPatch::replace_normalized_entry` exists**

Run: `grep -n "replace_normalized_entry" crates/executors/src/logs/utils/patch.rs`

If it does NOT exist as a static method on `ConversationPatch`, add it. It should create a `Replace` patch operation (same as `add_normalized_entry` but with `PatchOperation::Replace`). Check the existing `PatchOperation` enum and `PatchEntry` struct for the exact format.

If needed, add to `crates/executors/src/logs/utils/patch.rs` after `add_normalized_entry`:

```rust
    pub fn replace_normalized_entry(entry_index: usize, entry: NormalizedEntry) -> Patch {
        let patch_entry = PatchEntry {
            op: PatchOperation::Replace,
            path: format!("/entries/{entry_index}"),
            value: PatchType::NormalizedEntry(entry),
        };

        from_value(json!([patch_entry])).unwrap()
    }
```

- [ ] **Step 3: Register the module in `crates/services/src/services/mod.rs`**

Add alongside the existing `pub mod raw_log_store;`:

```rust
pub mod normalized_entry_store;
```

- [ ] **Step 4: Verify it compiles**

Run: `cargo check -p services`
Expected: PASS (no errors)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add NormalizedEntryStore for per-process normalized entry memory"
```

---

### Task 2: Wire `NormalizedEntryStore` into `ContainerService`

**Files:**
- Modify: `crates/services/src/services/container.rs` (trait definition + default methods)
- Modify: `crates/local-deployment/src/container.rs` (struct fields + trait impl)
- Modify: `crates/local-deployment/src/lib.rs` (initialization)

- [ ] **Step 1: Add the trait method to `ContainerService`**

In `crates/services/src/services/container.rs`, add after `fn msg_stores(...)` (line 92):

```rust
    fn normalized_entry_stores(&self) -> &Arc<RwLock<HashMap<Uuid, Arc<NormalizedEntryStore>>>>;
```

Add the necessary import at the top of the file: `use crate::services::normalized_entry_store::NormalizedEntryStore;`.

- [ ] **Step 2: Add a helper method to get a store by ID**

In `crates/services/src/services/container.rs`, add after the `get_msg_store_by_id` method (around line 778):

```rust
    async fn get_normalized_entry_store_by_id(&self, uuid: &Uuid) -> Option<Arc<NormalizedEntryStore>> {
        let map = self.normalized_entry_stores().read().await;
        map.get(uuid).cloned()
    }
```

- [ ] **Step 3: Add the field to `LocalContainerService`**

In `crates/local-deployment/src/container.rs`, add to `struct LocalContainerService` (after `msg_stores` field, line 87):

```rust
    normalized_entry_stores: Arc<RwLock<HashMap<Uuid, Arc<NormalizedEntryStore>>>>,
```

Add the import for `NormalizedEntryStore` at the top of the file.

- [ ] **Step 4: Initialize in `LocalContainerService::new`**

In `crates/local-deployment/src/container.rs`, in the `new` method (around line 103), add:

```rust
        let normalized_entry_stores = Arc::new(RwLock::new(HashMap::new()));
```

And add it to the `Self { ... }` return struct.

- [ ] **Step 5: Implement the trait method**

In `crates/local-deployment/src/container.rs`, in `impl ContainerService for LocalContainerService` (after `msg_stores()`, around line 1034):

```rust
    fn normalized_entry_stores(&self) -> &Arc<RwLock<HashMap<Uuid, Arc<NormalizedEntryStore>>>> {
        &self.normalized_entry_stores
    }
```

- [ ] **Step 6: Verify it compiles**

Run: `cargo check -p local-deployment`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: wire NormalizedEntryStore into ContainerService trait"
```

---

### Task 3: Populate `NormalizedEntryStore` from `spawn_stream_raw_logs_to_file`

**Files:**
- Modify: `crates/services/src/services/container.rs` (`spawn_stream_raw_logs_to_file` method)

- [ ] **Step 1: Pass `normalized_entry_stores` into the spawned task**

In `spawn_stream_raw_logs_to_file` (line 928), clone the stores map alongside `msg_stores`:

```rust
    fn spawn_stream_raw_logs_to_file(&self, execution_id: &Uuid) -> JoinHandle<()> {
        let execution_id = *execution_id;
        let msg_stores = self.msg_stores().clone();
        let normalized_entry_stores = self.normalized_entry_stores().clone();
        let db = self.db().clone();
```

- [ ] **Step 2: Create the `NormalizedEntryStore` and insert into map**

After getting the `MsgStore` (around line 940-943), create and insert the entry store:

```rust
            // Create NormalizedEntryStore for this execution
            let ne_store = Arc::new(NormalizedEntryStore::new());
            {
                let mut map = normalized_entry_stores.write().await;
                map.insert(execution_id, ne_store.clone());
            }
```

- [ ] **Step 3: Populate the store when extracting normalized entries**

In the `LogMsg::JsonPatch` match arm (around line 978-983), after extracting the entry, push/replace into the store:

```rust
                        LogMsg::JsonPatch(patch) => {
                            let is_replace = patch
                                .iter()
                                .any(|op| matches!(op, PatchOperation::Replace(_)));

                            if let Some((index, entry)) = extract_normalized_entry_from_patch(patch)
                                && let Ok(json) = serde_json::to_string(&entry)
                            {
                                // Push to in-memory NormalizedEntryStore
                                if is_replace {
                                    ne_store.replace(index, entry);
                                } else {
                                    ne_store.push(index, entry);
                                }

                                pending_entries.insert(index as i64, json);
                            }
                            if pending_entries.len() >= FLUSH_THRESHOLD {
                                let batch: Vec<(i64, String)> = pending_entries.drain().collect();
                                if let Err(e) =
                                    DbNormalizedEntry::insert_batch(&db.pool, execution_id, &batch)
                                        .await
                                {
                                    tracing::error!(
                                        "Failed to persist normalized entries for execution {}: {}",
                                        execution_id,
                                        e
                                    );
                                }
                            }
                        }
```

Note: `PatchOperation` needs to be imported — check if it's already imported at the top of the file. It is: `use json_patch::{Patch, PatchOperation};` (line 47).

- [ ] **Step 4: Clean up the store after process exit and final flush**

After the final flush of `pending_entries` and log compression (around line 1055), remove the store from the map:

```rust
                // Remove NormalizedEntryStore after all entries are flushed to DB
                {
                    let mut map = normalized_entry_stores.write().await;
                    map.remove(&execution_id);
                }
```

- [ ] **Step 5: Verify it compiles**

Run: `cargo check -p services`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: populate NormalizedEntryStore in spawn_stream_raw_logs_to_file"
```

---

### Task 4: Use `NormalizedEntryStore` in `stream_normalized_logs` and `stream_live_normalized_logs`

**Files:**
- Modify: `crates/services/src/services/container.rs` (`stream_normalized_logs`, `stream_live_normalized_logs`)

- [ ] **Step 1: Update `stream_normalized_logs` to check `NormalizedEntryStore` first**

Replace the current `stream_normalized_logs` method (line 832-890) with:

```rust
    async fn stream_normalized_logs(
        &self,
        id: &Uuid,
    ) -> Option<futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>>> {
        // First try NormalizedEntryStore (running task with full history)
        if let Some(ne_store) = self.get_normalized_entry_store_by_id(id).await {
            return Some(
                ne_store
                    .history_plus_live()
                    .chain(futures::stream::once(async {
                        Ok::<_, std::io::Error>(LogMsg::Finished)
                    }))
                    .boxed(),
            );
        }

        // Fallback: load from normalized_entries table directly (completed process)
        let pool = self.db().pool.clone();
        let execution_id = *id;

        let exists = DbNormalizedEntry::exists_for_execution_id(&pool, execution_id)
            .await
            .ok()?;
        if !exists {
            return None;
        }

        let total = DbNormalizedEntry::count_by_execution_id(&pool, execution_id)
            .await
            .ok()?;

        let paginated =
            DbNormalizedEntry::find_by_execution_id_paginated(&pool, execution_id, 0, total)
                .await
                .ok()?;

        let patches: Vec<LogMsg> = paginated
            .entries
            .into_iter()
            .filter_map(|entry| {
                let normalized: NormalizedEntry = serde_json::from_str(&entry.entry_json).ok()?;
                let patch =
                    ConversationPatch::add_normalized_entry(entry.entry_index as usize, normalized);
                Some(LogMsg::JsonPatch(patch))
            })
            .collect();

        let stream = futures::stream::iter(
            patches
                .into_iter()
                .chain(std::iter::once(LogMsg::Finished))
                .map(Ok::<_, std::io::Error>),
        )
        .boxed();

        Some(stream)
    }
```

Key change: the first `if let` now checks `NormalizedEntryStore` instead of `MsgStore`. The `MsgStore` check is removed from this method.

- [ ] **Step 2: Update `stream_live_normalized_logs` to use `NormalizedEntryStore`**

Replace the current `stream_live_normalized_logs` method (line 893-926) with:

```rust
    async fn stream_live_normalized_logs(
        &self,
        id: &Uuid,
        after_index: i64,
    ) -> Option<futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>>> {
        let ne_store = self.get_normalized_entry_store_by_id(id).await?;

        let stream = ne_store
            .history_plus_live()
            .filter(move |msg| {
                future::ready(match msg {
                    Ok(LogMsg::JsonPatch(patch)) => {
                        if let Some((index, _)) = extract_normalized_entry_from_patch(patch) {
                            let is_replace = patch
                                .iter()
                                .any(|op| matches!(op, PatchOperation::Replace(_)));
                            is_replace || (index as i64) > after_index
                        } else {
                            false
                        }
                    }
                    Ok(LogMsg::Finished) => true,
                    _ => false,
                })
            })
            .chain(futures::stream::once(async {
                Ok::<_, std::io::Error>(LogMsg::Finished)
            }))
            .boxed();

        Some(stream)
    }
```

Key change: uses `NormalizedEntryStore::history_plus_live()` instead of `MsgStore::live_stream()`. This fixes the gap where entries in memory but not yet flushed to DB were missed.

- [ ] **Step 3: Verify it compiles**

Run: `cargo check -p services`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: use NormalizedEntryStore in stream_normalized_logs and stream_live_normalized_logs"
```

---

### Task 5: Update frontend `loadRunningAndEmit` to use `normalized-logs/ws`

**Files:**
- Modify: `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts`

- [ ] **Step 1: Replace the REST+live WS approach with direct `normalized-logs/ws`**

Replace the coding agent section of `loadRunningAndEmit` (lines 688-777, the block starting with `// Normalized logs: REST first, then live WS`):

```ts
      // Normalized logs: WS replay full history + live updates
      const url = `/api/execution-processes/${executionProcess.id}/normalized-logs/ws`;

      return new Promise<void>((resolve, reject) => {
        const controller = streamJsonPatchEntries<PatchType>(url, {
          onEntries(allEntries) {
            const patchesWithKey = (allEntries as (PatchType | null)[])
              .map((entry, index) =>
                entry ? patchWithKey(entry, executionProcess.id, index) : null
              )
              .filter(Boolean) as PatchTypeWithKey[];

            // Compute minEntryIndex for scroll-up pagination
            let minEntryIndex: number | undefined;
            for (const e of patchesWithKey) {
              const idx = parseInt(e.patchKey.split(':').pop()!, 10);
              if (!Number.isNaN(idx)) {
                if (minEntryIndex === undefined || idx < minEntryIndex) {
                  minEntryIndex = idx;
                }
              }
            }

            // If the smallest index received > 0, there may be older entries in DB
            const hasMoreEntries =
              minEntryIndex !== undefined && minEntryIndex > 0;

            mergeIntoDisplayed((state) => {
              state[executionProcess.id] = {
                executionProcess,
                entries: patchesWithKey,
                hasMoreEntries,
                minEntryIndex,
              };
            });
            emitState(displayedExecutionProcesses.current, 'running');
          },
          onFinished: () => {
            emitState(displayedExecutionProcesses.current, 'running');
            controller.close();
            resolve();
          },
          onError: () => {
            controller.close();
            reject();
          },
        });
      });
```

This removes:
- The REST `getEntries` call (lines 691-703)
- The `initialEntries` padding array (lines 735-745)
- The live WS connection to `normalized-logs-live/ws` (lines 734-777)
- The `maxEntryIndex` tracking (lines 716-719)

- [ ] **Step 2: Verify frontend types compile**

Run: `pnpm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(frontend): use normalized-logs WS for running task initial load"
```

---

### Task 6: Enable scroll-up pagination for running processes in `loadMore`

**Files:**
- Modify: `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts`

- [ ] **Step 1: Remove the running process skip filter**

In the `loadMore` callback (around line 992-996), remove the filter that skips running processes from entry-level pagination:

Current code:
```ts
      const processWithMore = Object.values(displayedExecutionProcesses.current)
        .filter((p) => {
          if (!p.hasMoreEntries || p.minEntryIndex === undefined) return false;
          const live = getLiveExecutionProcess(p.executionProcess.id);
          return live?.status !== ExecutionProcessStatus.running;
        })
```

Change to:
```ts
      const processWithMore = Object.values(displayedExecutionProcesses.current)
        .filter((p) => {
          if (!p.hasMoreEntries || p.minEntryIndex === undefined) return false;
          return true;
        })
```

This allows running processes to participate in entry-level pagination via REST from DB when the user scrolls up.

- [ ] **Step 2: Verify frontend types compile**

Run: `pnpm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(frontend): enable scroll-up pagination for running processes"
```

---

### Task 7: Clean up `NormalizedEntryStore` on process stop (kill path)

**Files:**
- Modify: `crates/local-deployment/src/container.rs` (stop_execution method)

- [ ] **Step 1: Remove `NormalizedEntryStore` alongside `MsgStore` in the stop path**

In `crates/local-deployment/src/container.rs`, find the process stop/kill cleanup (around line 1421-1428 where `msg_stores` is cleaned up). Add cleanup for `normalized_entry_stores` after the DB stream handle awaits:

After the existing block:
```rust
        if let Some(handle) = db_stream_handle {
            let _ = tokio::time::timeout(Duration::from_secs(5), handle).await;
        }
```

The `NormalizedEntryStore` cleanup should already happen inside `spawn_stream_raw_logs_to_file` (Task 3, Step 4) after the final flush. But the kill path also needs to handle it since the spawn task may not finish cleanly. Add a safety cleanup:

```rust
        // Safety cleanup: remove NormalizedEntryStore if spawn task didn't clean it up
        self.normalized_entry_stores.write().await.remove(&execution_process.id);
```

- [ ] **Step 2: Do the same for the normal exit cleanup path**

Find the normal exit path (around line 695-702 in `spawn_background_finalization_task`). Add the same safety cleanup after the DB stream handle await:

```rust
            // Safety cleanup: remove NormalizedEntryStore
            normalized_entry_stores.write().await.remove(&exec_id);
```

This requires passing `normalized_entry_stores` into the spawned task. Clone `self.normalized_entry_stores.clone()` at the start of the method (same as `msg_stores` is cloned).

- [ ] **Step 3: Verify it compiles**

Run: `cargo check -p local-deployment`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: clean up NormalizedEntryStore on process stop and normal exit"
```

---

### Task 8: End-to-end verification

- [ ] **Step 1: Run Rust compilation**

Run: `cargo check --workspace`
Expected: PASS

- [ ] **Step 2: Run Rust tests**

Run: `cargo test --workspace`
Expected: PASS (no regressions)

- [ ] **Step 3: Run frontend checks**

Run: `pnpm run check && pnpm run lint`
Expected: PASS

- [ ] **Step 4: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix: address compilation and test issues"
```
