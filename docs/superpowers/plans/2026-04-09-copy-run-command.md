# Copy Run Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Copy Run Command" feature that generates an interactive CLI command for any agent executor+variant and copies it to the clipboard.

**Architecture:** New backend API endpoint (`GET /api/profiles/{executor}/{variant}/interactive-command`) builds the command using existing `CommandBuilder` infrastructure, stripping protocol-specific params. Two frontend buttons call this API: one in Agent Settings per-variant, one in the task dropdown menu.

**Tech Stack:** Rust (axum, serde, shlex), TypeScript/React (navigator.clipboard API, lucide-react icons)

---

### Task 1: Add `InteractiveCommand` struct and formatting helper in `command.rs`

**Files:**
- Modify: `crates/executors/src/command.rs`

- [ ] **Step 1: Add the `InteractiveCommand` struct**

Add at the end of `crates/executors/src/command.rs`, before the closing of the file (after line 193):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InteractiveCommand {
    pub command: String,
}

/// Format a `CommandBuilder` and optional env vars into a single-line shell command.
/// Env vars are prepended as `KEY=value` pairs, shell-quoted if needed.
pub fn format_interactive_command(
    builder: &CommandBuilder,
    env: &Option<HashMap<String, String>>,
) -> Result<InteractiveCommand, CommandBuildError> {
    let parts = builder.build_initial()?;
    let mut segments: Vec<String> = Vec::new();

    // Prepend user-configured env vars
    if let Some(env_map) = env {
        let mut keys: Vec<&String> = env_map.keys().collect();
        keys.sort(); // deterministic output
        for key in keys {
            let val = &env_map[key];
            let quoted = shlex::try_quote(val)?;
            segments.push(format!("{key}={quoted}"));
        }
    }

    // Add program
    segments.push(shlex::try_quote(&parts.program)?.into_owned());

    // Add args
    for arg in &parts.args {
        segments.push(shlex::try_quote(arg)?.into_owned());
    }

    Ok(InteractiveCommand {
        command: segments.join(" "),
    })
}
```

Note: `CommandParts` fields `program` and `args` are currently private. Make them `pub(crate)`:

In the same file, change the `CommandParts` struct (around line 24):
```rust
#[derive(Debug, Clone)]
pub struct CommandParts {
    pub(crate) program: String,
    pub(crate) args: Vec<String>,
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p executors`
Expected: Compiles successfully.

- [ ] **Step 3: Add a unit test**

Add at the end of `crates/executors/src/command.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_interactive_command_basic() {
        let builder = CommandBuilder::new("npx -y @anthropic-ai/claude-code@2.1.45")
            .extend_params(["--model", "opus"]);
        let env = Some(HashMap::from([
            ("MY_KEY".to_string(), "my_value".to_string()),
        ]));
        let result = format_interactive_command(&builder, &env).unwrap();
        assert_eq!(
            result.command,
            "MY_KEY=my_value npx -y @anthropic-ai/claude-code@2.1.45 --model opus"
        );
    }

    #[test]
    fn format_interactive_command_no_env() {
        let builder = CommandBuilder::new("claude").extend_params(["--model", "sonnet"]);
        let result = format_interactive_command(&builder, &None).unwrap();
        assert_eq!(result.command, "claude --model sonnet");
    }

    #[test]
    fn format_interactive_command_quotes_spaces() {
        let builder = CommandBuilder::new("claude");
        let env = Some(HashMap::from([
            ("KEY".to_string(), "value with spaces".to_string()),
        ]));
        let result = format_interactive_command(&builder, &env).unwrap();
        assert!(result.command.contains("KEY='value with spaces'") || result.command.contains("KEY=\"value with spaces\""));
    }
}
```

- [ ] **Step 4: Run the test**

Run: `cargo test -p executors -- command::tests`
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/executors/src/command.rs
git commit -m "feat(command): add InteractiveCommand struct and formatting helper"
```

---

### Task 2: Add `build_interactive_command_builder()` to all executor structs

**Files:**
- Modify: `crates/executors/src/executors/claude.rs`
- Modify: `crates/executors/src/executors/cursor.rs`
- Modify: `crates/executors/src/executors/amp.rs`
- Modify: `crates/executors/src/executors/droid.rs`
- Modify: `crates/executors/src/executors/codex.rs`
- Modify: `crates/executors/src/executors/opencode.rs`
- Modify: `crates/executors/src/executors/gemini.rs`
- Modify: `crates/executors/src/executors/qwen.rs`
- Modify: `crates/executors/src/executors/copilot.rs`
- Modify: `crates/executors/src/executors/kilo.rs`
- Modify: `crates/executors/src/executors/cline.rs`
- Modify: `crates/executors/src/executors/auggie.rs`
- Modify: `crates/executors/src/executors/autohand.rs`
- Modify: `crates/executors/src/executors/crow_cli.rs`
- Modify: `crates/executors/src/executors/deepagents.rs`
- Modify: `crates/executors/src/executors/dimcode.rs`
- Modify: `crates/executors/src/executors/fast_agent.rs`
- Modify: `crates/executors/src/executors/goose.rs`
- Modify: `crates/executors/src/executors/junie.rs`
- Modify: `crates/executors/src/executors/kimi.rs`
- Modify: `crates/executors/src/executors/minion_code.rs`
- Modify: `crates/executors/src/executors/mistral_vibe.rs`
- Modify: `crates/executors/src/executors/nova.rs`
- Modify: `crates/executors/src/executors/pi_acp.rs`
- Modify: `crates/executors/src/executors/qoder.rs`
- Modify: `crates/executors/src/executors/stakpak.rs`
- Modify: `crates/executors/src/executors/codebuddy_code.rs`
- Modify: `crates/executors/src/executors/corust_agent.rs`

Each executor gets a `pub fn build_interactive_command_builder()` method that mirrors `build_command_builder()` but omits protocol-specific params. Below is the exact code for every executor.

- [ ] **Step 1: Claude Code** (`crates/executors/src/executors/claude.rs`)

Add this method inside `impl ClaudeCode` (next to `build_command_builder`):

```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let mut builder =
            CommandBuilder::new(base_command(self.claude_code_router.unwrap_or(false)));

        if self.dangerously_skip_permissions.unwrap_or(false) {
            builder = builder.extend_params(["--dangerously-skip-permissions"]);
        }
        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model]);
        }
        if let Some(agent) = &self.agent {
            builder = builder.extend_params(["--agent", agent]);
        }

        apply_overrides(builder, &self.cmd)
    }
```

Removed: `-p`, `--permission-prompt-tool=stdio`, `--permission-mode=bypassPermissions`, `--verbose`, `--output-format=stream-json`, `--input-format=stream-json`, `--include-partial-messages`, `--replay-user-messages`.

- [ ] **Step 2: Cursor** (`crates/executors/src/executors/cursor.rs`)

Add inside `impl CursorAgent`:

```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let mut builder = CommandBuilder::new(Self::base_command());

        if self.force.unwrap_or(false) {
            builder = builder.extend_params(["--force"]);
        }
        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model]);
        }

        apply_overrides(builder, &self.cmd)
    }
```

Removed: `-p`, `--output-format=stream-json`.

- [ ] **Step 3: Amp** (`crates/executors/src/executors/amp.rs`)

Add inside `impl Amp`:

```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let mut builder = CommandBuilder::new("npx -y @sourcegraph/amp@latest");
        if self.dangerously_allow_all.unwrap_or(false) {
            builder = builder.extend_params(["--dangerously-allow-all"]);
        }
        apply_overrides(builder, &self.cmd)
    }
```

Removed: `--execute`, `--stream-json`.

- [ ] **Step 4: Droid** (`crates/executors/src/executors/droid.rs`)

Add inside `impl Droid`:

```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        use crate::command::{CommandBuilder, apply_overrides};
        let mut builder = CommandBuilder::new("droid");
        builder = match &self.autonomy {
            Autonomy::Normal => builder,
            Autonomy::Low => builder.extend_params(["--auto", "low"]),
            Autonomy::Medium => builder.extend_params(["--auto", "medium"]),
            Autonomy::High => builder.extend_params(["--auto", "high"]),
            Autonomy::SkipPermissionsUnsafe => builder.extend_params(["--skip-permissions-unsafe"]),
        };
        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model.as_str()]);
        }
        if let Some(effort) = &self.reasoning_effort {
            builder = builder.extend_params(["--reasoning-effort", effort.as_ref()]);
        }
        apply_overrides(builder, &self.cmd)
    }
```

Removed: `exec` subcommand, `--output-format`, `stream-json`.

- [ ] **Step 5: Codex** (`crates/executors/src/executors/codex.rs`)

Add inside `impl Codex`:

```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let mut builder = CommandBuilder::new(DEFAULT_CODEX_BASE);
        if self.oss.unwrap_or(false) {
            builder = builder.extend_params(["--oss"]);
        }
        apply_overrides(builder, &self.cmd)
    }
```

Removed: `app-server` subcommand.

- [ ] **Step 6: Opencode** (`crates/executors/src/executors/opencode.rs`)

Add inside `impl Opencode`:

```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new(DEFAULT_OPENCODE_BASE);
        apply_overrides(builder, &self.cmd)
    }
```

Removed: `serve`, `--hostname`, `127.0.0.1`, `--port`, `0`.

- [ ] **Step 7: Gemini** (`crates/executors/src/executors/gemini.rs`)

Add inside `impl Gemini`:

```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let mut builder = CommandBuilder::new("npx -y @google/gemini-cli@0.27.0");
        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model.as_str()]);
        }
        if self.yolo.unwrap_or(false) {
            builder = builder.extend_params(["--yolo"]);
            builder = builder.extend_params(["--allowed-tools", "run_shell_command"]);
        }
        apply_overrides(builder, &self.cmd)
    }
```

Removed: `--experimental-acp`.

- [ ] **Step 8: Qwen** (`crates/executors/src/executors/qwen.rs`)

Add inside `impl QwenCode`:

```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let mut builder = CommandBuilder::new("npx -y @qwen-code/qwen-code@0.9.1");
        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model.as_str()]);
        }
        if self.yolo.unwrap_or(false) {
            builder = builder.extend_params(["--yolo"]);
        }
        apply_overrides(builder, &self.cmd)
    }
```

Removed: `--acp`.

- [ ] **Step 9: Copilot** (`crates/executors/src/executors/copilot.rs`)

Add inside `impl Copilot`:

```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let mut builder = CommandBuilder::new("npx -y @github/copilot@0.0.403");
        if self.allow_all_tools.unwrap_or(false) {
            builder = builder.extend_params(["--allow-all-tools"]);
        }
        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model]);
        }
        if let Some(tool) = &self.allow_tool {
            builder = builder.extend_params(["--allow-tool", tool]);
        }
        if let Some(tool) = &self.deny_tool {
            builder = builder.extend_params(["--deny-tool", tool]);
        }
        if let Some(dirs) = &self.add_dir {
            for dir in dirs {
                builder = builder.extend_params(["--add-dir", dir]);
            }
        }
        if let Some(servers) = &self.disable_mcp_server {
            for server in servers {
                builder = builder.extend_params(["--disable-mcp-server", server]);
            }
        }
        apply_overrides(builder, &self.cmd)
    }
```

Removed: `--acp`.

- [ ] **Step 10: Kilo** (`crates/executors/src/executors/kilo.rs`)

Add inside `impl Kilo`:

```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("npx -y @kilocode/cli@7.0.47");
        apply_overrides(builder, &self.cmd)
    }
```

Removed: `acp` subcommand.

- [ ] **Step 11: Cline** (`crates/executors/src/executors/cline.rs`)

Add inside `impl Cline`:

```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let mut builder = CommandBuilder::new("npx -y cline@2.8.1");
        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model]);
        }
        apply_overrides(builder, &self.cmd)
    }
```

Removed: `--acp`.

- [ ] **Step 12: Simple ACP agents (no user params)**

These agents only have `base_command + ACP flag + apply_overrides`. The interactive version is just `base_command + apply_overrides`.

**auggie.rs** — Add inside `impl Auggie`:
```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("npx -y @augmentcode/auggie@0.19.0");
        apply_overrides(builder, &self.cmd)
    }
```

**autohand.rs** — Add inside `impl Autohand`:
```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("npx -y @autohandai/autohand-acp@0.2.1");
        apply_overrides(builder, &self.cmd)
    }
```

**crow_cli.rs** — Add inside `impl CrowCli`:
```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("uvx crow-cli");
        apply_overrides(builder, &self.cmd)
    }
```

**deepagents.rs** — Add inside `impl Deepagents` (no ACP flag to remove — base command IS the ACP tool):
```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("npx -y deepagents-acp@0.1.1");
        apply_overrides(builder, &self.cmd)
    }
```

**dimcode.rs** — Add inside `impl Dimcode`:
```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("npx -y dimcode@0.0.17");
        apply_overrides(builder, &self.cmd)
    }
```

**fast_agent.rs** — Add inside `impl FastAgent`:
```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("uvx fast-agent-acp==0.5.11");
        apply_overrides(builder, &self.cmd)
    }
```

**goose.rs** — Add inside `impl Goose`:
```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("goose");
        apply_overrides(builder, &self.cmd)
    }
```

**junie.rs** — Add inside `impl Junie`:
```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("junie");
        apply_overrides(builder, &self.cmd)
    }
```

**kimi.rs** — Add inside `impl Kimi`:
```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("kimi");
        apply_overrides(builder, &self.cmd)
    }
```

**minion_code.rs** — Add inside `impl MinionCode`:
```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("uvx minion-code@0.1.42");
        apply_overrides(builder, &self.cmd)
    }
```

**mistral_vibe.rs** — Add inside `impl MistralVibe`:
```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("mistral-vibe");
        apply_overrides(builder, &self.cmd)
    }
```

**nova.rs** — Add inside `impl Nova`:
```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("npx -y @compass-ai/nova@1.0.78");
        apply_overrides(builder, &self.cmd)
    }
```

**pi_acp.rs** — Add inside `impl PiAcp` (no ACP flag to remove — base command IS the ACP tool):
```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("npx -y pi-acp@0.0.23");
        apply_overrides(builder, &self.cmd)
    }
```

**qoder.rs** — Add inside `impl Qoder`:
```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("npx -y @qoder-ai/qodercli@0.1.31");
        apply_overrides(builder, &self.cmd)
    }
```

**stakpak.rs** — Add inside `impl Stakpak`:
```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("stakpak");
        apply_overrides(builder, &self.cmd)
    }
```

**codebuddy_code.rs** — Add inside `impl CodebuddyCode`:
```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("npx -y @tencent-ai/codebuddy-code@2.62.0");
        apply_overrides(builder, &self.cmd)
    }
```

**corust_agent.rs** — Add inside `impl CorustAgent`:
```rust
    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new("corust-agent");
        apply_overrides(builder, &self.cmd)
    }
```

- [ ] **Step 13: Verify all compiles**

Run: `cargo check -p executors`
Expected: Compiles successfully.

- [ ] **Step 14: Commit**

```bash
git add crates/executors/src/executors/
git commit -m "feat(executors): add build_interactive_command_builder to all executors"
```

---

### Task 3: Add `interactive_command()` on `CodingAgent` enum

**Files:**
- Modify: `crates/executors/src/executors/mod.rs`

- [ ] **Step 1: Add the method on the CodingAgent impl block**

In `crates/executors/src/executors/mod.rs`, add the following import at the top (with existing imports from `crate::command`):

```rust
use crate::command::{InteractiveCommand, format_interactive_command};
```

Then add this method inside the existing `impl CodingAgent` block (after the `capabilities()` method, around line 264):

```rust
    /// Build the interactive CLI command for this executor (without protocol params).
    /// Returns a single-line shell command with env vars prepended.
    pub fn interactive_command(&self) -> Result<InteractiveCommand, CommandBuildError> {
        match self {
            Self::ClaudeCode(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::CursorAgent(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::Amp(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::Droid(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::Codex(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::Opencode(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::Gemini(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::QwenCode(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::Copilot(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::Kilo(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::Cline(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::Auggie(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::Autohand(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::CrowCli(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::Deepagents(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::Dimcode(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::FastAgent(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::Goose(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::Junie(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::Kimi(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::MinionCode(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::MistralVibe(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::Nova(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::PiAcp(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::Qoder(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::Stakpak(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::CodebuddyCode(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            Self::CorustAgent(inner) => {
                let builder = inner.build_interactive_command_builder()?;
                format_interactive_command(&builder, &inner.cmd.env)
            }
            #[cfg(feature = "qa-mode")]
            Self::QaMock(_) => Ok(InteractiveCommand {
                command: "qa-mock".to_string(),
            }),
        }
    }
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p executors`
Expected: Compiles successfully.

- [ ] **Step 3: Add a test**

Add at the bottom of `crates/executors/src/executors/mod.rs` inside the existing `#[cfg(test)] mod tests` block. Since some executor structs have private fields (e.g. `ClaudeCode::approvals_service`), use `serde_json::from_value` to construct them:

```rust
    #[test]
    fn interactive_command_claude_code_strips_protocol_params() {
        let agent: CodingAgent = serde_json::from_value(serde_json::json!({
            "CLAUDE_CODE": {
                "model": "opus"
            }
        }))
        .unwrap();
        let result = agent.interactive_command().unwrap();
        assert!(result.command.contains("--model opus"));
        assert!(!result.command.contains("--output-format"));
        assert!(!result.command.contains("--input-format"));
        assert!(!result.command.contains("--permission-prompt-tool"));
        assert!(!result.command.contains("--verbose"));
        // Ensure -p (stdin prompt mode) is not present as a standalone arg
        assert!(!result.command.contains(" -p "));
        assert!(!result.command.ends_with(" -p"));
    }
```

- [ ] **Step 4: Run the test**

Run: `cargo test -p executors -- tests::interactive_command_claude_code_strips_protocol_params`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/executors/src/executors/mod.rs
git commit -m "feat(executors): add interactive_command() dispatch on CodingAgent enum"
```

---

### Task 4: Add the backend API route

**Files:**
- Modify: `crates/server/src/routes/config.rs`

- [ ] **Step 1: Add the route**

In the `router()` function in `crates/server/src/routes/config.rs`, add a new route after the existing `/profiles` route (around line 46):

```rust
        .route(
            "/profiles/{executor}/{variant}/interactive-command",
            get(get_interactive_command),
        )
```

- [ ] **Step 2: Add the handler**

Add this handler function at the end of `crates/server/src/routes/config.rs` (before or after the existing handler functions):

```rust
#[derive(Debug, Deserialize)]
struct InteractiveCommandParams {
    executor: BaseCodingAgent,
    variant: String,
}

async fn get_interactive_command(
    State(_deployment): State<DeploymentImpl>,
    Path(params): Path<InteractiveCommandParams>,
) -> ResponseJson<ApiResponse<executors::command::InteractiveCommand>> {
    let profiles = ExecutorConfigs::get_cached();
    let profile_id = ExecutorProfileId::with_variant(params.executor, params.variant);

    let agent = match profiles.get_coding_agent(&profile_id) {
        Some(agent) => agent,
        None => {
            return ResponseJson(ApiResponse::error("Executor profile not found"));
        }
    };

    match agent.interactive_command() {
        Ok(cmd) => ResponseJson(ApiResponse::success(cmd)),
        Err(e) => ResponseJson(ApiResponse::error(&format!(
            "Failed to build interactive command: {e}"
        ))),
    }
}
```

- [ ] **Step 3: Add missing import if needed**

Make sure `executors::command` is accessible. The existing imports at the top of `config.rs` already import from `executors::` — add `executors::command::InteractiveCommand` if the compiler requires it. The existing `use executors::profile::{ExecutorConfigs, ExecutorProfileId};` already brings in what we need for profile resolution.

- [ ] **Step 4: Verify it compiles**

Run: `cargo check -p server`
Expected: Compiles successfully.

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/routes/config.rs
git commit -m "feat(api): add GET /profiles/{executor}/{variant}/interactive-command endpoint"
```

---

### Task 5: Add the frontend API client method

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add `getInteractiveCommand` to `profilesApi`**

In `frontend/src/lib/api.ts`, find the `profilesApi` object (around line 1150) and add a new method:

```typescript
export const profilesApi = {
  load: async (): Promise<{ content: string; path: string }> => {
    const response = await makeRequest('/api/profiles');
    return handleApiResponse<{ content: string; path: string }>(response);
  },
  save: async (content: string): Promise<string> => {
    const response = await makeRequest('/api/profiles', {
      method: 'PUT',
      body: content,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return handleApiResponse<string>(response);
  },
  getInteractiveCommand: async (
    executor: string,
    variant: string
  ): Promise<{ command: string }> => {
    const response = await makeRequest(
      `/api/profiles/${encodeURIComponent(executor)}/${encodeURIComponent(variant)}/interactive-command`
    );
    return handleApiResponse<{ command: string }>(response);
  },
};
```

- [ ] **Step 2: Verify types**

Run: `pnpm run check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(api): add getInteractiveCommand client method"
```

---

### Task 6: Add "Copy Command" button in Agent Settings page

**Files:**
- Modify: `frontend/src/pages/settings/AgentSettings.tsx`
- Modify: `frontend/src/i18n/locales/en/settings.json`

- [ ] **Step 1: Add import for Copy and Check icons**

In `frontend/src/pages/settings/AgentSettings.tsx`, update the lucide-react import (line 29):

```typescript
import { ChevronDown, Loader2, GripVertical, Copy, Check } from 'lucide-react';
```

Also add the `profilesApi` import (add to existing imports):

```typescript
import { profilesApi } from '@/lib/api';
```

- [ ] **Step 2: Add copy state at the top of the component**

Inside the `AgentSettings` component function, find the state declarations (around lines 60-80) and add:

```typescript
const [commandCopied, setCommandCopied] = useState(false);
```

- [ ] **Step 3: Add the handler function**

Add inside the component, near the other handler functions:

```typescript
  const handleCopyCommand = async () => {
    try {
      const result = await profilesApi.getInteractiveCommand(
        selectedExecutorType,
        selectedConfiguration
      );
      await navigator.clipboard.writeText(result.command);
      setCommandCopied(true);
      setTimeout(() => setCommandCopied(false), 2000);
    } catch (err) {
      console.warn('Failed to copy command:', err);
    }
  };
```

- [ ] **Step 4: Add the Copy Command button next to the Delete button**

In the JSX, find the Delete button (around line 850). It's inside a closure `{(() => { ... })()}` that calculates `hasDependents`, `isLastConfig`, etc. Add the Copy Command button **before** the Delete button, still inside the same `return (...)`:

Change the return statement (around line 849) from:
```tsx
                      return (
                        <Button
                          variant="destructive"
                          ...
                        >
                          {t('settings.agents.editor.deleteText')}
                        </Button>
                      );
```

To:
```tsx
                      return (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-10"
                            onClick={handleCopyCommand}
                            disabled={profilesSaving}
                            title={t('settings.agents.editor.copyCommandTitle')}
                          >
                            {commandCopied ? (
                              <Check className="mr-1 h-4 w-4" />
                            ) : (
                              <Copy className="mr-1 h-4 w-4" />
                            )}
                            {commandCopied
                              ? t('settings.agents.editor.commandCopied')
                              : t('settings.agents.editor.copyCommand')}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-10"
                            onClick={() =>
                              openDeleteDialog(selectedConfiguration)
                            }
                            disabled={
                              profilesSaving ||
                              !currentExecutor ||
                              isLastConfig ||
                              hasDependents
                            }
                            title={
                              hasDependents
                                ? `Cannot delete: inherited by ${dependents.join(', ')}`
                                : isLastConfig
                                  ? t('settings.agents.editor.deleteTitle')
                                  : t('settings.agents.editor.deleteButton', {
                                      name: selectedConfiguration,
                                    })
                            }
                          >
                            {t('settings.agents.editor.deleteText')}
                          </Button>
                        </>
                      );
```

- [ ] **Step 5: Add i18n keys**

In `frontend/src/i18n/locales/en/settings.json`, find the `settings.agents.editor` section and add these keys:

```json
"copyCommand": "Copy Command",
"copyCommandTitle": "Copy the interactive CLI command for this configuration",
"commandCopied": "Copied!"
```

- [ ] **Step 6: Verify it compiles**

Run: `pnpm run check`
Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/settings/AgentSettings.tsx frontend/src/i18n/locales/en/settings.json
git commit -m "feat(ui): add Copy Command button in Agent Settings page"
```

---

### Task 7: Add "Copy Run Command" to task dropdown menu

**Files:**
- Modify: `frontend/src/components/ui/actions-dropdown.tsx`
- Modify: `frontend/src/i18n/locales/en/tasks.json`

- [ ] **Step 1: Add imports**

In `frontend/src/components/ui/actions-dropdown.tsx`, add to the imports:

```typescript
import { profilesApi } from '@/lib/api';
```

Also add `useState` to the React import (update the first line if needed):

```typescript
import { useState } from 'react';
```

- [ ] **Step 2: Add copy state and handler inside the component**

Inside the `ActionsDropdown` function, add after the existing handler functions (around line 128):

```typescript
  const [commandCopied, setCommandCopied] = useState(false);

  const handleCopyRunCommand = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!task) return;
    try {
      const result = await profilesApi.getInteractiveCommand(
        task.executor,
        task.variant ?? 'DEFAULT'
      );
      await navigator.clipboard.writeText(result.command);
      setCommandCopied(true);
      setTimeout(() => setCommandCopied(false), 2000);
    } catch (err) {
      console.warn('Failed to copy run command:', err);
    }
  };
```

- [ ] **Step 3: Add the menu item**

In the JSX, find the "Edit branch name" menu item (around line 182-186). Add the "Copy Run Command" item after it and before the `<DropdownMenuSeparator />`:

```tsx
              <DropdownMenuItem onClick={handleCopyRunCommand}>
                {commandCopied
                  ? t('actionsMenu.commandCopied')
                  : t('actionsMenu.copyRunCommand')}
              </DropdownMenuItem>
```

Place this right before `<DropdownMenuSeparator />` (around line 188).

- [ ] **Step 4: Add i18n keys**

In `frontend/src/i18n/locales/en/tasks.json`, find the `actionsMenu` section and add:

```json
"copyRunCommand": "Copy Run Command",
"commandCopied": "Copied!"
```

- [ ] **Step 5: Verify it compiles**

Run: `pnpm run check`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/actions-dropdown.tsx frontend/src/i18n/locales/en/tasks.json
git commit -m "feat(ui): add Copy Run Command to task dropdown menu"
```

---

### Task 8: Backend tests and final verification

**Files:**
- Modify: `crates/executors/src/executors/mod.rs` (add more tests)

- [ ] **Step 1: Add tests for several executor types**

Add to the existing `#[cfg(test)] mod tests` block in `crates/executors/src/executors/mod.rs`:

```rust
    #[test]
    fn interactive_command_gemini_strips_acp() {
        let agent: CodingAgent = serde_json::from_value(serde_json::json!({
            "GEMINI": {
                "model": "gemini-2.5-pro",
                "yolo": true
            }
        }))
        .unwrap();
        let result = agent.interactive_command().unwrap();
        assert!(result.command.contains("--model"));
        assert!(result.command.contains("--yolo"));
        assert!(!result.command.contains("--experimental-acp"));
        assert!(!result.command.contains("acp"));
    }

    #[test]
    fn interactive_command_codex_strips_app_server() {
        let agent: CodingAgent = serde_json::from_value(serde_json::json!({
            "CODEX": {
                "oss": true
            }
        }))
        .unwrap();
        let result = agent.interactive_command().unwrap();
        assert!(result.command.contains("--oss"));
        assert!(!result.command.contains("app-server"));
    }

    #[test]
    fn interactive_command_with_env_vars() {
        let agent: CodingAgent = serde_json::from_value(serde_json::json!({
            "CLAUDE_CODE": {
                "env": {
                    "ANTHROPIC_API_KEY": "sk-test"
                }
            }
        }))
        .unwrap();
        let result = agent.interactive_command().unwrap();
        assert!(result.command.starts_with("ANTHROPIC_API_KEY=sk-test"));
    }
```

- [ ] **Step 2: Run all tests**

Run: `cargo test -p executors`
Expected: All tests PASS.

- [ ] **Step 3: Full compile check**

Run: `cargo check --workspace`
Expected: Compiles successfully.

- [ ] **Step 4: Frontend check**

Run: `pnpm run check`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add crates/executors/src/executors/mod.rs
git commit -m "test(executors): add unit tests for interactive_command across executor types"
```
