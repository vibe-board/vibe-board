# MiMoCode Executor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `MimoCode` as a new `CodingAgent` variant — a full copy of the opencode executor with adapted names and constants for the `mimo` CLI command.

**Architecture:** Full duplication of the opencode executor module (`opencode.rs` + `opencode/` sub-modules) with all type names, constants, env vars, and config paths renamed for MiMoCode. The new module lives at `crates/executors/src/executors/mimo_code.rs` with sub-modules in `crates/executors/src/executors/mimo_code/`.

**Tech Stack:** Rust, async_trait, command_group, serde, ts_rs

---

### Task 1: Create `mimo_code/types.rs`

**Files:**
- Create: `crates/executors/src/executors/mimo_code/types.rs`

Copy `crates/executors/src/executors/opencode/types.rs` and rename:
- `OpencodeExecutorEvent` → `MimoCodeExecutorEvent`
- Doc comment "OpenCode SDK executor" → "MiMoCode SDK executor"
- All other types (`SdkEventEnvelope`, `SdkEvent`, `MessageRole`, `MessageInfo`, `Part`, `ToolPart`, `ToolStateUpdate`, `SessionStatus`, `SdkTodo`, `QuestionInfo`, `QuestionOption`, `ProviderListResponse`, `ProviderInfo`, `ProviderModelInfo`, `ProviderModelLimit`, etc.) keep the same names (they are `pub(super)` internal types)

- [ ] **Step 1: Copy and rename types.rs**

```bash
mkdir -p crates/executors/src/executors/mimo_code
cp crates/executors/src/executors/opencode/types.rs crates/executors/src/executors/mimo_code/types.rs
```

Then edit `crates/executors/src/executors/mimo_code/types.rs`:
- Line 5: change `/// JSON log events emitted by the OpenCode SDK executor.` → `/// JSON log events emitted by the MiMoCode SDK executor.`
- Line 8: change `pub enum OpencodeExecutorEvent` → `pub enum MimoCodeExecutorEvent`

- [ ] **Step 2: Verify it compiles**

```bash
cargo check -p executors 2>&1 | head -20
```

Expected: will fail until all sub-modules are created. That's OK — we'll verify after all files are in place.

- [ ] **Step 3: Commit**

```bash
git add crates/executors/src/executors/mimo_code/types.rs
git commit -m "feat: add mimo_code types module"
```

---

### Task 2: Create `mimo_code/models.rs`

**Files:**
- Create: `crates/executors/src/executors/mimo_code/models.rs`

Copy `crates/executors/src/executors/opencode/models.rs` and update imports.

- [ ] **Step 1: Copy and update imports**

```bash
cp crates/executors/src/executors/opencode/models.rs crates/executors/src/executors/mimo_code/models.rs
```

Then edit `crates/executors/src/executors/mimo_code/models.rs`:
- Line 8-11: change imports from `crate::executors::opencode::{...}` to `crate::executors::mimo_code::{...}`, and `OpencodeExecutorEvent` to `MimoCodeExecutorEvent`:
  ```rust
  use crate::executors::mimo_code::{
      sdk::EventStreamContext,
      types::{MessageRole, MimoCodeExecutorEvent, ProviderListResponse, SdkEvent},
  };
  ```
- Line 157: change `OpencodeExecutorEvent::TokenUsage` to `MimoCodeExecutorEvent::TokenUsage`

- [ ] **Step 2: Commit**

```bash
git add crates/executors/src/executors/mimo_code/models.rs
git commit -m "feat: add mimo_code models module"
```

---

### Task 3: Create `mimo_code/sdk.rs`

**Files:**
- Create: `crates/executors/src/executors/mimo_code/sdk.rs`

Copy `crates/executors/src/executors/opencode/sdk.rs` and rename all opencode references.

- [ ] **Step 1: Copy**

```bash
cp crates/executors/src/executors/opencode/sdk.rs crates/executors/src/executors/mimo_code/sdk.rs
```

- [ ] **Step 2: Apply renames**

Edit `crates/executors/src/executors/mimo_code/sdk.rs`:

1. Line 24: `use super::{slash_commands, types::OpencodeExecutorEvent};` → `use super::{slash_commands, types::MimoCodeExecutorEvent};`
2. Line 30-31: `use crate::executors::opencode::{OpencodeServer, models::maybe_emit_token_usage};` → `use crate::executors::mimo_code::{MimoCodeServer, models::maybe_emit_token_usage};`
3. Line 46: `pub async fn log_event(&self, event: &OpencodeExecutorEvent)` → `pub async fn log_event(&self, event: &MimoCodeExecutorEvent)`
4. Line 53: `OpencodeExecutorEvent::Error` → `MimoCodeExecutorEvent::Error`
5. Line 58: `OpencodeExecutorEvent::SlashCommandResult` → `MimoCodeExecutorEvent::SlashCommandResult`
6. Line 94-101: doc comment "Generate a cryptographically secure random password for OpenCode server auth." → "...for MiMoCode server auth."
7. Line 265-266: `pub(super) async fn discover_commands(server: &OpencodeServer,` → `pub(super) async fn discover_commands(server: &MimoCodeServer,`
8. Line 279: `command: slash_commands::OpencodeSlashCommand,` → `command: slash_commands::MimoCodeSlashCommand,`
9. Line 312: `OpencodeExecutorEvent::SessionStart` → `MimoCodeExecutorEvent::SessionStart`
10. Line 384: `OpencodeExecutorEvent::SystemMessage` → `MimoCodeExecutorEvent::SystemMessage`
11. Line 421: `OpencodeExecutorEvent::Done` → `MimoCodeExecutorEvent::Done`
12. Line 428-436: `build_default_headers` — change `"x-opencode-directory"` to `"x-mimocode-directory"` and `"opencode:{password}"` to `"mimocode:{password}"`
13. Line 438-451: `build_opencode_client` → `build_mimocode_client`, rename constants `OPENCODE_HTTP_TIMEOUT` → `MIMOCODE_HTTP_TIMEOUT`, `OPENCODE_CONNECT_TIMEOUT` → `MIMOCODE_CONNECT_TIMEOUT`
14. Line 453: `OPENCODE_PROMPT_TIMEOUT` → `MIMOCODE_PROMPT_TIMEOUT`
15. All error messages: replace `"OpenCode"` with `"MiMoCode"` (lines 485, 546, 588, 616, 669, 676, 700, 752, 759, 780, 1000, 1117)
16. Line 1437: `OpencodeExecutorEvent::ApprovalRequested` → `MimoCodeExecutorEvent::ApprovalRequested`
17. Line 1573: `OpencodeExecutorEvent::QuestionAsked` → `MimoCodeExecutorEvent::QuestionAsked`
18. Line 1757: `OpencodeExecutorEvent::ApprovalResponse` → `MimoCodeExecutorEvent::ApprovalResponse`
19. Line 1766: `OpencodeExecutorEvent::QuestionResponse` → `MimoCodeExecutorEvent::QuestionResponse`

Use replace_all for these systematic renames:
- `OpencodeExecutorEvent` → `MimoCodeExecutorEvent` (replace_all)
- `OpencodeServer` → `MimoCodeServer` (replace_all)
- `OpencodeSlashCommand` → `MimoCodeSlashCommand` (replace_all)
- `"OpenCode` → `"MiMoCode` (replace_all, for error messages)
- `build_opencode_client` → `build_mimocode_client` (replace_all)
- `OPENCODE_HTTP_TIMEOUT` → `MIMOCODE_HTTP_TIMEOUT` (replace_all)
- `OPENCODE_CONNECT_TIMEOUT` → `MIMOCODE_CONNECT_TIMEOUT` (replace_all)
- `OPENCODE_PROMPT_TIMEOUT` → `MIMOCODE_PROMPT_TIMEOUT` (replace_all)
- `"x-opencode-directory"` → `"x-mimocode-directory"` (replace_all)
- `"opencode:{password}"` → `"mimocode:{password}"` (replace_all)

- [ ] **Step 3: Commit**

```bash
git add crates/executors/src/executors/mimo_code/sdk.rs
git commit -m "feat: add mimo_code sdk module"
```

---

### Task 4: Create `mimo_code/normalize_logs.rs`

**Files:**
- Create: `crates/executors/src/executors/mimo_code/normalize_logs.rs`

- [ ] **Step 1: Copy**

```bash
cp crates/executors/src/executors/opencode/normalize_logs.rs crates/executors/src/executors/mimo_code/normalize_logs.rs
```

- [ ] **Step 2: Apply renames**

Edit `crates/executors/src/executors/mimo_code/normalize_logs.rs`:
1. Line 12-15: change `super::types::{..., OpencodeExecutorEvent, ...}` → `super::types::{..., MimoCodeExecutorEvent, ...}`
2. All occurrences of `OpencodeExecutorEvent` → `MimoCodeExecutorEvent` (replace_all)
3. All occurrences of `"OpenCode` → `"MiMoCode` (replace_all, for error messages like "Unrecognized OpenCode SDK event")

- [ ] **Step 3: Commit**

```bash
git add crates/executors/src/executors/mimo_code/normalize_logs.rs
git commit -m "feat: add mimo_code normalize_logs module"
```

---

### Task 5: Create `mimo_code/slash_commands.rs`

**Files:**
- Create: `crates/executors/src/executors/mimo_code/slash_commands.rs`

- [ ] **Step 1: Copy**

```bash
cp crates/executors/src/executors/opencode/slash_commands.rs crates/executors/src/executors/mimo_code/slash_commands.rs
```

- [ ] **Step 2: Apply renames**

Edit `crates/executors/src/executors/mimo_code/slash_commands.rs`:
1. Line 1: doc comment `//! OpenCode slash command` → `//! MiMoCode slash command`
2. Line 26: `types::OpencodeExecutorEvent` → `types::MimoCodeExecutorEvent`
3. Line 31: `opencode::Opencode` → `mimo_code::MimoCode`
4. Line 39-40: `/// OpenCode slash command` → `/// MiMoCode slash command`
5. Line 41: `pub enum OpencodeSlashCommand` → `pub enum MimoCodeSlashCommand`
6. Line 57: `impl Opencode {` → `impl MimoCode {`
7. Line 65: `&BaseCodingAgent::Opencode` → `&BaseCodingAgent::MimoCode`
8. Line 99: `impl OpencodeSlashCommand {` → `impl MimoCodeSlashCommand {`
9. Line 116: `impl<'a> From<SlashCommandCall<'a>> for OpencodeSlashCommand` → `impl<'a> From<SlashCommandCall<'a>> for MimoCodeSlashCommand`
10. Line 382: `OpencodeExecutorEvent::Done` → `MimoCodeExecutorEvent::Done`
11. Line 392-398: `pub async fn execute(config: RunConfig, command: OpencodeSlashCommand,` → `pub async fn execute(config: RunConfig, command: MimoCodeSlashCommand,`
12. All `OpencodeSlashCommand::` → `MimoCodeSlashCommand::` (replace_all)
13. All `OpencodeExecutorEvent::` → `MimoCodeExecutorEvent::` (replace_all)

- [ ] **Step 3: Commit**

```bash
git add crates/executors/src/executors/mimo_code/slash_commands.rs
git commit -m "feat: add mimo_code slash_commands module"
```

---

### Task 6: Create `mimo_code.rs` (main executor)

**Files:**
- Create: `crates/executors/src/executors/mimo_code.rs`

- [ ] **Step 1: Copy**

```bash
cp crates/executors/src/executors/opencode.rs crates/executors/src/executors/mimo_code.rs
```

- [ ] **Step 2: Apply renames**

Edit `crates/executors/src/executors/mimo_code.rs`:

1. Line 20: `opencode::types::OpencodeExecutorEvent` → `mimo_code::types::MimoCodeExecutorEvent`
2. Line 33: `use slash_commands::{OpencodeSlashCommand, hardcoded_slash_commands};` → `use slash_commands::{MimoCodeSlashCommand, hardcoded_slash_commands};`
3. Line 37: `pub struct Opencode` → `pub struct MimoCode`
4. Line 61: `struct OpencodeServer` → `struct MimoCodeServer`
5. Line 68: `impl Drop for OpencodeServer` → `impl Drop for MimoCodeServer`
6. Line 81: `const DEFAULT_OPENCODE_BASE: &str = "npx -y opencode-ai@1.2.24";` → `const DEFAULT_MIMOCODE_BASE: &str = "mimo";`
7. Line 83: `impl Opencode` → `impl MimoCode`
8. Line 85: `CommandBuilder::new(DEFAULT_OPENCODE_BASE)` → `CommandBuilder::new(DEFAULT_MIMOCODE_BASE)` (both occurrences, lines 85 and 93)
9. Line 126: `OPENCODE_SERVER_USERNAME` → `MIMOCODE_SERVER_USERNAME`
10. Line 127: `OPENCODE_SERVER_PASSWORD` → `MIMOCODE_SERVER_PASSWORD`
11. Line 145: `OpencodeServer` → `MimoCodeServer` (in return type and struct literal)
12. Line 148-149: `"OpenCode server missing stdout"` → `"MiMoCode server missing stdout"`
13. Line 167: `OpencodeSlashCommand::parse` → `MimoCodeSlashCommand::parse`
14. Line 206: `"OpenCode startup error"` → `"MiMoCode startup error"`
15. Line 239: `"OpenCode executor error"` → `"MiMoCode executor error"`
16. Line 279: `"OpenCode server"` → `"MiMoCode server"` (in error messages)
17. Line 287-289: `"OpenCode server"` → `"MiMoCode server"` (in error messages)
18. Line 298: `OpencodeExecutorEvent::StartupLog` → `MimoCodeExecutorEvent::StartupLog`
19. Line 307: `"opencode server listening on "` → `"mimocode server listening on "`
20. Line 319: `impl StandardCodingAgentExecutor for Opencode` → `impl StandardCodingAgentExecutor for MimoCode`
21. Line 381: `xdg::BaseDirectories::with_prefix("opencode")` → `xdg::BaseDirectories::with_prefix("mimocode")`
22. Line 383-386: `"opencode.json"` → `"mimocode.json"`, `"opencode.jsonc"` → `"mimocode.jsonc"`
23. Line 394: `p.join("opencode")` → `p.join("mimocode")`
24. Line 396-398: `"opencode.json"` → `"mimocode.json"`, `"opencode.jsonc"` → `"mimocode.jsonc"`
25. Line 416: `xdg::BaseDirectories::with_prefix("opencode")` → `xdg::BaseDirectories::with_prefix("mimocode")`
26. Line 440-445: `p.join("opencode")` → `p.join("mimocode")`
27. Line 448: `home.join(".opencode")` → `home.join(".mimocode")`
28. Line 466: `env.get("OPENCODE_PERMISSION")` → `env.get("MIMOCODE_PERMISSION")`
29. Line 471: `env.insert("OPENCODE_PERMISSION",` → `env.insert("MIMOCODE_PERMISSION",`
30. Line 491: `env.get("OPENCODE_CONFIG_CONTENT")` → `env.get("MIMOCODE_CONFIG_CONTENT")`
31. Line 492: `env.insert("OPENCODE_CONFIG_CONTENT",` → `env.insert("MIMOCODE_CONFIG_CONTENT",`
32. `impl StandardCodingAgentExecutor`: line 339 tracing warn `"OpenCode slash commands"` → `"MiMoCode slash commands"`

Use replace_all for:
- `OpencodeExecutorEvent` → `MimoCodeExecutorEvent`
- `OpencodeSlashCommand` → `MimoCodeSlashCommand`
- `OpencodeServer` → `MimoCodeServer`
- `DEFAULT_OPENCODE_BASE` → `DEFAULT_MIMOCODE_BASE`
- `OPENCODE_SERVER_USERNAME` → `MIMOCODE_SERVER_USERNAME`
- `OPENCODE_SERVER_PASSWORD` → `MIMOCODE_SERVER_PASSWORD`
- `OPENCODE_PERMISSION` → `MIMOCODE_PERMISSION`
- `OPENCODE_CONFIG_CONTENT` → `MIMOCODE_CONFIG_CONTENT`
- `"opencode server listening on "` → `"mimocode server listening on "`
- `"opencode.json"` → `"mimocode.json"`
- `"opencode.jsonc"` → `"mimocode.jsonc"`
- `with_prefix("opencode")` → `with_prefix("mimocode")`
- `p.join("opencode")` → `p.join("mimocode")`
- `home.join(".opencode")` → `home.join(".mimocode")`
- `"OpenCode` → `"MiMoCode` (for all error/log messages)

Then fix the struct name:
- `pub struct Opencode` → `pub struct MimoCode`
- `impl Opencode` → `impl MimoCode`
- `impl StandardCodingAgentExecutor for Opencode` → `impl StandardCodingAgentExecutor for MimoCode`

And fix the `build_command_builder` comment on line 86-87 (update "OpenCode" → "MiMoCode" in comment).

- [ ] **Step 3: Verify compilation**

```bash
cargo check -p executors 2>&1 | head -30
```

Expected: will still fail until `mod.rs` is updated. That's OK.

- [ ] **Step 4: Commit**

```bash
git add crates/executors/src/executors/mimo_code.rs crates/executors/src/executors/mimo_code/
git commit -m "feat: add mimo_code executor module with all sub-modules"
```

---

### Task 7: Register MimoCode in `mod.rs`

**Files:**
- Modify: `crates/executors/src/executors/mod.rs`

- [ ] **Step 1: Add module declaration**

At line 58 (after `pub mod opencode;`), add:
```rust
pub mod mimo_code;
```

- [ ] **Step 2: Add import**

At line 29 (in the imports block), add `mimo_code::MimoCode` to the import list:
```rust
use crate::executors::{
    ...
    mimo_code::MimoCode,
    opencode::Opencode,
    ...
};
```

- [ ] **Step 3: Add enum variant**

In the `CodingAgent` enum (around line 136, after `Opencode`), add:
```rust
    MimoCode,
```

- [ ] **Step 4: Add `get_mcp_config` match arm**

In `get_mcp_config()` (after the `Self::Opencode` arm, around line 195), add:
```rust
            Self::MimoCode(_) => McpConfig::new(
                vec!["mcp".to_string()],
                serde_json::json!({
                    "mcp": {}
                }),
                self.preconfigured_mcp(),
                false,
            ),
```

- [ ] **Step 5: Add `capabilities` match arm**

In `capabilities()` (after the `Self::Opencode` arm, around line 228), add:
```rust
            Self::MimoCode(_) => vec![
                BaseAgentCapability::SessionFork,
                BaseAgentCapability::ContextUsage,
            ],
```

- [ ] **Step 6: Add `interactive_command` match arm**

In `interactive_command()` (after the `Self::Opencode` arm, around line 293), add:
```rust
            Self::MimoCode(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
```

- [ ] **Step 7: Verify compilation**

```bash
cargo check -p executors 2>&1 | head -30
```

Expected: should compile cleanly. Fix any remaining issues.

- [ ] **Step 8: Run tests**

```bash
cargo test -p executors 2>&1 | tail -20
```

Expected: all existing tests pass.

- [ ] **Step 9: Commit**

```bash
git add crates/executors/src/executors/mod.rs
git commit -m "feat: register MimoCode as a CodingAgent variant"
```

---

### Task 8: Regenerate TypeScript types

**Files:**
- Modify: `shared/types.ts` (auto-generated)

- [ ] **Step 1: Generate types**

```bash
pnpm run generate-types
```

Expected: `shared/types.ts` now contains `MIMO_CODE` in the `BaseCodingAgent` enum.

- [ ] **Step 2: Verify frontend type check**

```bash
pnpm run check
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "chore: regenerate TS types with MIMO_CODE variant"
```

---

### Task 9: Add documentation

**Files:**
- Create: `docs/agents/mimo-code.mdx`

- [ ] **Step 1: Create doc file**

```mdx
---
title: "MiMoCode"
description: "Set up MiMoCode"
---

<Steps>
<Step title="Install MiMoCode">
  Ensure the `mimo` command is installed and available in your PATH.
</Step>

<Step title="Start Vibe Board">
  Once ready, launch Vibe Board:

  ```bash
  npx vibe-board
  ```

  You can now select MiMoCode when creating task attempts.
</Step>
</Steps>
```

- [ ] **Step 2: Commit**

```bash
git add docs/agents/mimo-code.mdx
git commit -m "docs: add MiMoCode agent documentation"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run full workspace tests**

```bash
cargo test --workspace 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend checks**

```bash
pnpm run check && pnpm run lint
```

Expected: both pass.

- [ ] **Step 3: Commit any fixes**

If any fixes were needed, commit them.
