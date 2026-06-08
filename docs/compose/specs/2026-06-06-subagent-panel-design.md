# Subagent Panel Design

## [S1] Problem

MiMoCode executor produces a multi-agent data stream (main agent + N subagents). The current `SubagentEventFilter` in `crates/executors/src/executors/mimo_code/sdk.rs` drops all `message.*` events where `agentID != "main"`. Subagent runtime activity is invisible to the user in the task attempt panel.

## [S2] Solution Overview

Tag every `NormalizedEntry` with an `agent_id` field instead of discarding subagent events. The frontend reads this field to build a tab bar — one tab per agent — and filters the entry list to show only the selected agent's entries. No database schema changes; the new field is additive and backward-compatible (absent = main agent).

## [S3] Rust: NormalizedEntry agent_id Field

Add an optional `agent_id` field to `NormalizedEntry` in `crates/executors/src/logs/mod.rs`:

```rust
#[serde(default, skip_serializing_if = "Option::is_none")]
pub agent_id: Option<String>,
```

`None` means main agent. Subagent entries carry the actor ID string (e.g. `"explore-1"`).

## [S4] Rust: SubagentEventFilter → tag, not drop

In `crates/executors/src/executors/mimo_code/sdk.rs`, change `SubagentEventFilter` so that `should_log()` always returns `true`. Add a companion method `agent_id_for(event_type, event) -> Option<String>` that returns the agent ID for message events (None for main agent). The normalize layer calls this to populate `agent_id` on each entry.

## [S5] Rust: SubagentStarted NormalizedEntryType variant

Add a new variant to `NormalizedEntryType` in `crates/executors/src/logs/mod.rs`:

```rust
SubagentStarted {
    actor_id: String,
    description: Option<String>,
}
```

In `normalize_logs.rs`, handle `SdkEvent::ActorRegistered` by emitting a `SubagentStarted` entry (tagged with `agent_id = None` so it appears on the main agent tab as an announcement). This lets the frontend discover which subagents exist and their descriptions without scanning all entries.

## [S6] normalize_logs.rs wiring

In `crates/executors/src/executors/mimo_code/normalize_logs.rs`:

- The `LogState` holds a reference to the `SubagentEventFilter` (or inline agent-ID resolution logic).
- When normalizing any `message.*`-derived entry (AssistantMessage, ToolUse, Thinking, etc.), set `entry.agent_id` from the resolved agent ID.
- When handling `SdkEvent::ActorRegistered`, emit a `SubagentStarted` entry instead of silently ignoring it.

## [S7] TypeScript Types (auto-generated)

Run `pnpm run generate-types` after Rust changes. `shared/types.ts` will gain:
- `NormalizedEntry.agent_id?: string | null`
- `NormalizedEntryType` union gains `{ type: "subagent_started"; actor_id: string; description: string | null }`

Do not manually edit `shared/types.ts`.

## [S8] Frontend: Agent Tab Bar

In `frontend/src/components/panels/TaskAttemptPanel.tsx`, add a tab bar above the `VirtualizedList`. The tabs are derived from `SubagentStarted` entries plus a hardcoded "Main" tab:

- **Main** tab always present, selected by default.
- One tab per `SubagentStarted` entry found in the entries list, labeled with `description ?? actor_id`, truncated to ~20 chars.
- Selected agent ID held in local state (`useState<string | null>(null)` — null = main).
- Pass `activeAgentId` down to `VirtualizedList`.

Tab bar is only rendered when there is at least one subagent (i.e. entries contain a `SubagentStarted`).

## [S9] Frontend: Entry Filtering in VirtualizedList

In `frontend/src/components/logs/VirtualizedList.tsx`, accept a new optional prop `activeAgentId?: string | null`. When set:

- `null` (main): show entries where `agent_id` is null/undefined, plus `SubagentStarted` entries (so user can see announcements).
- `string` (subagent): show entries where `agent_id === activeAgentId`.

Filtering is applied after entries are fetched from context/hook — it is purely a display concern.

## [S10] Scope Limits

- opencode executor is NOT changed in this iteration (same pattern can be applied later).
- No database schema migration required; `agent_id` is additive.
- TOC, token stats, follow-up input all remain scoped to main agent behavior.
- `SubagentEventFilter` is not deleted — repurposed as an agent-ID resolver.
