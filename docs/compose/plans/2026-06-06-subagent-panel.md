# Subagent Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag each `NormalizedEntry` with an `agent_id` so the frontend can render a tab bar allowing users to switch between main agent and subagent data streams in the task attempt panel.

**Architecture:** Rust backend changes `SubagentEventFilter` from a drop filter to an agent-ID resolver, tags each `NormalizedEntry` with `agent_id`, and emits a `SubagentStarted` entry on `actor.registered`. The frontend reads the new field to build tabs in `TaskAttemptPanel` and filters entries in `VirtualizedList`.

**Tech Stack:** Rust (serde, ts-rs), React + TypeScript, Tailwind (legacy design tokens)

---

### Task 1: Add `agent_id` field to `NormalizedEntry` and `SubagentStarted` variant

**Covers:** [S3], [S5]

**Files:**
- Modify: `crates/executors/src/logs/mod.rs:188-195` (NormalizedEntry struct)
- Modify: `crates/executors/src/logs/mod.rs:76-121` (NormalizedEntryType enum)

- [ ] **Step 1: Add `agent_id` to `NormalizedEntry`**

In `crates/executors/src/logs/mod.rs`, find the `NormalizedEntry` struct (line 188) and add the field:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct NormalizedEntry {
    pub timestamp: Option<String>,
    pub entry_type: NormalizedEntryType,
    pub content: String,
    #[ts(skip)]
    pub metadata: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
}
```

- [ ] **Step 2: Add `SubagentStarted` variant to `NormalizedEntryType`**

In the same file, find the `NormalizedEntryType` enum (line 76). Add a new variant after `UserAnsweredQuestions`:

```rust
SubagentStarted {
    actor_id: String,
    description: Option<String>,
},
```

- [ ] **Step 3: Fix `with_tool_status` method — it uses struct update syntax, ensure new field carries through**

The existing `with_tool_status` method (line 197) uses `..self.clone()` which automatically includes `agent_id`. No change needed — verify by reading the method.

- [ ] **Step 4: Cargo check**

```bash
cargo check --workspace 2>&1 | head -40
```

Expected: Only errors about missing match arms for `SubagentStarted` in downstream code — no type errors on `NormalizedEntry` itself.

- [ ] **Step 5: Commit**

```bash
git add crates/executors/src/logs/mod.rs
git commit -m "feat: add agent_id field and SubagentStarted variant to NormalizedEntry"
```

---

### Task 2: Refactor `SubagentEventFilter` to tag instead of drop

**Covers:** [S4]

**Files:**
- Modify: `crates/executors/src/executors/mimo_code/sdk.rs:1669-1718`

- [ ] **Step 1: Add `agent_id_for` method to `SubagentEventFilter`**

In `sdk.rs`, replace the `SubagentEventFilter` impl block (lines 1674–1713) with:

```rust
impl SubagentEventFilter {
    fn should_log(&mut self, event_type: &str, event: &Value) -> bool {
        // Track message_id -> agent_id mapping for part events
        if event_type == "message.updated" {
            if let Some(message_id) = event.pointer("/properties/info/id").and_then(Value::as_str) {
                let agent_id = event
                    .pointer("/properties/info/agentID")
                    .or_else(|| event.pointer("/properties/info/agent_id"))
                    .and_then(Value::as_str)
                    .unwrap_or("main");
                self.message_agent_ids
                    .insert(message_id.to_string(), agent_id.to_string());
            }
        }
        true  // never drop — tag instead
    }

    fn agent_id_for(&self, event_type: &str, event: &Value) -> Option<String> {
        let raw_id = match event_type {
            "message.updated" => event
                .pointer("/properties/info/agentID")
                .or_else(|| event.pointer("/properties/info/agent_id"))
                .and_then(Value::as_str)
                .unwrap_or("main"),
            "message.part.updated" => {
                let message_id = self.message_id_for_part(event)?;
                self.message_agent_ids.get(message_id).map(String::as_str).unwrap_or("main")
            }
            "message.part.delta" | "message.part.removed" => {
                let message_id = event
                    .pointer("/properties/messageID")
                    .and_then(Value::as_str)?;
                self.message_agent_ids.get(message_id).map(String::as_str).unwrap_or("main")
            }
            _ => return None,
        };
        if is_main_agent(raw_id) { None } else { Some(raw_id.to_string()) }
    }

    fn message_id_for_part<'a>(&self, event: &'a Value) -> Option<&'a str> {
        event
            .pointer("/properties/part/messageID")
            .or_else(|| event.pointer("/properties/part/message_id"))
            .and_then(Value::as_str)
    }
}
```

- [ ] **Step 2: Thread `agent_id_for` result into the logged event**

In `sdk.rs` around line 1342–1351, where `event_filter.should_log()` is called and the event is logged, also compute the agent_id and embed it in the event JSON so `normalize_logs.rs` can read it later:

```rust
// Replace the existing filter + log block (lines 1342–1351):
let agent_id = event_filter.agent_id_for(event_type, &data);
// Inject agent_id into the event value before logging
let logged_event = if let Some(ref aid) = agent_id {
    let mut ev = data.clone();
    if let Some(obj) = ev.as_object_mut() {
        obj.insert("_agent_id".to_string(), serde_json::Value::String(aid.clone()));
    }
    ev
} else {
    data.clone()
};
let _ = ctx
    .log_writer
    .log_event(&MiMoCodeExecutorEvent::SdkEvent {
        event: logged_event,
    })
    .await;
```

- [ ] **Step 3: Cargo check**

```bash
cargo check --workspace 2>&1 | head -40
```

Expected: clean (or only unrelated warnings).

- [ ] **Step 4: Commit**

```bash
git add crates/executors/src/executors/mimo_code/sdk.rs
git commit -m "feat: SubagentEventFilter tags agent_id instead of dropping subagent events"
```

---

### Task 3: Wire agent_id into normalize_logs and handle ActorRegistered

**Covers:** [S5], [S6]

**Files:**
- Modify: `crates/executors/src/executors/mimo_code/normalize_logs.rs`

- [ ] **Step 1: Add `agent_id` extraction helper in normalize_logs.rs**

At the top of the `handle_sdk_event` method (line 251), after parsing the event, extract the embedded `_agent_id` field:

```rust
fn agent_id_from_raw(raw: &Value) -> Option<String> {
    raw.get("_agent_id").and_then(Value::as_str).map(|s| s.to_string())
}
```

Add this as a free function near the top of the file (after `system_message`).

- [ ] **Step 2: Fix `NormalizedEntry` construction sites that now need `agent_id`**

After Task 1 adds `agent_id` to `NormalizedEntry`, all existing construction sites will fail to compile because the field is missing. Run:

```bash
cargo check --workspace 2>&1 | grep "missing field.*agent_id" | head -30
```

For every site constructing `NormalizedEntry { timestamp, entry_type, content, metadata }`, add `agent_id: None`.

The most important site to also propagate the agent_id is `update_streaming_text` (line 750 of `normalize_logs.rs`). Update its signature to accept `agent_id: Option<String>` and pass it through to the `NormalizedEntry`:

```rust
fn update_streaming_text(
    entry_index: &EntryIndexProvider,
    text: &str,
    entry_type: NormalizedEntryType,
    message_id: &str,
    map: &mut HashMap<String, StreamingText>,
    msg_store: &Arc<dyn ConversationSink>,
    mode: UpdateMode,
    agent_id: Option<String>,
) {
    // ... existing logic unchanged ...
    let entry = NormalizedEntry {
        timestamp: None,
        entry_type,
        content: state.content.clone(),
        metadata: None,
        agent_id,
    };
    upsert_normalized_entry(msg_store, state.index, entry, is_new);
}
```

Also update the `system_message` helper (line 29) to include `agent_id: None`:

```rust
fn system_message(content: String) -> NormalizedEntry {
    NormalizedEntry {
        timestamp: None,
        entry_type: NormalizedEntryType::SystemMessage,
        content,
        metadata: None,
        agent_id: None,
    }
}
```

- [ ] **Step 3: Pass agent_id from handle_sdk_event into handle_part_update**

In `handle_sdk_event` (line 272), when handling `SdkEvent::MessagePartUpdated`, extract the agent_id from raw and pass it to `handle_part_update`:

```rust
SdkEvent::MessagePartUpdated(event) => {
    let agent_id = agent_id_from_raw(raw);
    self.handle_part_update(
        event.part,
        event.delta.as_deref(),
        worktree_path,
        msg_store,
        agent_id,
    );
}
```

Update `handle_part_update` signature accordingly:
```rust
fn handle_part_update(
    &mut self,
    part: Part,
    delta: Option<&str>,
    worktree_path: &Path,
    msg_store: &Arc<dyn ConversationSink>,
    agent_id: Option<String>,
)
```

For `Part::Text` and `Part::Reasoning`, pass `agent_id` to `update_streaming_text`. For `Part::Tool`, set `tool_state.agent_id = agent_id` (add this field to `ToolCallState` and propagate to `to_normalized_entry`).

- [ ] **Step 4: Handle ActorRegistered — emit SubagentStarted entry**

In `handle_sdk_event`, replace the silent ignore of `SdkEvent::ActorRegistered` (line 340):

```rust
SdkEvent::ActorRegistered(event) => {
    self.add_normalized_entry(NormalizedEntry {
        timestamp: None,
        entry_type: NormalizedEntryType::SubagentStarted {
            actor_id: event.actor_id.clone(),
            description: event.description.clone(),
        },
        content: format!(
            "Subagent started: {}",
            event.description.as_deref().unwrap_or(&event.actor_id)
        ),
        metadata: None,
        agent_id: None,  // appears on main agent tab
    });
}
```

- [ ] **Step 5: Handle missing arm — add SubagentStarted to any match exhaustion**

Run cargo check to find any exhaustive match on `NormalizedEntryType` that now needs a `SubagentStarted` arm:

```bash
cargo check --workspace 2>&1 | grep "SubagentStarted\|non-exhaustive"
```

For each match site, add a sensible arm (e.g. return empty string, skip rendering, etc.).

- [ ] **Step 6: Cargo check clean**

```bash
cargo check --workspace 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add crates/executors/src/executors/mimo_code/normalize_logs.rs
git commit -m "feat: propagate agent_id to NormalizedEntry and emit SubagentStarted on actor.registered"
```

---

### Task 4: Find and fix all exhaustive match sites for SubagentStarted

**Covers:** [S5]

**Files:**
- Various files in `crates/` that match on `NormalizedEntryType`

- [ ] **Step 1: Find all match sites**

```bash
grep -rn "NormalizedEntryType\|UserAnsweredQuestions\|entry_type" crates/ --include="*.rs" | grep -v "mod.rs" | grep "match\|=>" | head -40
```

Also:
```bash
cargo check --workspace 2>&1
```

- [ ] **Step 2: Add `SubagentStarted` arm to each match**

For each match on `NormalizedEntryType` found, add:
```rust
NormalizedEntryType::SubagentStarted { .. } => { /* appropriate no-op or skip */ }
```

The specific behavior depends on context (e.g. a display function might return empty string, a filter might return false).

- [ ] **Step 3: Cargo check clean**

```bash
cargo check --workspace 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -p
git commit -m "fix: handle SubagentStarted variant in all NormalizedEntryType match sites"
```

---

### Task 5: Regenerate TypeScript types

**Covers:** [S7]

**Files:**
- Auto-modified: `shared/types.ts`

- [ ] **Step 1: Run generate-types**

```bash
pnpm run generate-types
```

Expected output: `shared/types.ts` updated.

- [ ] **Step 2: Verify new fields appear in shared/types.ts**

```bash
grep -n "agent_id\|SubagentStarted\|subagent_started" shared/types.ts
```

Expected: lines like:
```typescript
agent_id?: string | null;
```
and a `subagent_started` variant in the `NormalizedEntryType` union.

- [ ] **Step 3: Run frontend type check**

```bash
pnpm run check 2>&1 | head -30
```

Expected: any type errors are now about the new fields being unhandled in frontend code — that's fine for this task.

- [ ] **Step 4: Commit**

```bash
git add shared/types.ts
git commit -m "chore: regenerate TypeScript types with agent_id and SubagentStarted"
```

---

### Task 6: Frontend — agent tab bar in TaskAttemptPanel

**Covers:** [S8]

**Files:**
- Modify: `frontend/src/components/panels/TaskAttemptPanel.tsx`

- [ ] **Step 1: Read current TaskAttemptPanel to understand context hook access**

Read `frontend/src/contexts/EntriesContext.tsx` to understand what `useEntries()` returns:

```bash
head -60 frontend/src/contexts/EntriesContext.tsx
```

- [ ] **Step 2: Add AgentTabBar component inside TaskAttemptPanel.tsx**

Add a new component at the top of the file (before `TaskAttemptPanel`):

```tsx
interface Agent {
  id: string | null;  // null = main
  label: string;
}

interface AgentTabBarProps {
  agents: Agent[];
  activeAgentId: string | null;
  onSelect: (id: string | null) => void;
}

const AgentTabBar = ({ agents, activeAgentId, onSelect }: AgentTabBarProps) => {
  if (agents.length <= 1) return null;  // only show when subagents exist
  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-border shrink-0 overflow-x-auto">
      {agents.map((agent) => (
        <button
          key={agent.id ?? '__main__'}
          onClick={() => onSelect(agent.id)}
          className={`px-2 py-0.5 text-xs rounded transition-colors whitespace-nowrap ${
            activeAgentId === agent.id
              ? 'bg-muted text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          {agent.label}
        </button>
      ))}
    </div>
  );
};
```

- [ ] **Step 3: Add state and agent derivation to TaskAttemptPanel**

Inside the `TaskAttemptPanel` component, after the existing `useState` calls, add:

```tsx
const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
```

`AgentTabBar` needs the list of agents derived from entries. Since entries live inside `EntriesProvider`, extract agent derivation into a child component. Create an inner component `AgentTabBarConnected` that uses `useEntries()`:

```tsx
const AgentTabBarConnected = ({
  activeAgentId,
  onSelect,
}: {
  activeAgentId: string | null;
  onSelect: (id: string | null) => void;
}) => {
  const { entries } = useEntries();

  const agents: Agent[] = useMemo(() => {
    const subagents: Agent[] = [];
    const seen = new Set<string>();
    for (const entry of entries) {
      if (
        entry.entry_type.type === 'subagent_started' &&
        !seen.has(entry.entry_type.actor_id)
      ) {
        seen.add(entry.entry_type.actor_id);
        const label =
          entry.entry_type.description?.slice(0, 20) ??
          entry.entry_type.actor_id;
        subagents.push({ id: entry.entry_type.actor_id, label });
      }
    }
    return [{ id: null, label: 'Main' }, ...subagents];
  }, [entries]);

  return (
    <AgentTabBar
      agents={agents}
      activeAgentId={activeAgentId}
      onSelect={onSelect}
    />
  );
};
```

Add `import { useMemo } from 'react';` if not already imported (it already is).
Add `import { useEntries } from '@/contexts/EntriesContext';` if not already imported.

- [ ] **Step 4: Place AgentTabBarConnected inside the logs section**

In the `logs` section of the render (around line 111), place `AgentTabBarConnected` before `VirtualizedList`, inside `EntriesProvider`:

```tsx
logs: (
  <div className="relative flex-1 min-h-0 flex flex-col">
    <div className="flex items-center justify-end px-2 py-1 border-b border-border shrink-0">
      {attempt.session && <SessionCost session={attempt.session} />}
      <button
        onClick={() => setTocOpen(true)}
        className="p-1.5 rounded hover:bg-muted text-muted-foreground"
        title="Conversation TOC"
      >
        <List className="h-4 w-4" />
      </button>
    </div>
    <AgentTabBarConnected
      activeAgentId={activeAgentId}
      onSelect={setActiveAgentId}
    />
    <VirtualizedList
      key={attempt.id}
      attempt={attempt}
      task={task}
      activeAgentId={activeAgentId}
      onJumpToReady={(fn) => {
        jumpToRef.current = fn;
      }}
      onVisibleProcessIdChange={setActiveProcessId}
    />
    ...
```

- [ ] **Step 5: Frontend type check**

```bash
pnpm run check 2>&1 | head -40
```

Expected: errors about `activeAgentId` prop not existing on `VirtualizedList` yet — that's fine, Task 7 adds it.

- [ ] **Step 6: Commit partial**

```bash
git add frontend/src/components/panels/TaskAttemptPanel.tsx
git commit -m "feat: add AgentTabBar component to TaskAttemptPanel"
```

---

### Task 7: Frontend — filter entries by activeAgentId in VirtualizedList

**Covers:** [S9]

**Files:**
- Modify: `frontend/src/components/logs/VirtualizedList.tsx`

- [ ] **Step 1: Add `activeAgentId` prop to VirtualizedListProps**

In `VirtualizedList.tsx`, update the interface:

```tsx
interface VirtualizedListProps {
  attempt: WorkspaceWithSession;
  task?: Task;
  onJumpToReady?: (
    fn: (
      anchorCursor: string,
      processId: string,
      allSummaries: Array<{
        execution_process_id: string;
        summary: string;
      }>
    ) => Promise<void>
  ) => void;
  onVisibleProcessIdChange?: (id: string | null) => void;
  activeAgentId?: string | null;
}
```

- [ ] **Step 2: Accept the prop in the component and compute filtered entries**

Update the component destructuring:

```tsx
const VirtualizedList = ({
  attempt,
  task,
  onJumpToReady,
  onVisibleProcessIdChange,
  activeAgentId,
}: VirtualizedListProps) => {
```

After `const { entries, ... } = useConversationWindow(...)`, add:

```tsx
const filteredEntries = useMemo(() => {
  if (activeAgentId === undefined || activeAgentId === null) {
    // Main agent: show entries with no agent_id, plus subagent_started entries
    return entries.filter(
      (e) =>
        !e.agent_id ||
        e.entry_type?.type === 'subagent_started'
    );
  }
  // Specific subagent: show only its entries
  return entries.filter((e) => e.agent_id === activeAgentId);
}, [entries, activeAgentId]);
```

- [ ] **Step 3: Replace `entries` with `filteredEntries` in virtualizer and render**

The virtualizer uses `entries.length` (line 99) and `entries[i]` (line 103). Replace both with `filteredEntries`:

```tsx
const virtualizer = useVirtualizer({
  count: filteredEntries.length,
  getScrollElement: () => scrollContainerRef.current,
  estimateSize: () => 120,
  overscan: 5,
  getItemKey: (i) => filteredEntries[i]?.patchKey ?? `idx-${i}`,
});
```

Search for any other direct use of `entries` in the render/virtualizer section (not in hooks like `setEntries(entries)`) and replace with `filteredEntries`.

Note: `setEntries(entries)` (line 95) must remain using the unfiltered `entries` — EntriesContext needs the full list.

- [ ] **Step 4: Frontend type check**

```bash
pnpm run check 2>&1 | head -40
```

Expected: clean or only pre-existing warnings.

- [ ] **Step 5: Frontend lint**

```bash
pnpm run lint 2>&1 | head -30
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/logs/VirtualizedList.tsx
git commit -m "feat: filter VirtualizedList entries by activeAgentId tab"
```

---

### Task 8: Handle SubagentStarted in frontend entry renderer

**Covers:** [S5], [S8]

**Files:**
- Modify: `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx`

- [ ] **Step 1: Find where entry types are rendered**

```bash
grep -n "user_message\|assistant_message\|subagent\|entry_type" frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx | head -20
```

- [ ] **Step 2: Add rendering for `subagent_started`**

Find the main switch/conditional that dispatches on `entry_type.type`. Add a case for `subagent_started` that renders a compact announcement (shown on the main agent tab):

```tsx
if (entry.entry_type.type === 'subagent_started') {
  const { actor_id, description } = entry.entry_type;
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
      <span>
        Subagent started:{' '}
        <span className="font-medium text-foreground">
          {description ?? actor_id}
        </span>{' '}
        <span className="opacity-50">({actor_id})</span>
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Frontend type check**

```bash
pnpm run check 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx
git commit -m "feat: render SubagentStarted entry in conversation display"
```

---

### Task 9: End-to-end verification

**Covers:** [S1]–[S10]

**Files:** none (verification only)

- [ ] **Step 1: Full Rust test suite**

```bash
cargo test --workspace 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 2: Frontend type check + lint**

```bash
pnpm run check 2>&1 | head -20
pnpm run lint 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 3: Verify generate-types is stable**

```bash
pnpm run generate-types:check 2>&1 | head -20
```

Expected: no diff (types already regenerated in Task 5).

- [ ] **Step 4: Dev smoke test (optional, if dev environment available)**

```bash
pnpm run dev
```

Open a task attempt that uses mimocode executor with subagents. Verify:
- Tab bar appears with "Main" + one tab per subagent
- Switching tabs filters the entry list
- Main tab shows `SubagentStarted` announcement entries
- Token/cost display still works on main tab
