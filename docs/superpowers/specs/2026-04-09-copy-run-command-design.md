# Copy Run Command

Add a "Copy Run Command" feature that generates an interactive CLI command for any agent executor+variant configuration and copies it to the clipboard. The command excludes stream I/O and ACP protocol parameters since it targets manual terminal use.

## Button Placements

1. **Agent Settings page** — per-variant button next to the existing Delete button area in the form editor.
2. **Task dropdown menu** — new "Copy Run Command" item in the Attempt section of `ActionsDropdown`, using the task's `executor` and `variant`.

## Backend: New API Endpoint

### Route

```
GET /api/profiles/{executor}/{variant}/interactive-command
```

- `executor`: `BaseCodingAgent` enum value (e.g., `CLAUDE_CODE`)
- `variant`: Configuration variant name (e.g., `DEFAULT`, `OPUS`). Use `DEFAULT` when null.

### Response

```json
{
  "command": "ANTHROPIC_API_KEY=sk-xxx npx -y @anthropic-ai/claude-code@2.1.45 --model claude-sonnet-4-20250514"
}
```

Single-line shell command ready to copy-paste. Environment variables from the user's profile config (`cmd.env`) are prepended as `KEY=VALUE` pairs. No vibe-board internal variables (`VB_*`, `RUSTC_WRAPPER`, etc.).

### Implementation

Add a `build_interactive_command()` method to the `CodingAgent` enum. Each variant delegates to per-executor logic that builds the command without protocol params.

The `CodingAgent` enum (in `mod.rs`) wraps each executor struct. Add a method on the enum that pattern-matches and delegates to each executor's new `build_interactive_command_builder()`:

```rust
impl CodingAgent {
    pub fn interactive_command(&self) -> Result<InteractiveCommand, CommandBuildError>;
}

pub struct InteractiveCommand {
    pub command: String,  // formatted "ENV=val base args..." string
}
```

Each executor struct gets a `build_interactive_command_builder()` that mirrors `build_command_builder()` but omits protocol params. The method reuses `CommandBuilder` + `apply_overrides()`. For each executor category:

**Claude Code** — build without: `-p`, `--output-format=stream-json`, `--input-format=stream-json`, `--include-partial-messages`, `--replay-user-messages`, `--permission-prompt-tool=stdio`, `--permission-mode=bypassPermissions`, `--verbose`.
Keep: `--model`, `--agent`, `--dangerously-skip-permissions`, base_command_override, additional_params, env.

**Cursor** — build without: `-p`, `--output-format=stream-json`.
Keep: `--force`, `--model`, base_command_override, additional_params, env.

**Amp** — build without: `--execute`, `--stream-json`.
Keep: `--dangerously-allow-all`, base_command_override, additional_params, env.

**Droid** — base changes from `droid exec` to `droid`. Build without: `--output-format`, `stream-json`.
Keep: `--auto`, `--skip-permissions-unsafe`, `--model`, `--reasoning-effort`, base_command_override, additional_params, env.

**Codex** — build without: `app-server` subcommand.
Keep: `--oss`, base_command_override, additional_params, env. Note: Codex interactive mode uses the base command directly, not the `app-server` subcommand.

**Opencode** — build without: `serve`, `--hostname`, `127.0.0.1`, `--port`, `0`.
Keep: base_command_override, additional_params, env. Config is passed via env vars (`OPENCODE_CONFIG_CONTENT`, etc.).

**ACP agents** (Gemini, Qwen, Copilot, Kilo, Kimi, Goose, etc.) — build without their ACP flag (`--acp`, `--experimental-acp`, `acp` subcommand, `--acp=true`, `-x`).
Keep: all other user-facing params (`--model`, `--yolo`, `--allow-all-tools`, etc.), base_command_override, additional_params, env.

### Detailed ACP agent param removal

| Agent | Remove |
|-------|--------|
| Gemini | `--experimental-acp` |
| Qwen | `--acp` |
| Copilot | `--acp` |
| Auggie | `--acp` |
| Autohand | `acp` |
| Cline | `--acp` |
| CodebuddyCode | `--acp` |
| CorustAgent | `acp` |
| CrowCli | `acp` |
| Deepagents | (none — base command IS the ACP tool: `deepagents-acp`) |
| Dimcode | `acp` |
| FastAgent | `-x` |
| Goose | `acp` |
| Junie | `--acp=true` |
| Kilo | `acp` |
| Kimi | `acp` |
| MinionCode | `acp` |
| MistralVibe | `acp` |
| Nova | `acp` |
| PiAcp | (none — base command IS the ACP tool: `pi-acp`) |
| Qoder | `--acp` |
| Stakpak | `acp` |

For agents where the base command itself is the ACP tool (deepagents-acp, pi-acp), keep the command as-is — the user still runs the same CLI.

### Command formatting

1. Collect env vars from `cmd.env` (user-configured environment variables only).
2. Build the base command + user-facing params (without protocol params).
3. Format as: `KEY1=value1 KEY2=value2 base-command --param1 --param2`
4. Shell-quote values that contain spaces or special characters.

### Route handler

In `crates/server/src/routes/config.rs`, add a new route:

```rust
.route("/profiles/{executor}/{variant}/interactive-command", get(get_interactive_command))
```

The handler:
1. Load `ExecutorConfigs` from the cache.
2. Resolve the executor+variant to a `CodingAgent` (using `resolve_variant` with inheritance).
3. Call `interactive_command()` on the resolved agent.
4. Return the `InteractiveCommand` as JSON.

## Frontend

### API client

Add to `profilesApi` in `frontend/src/lib/api.ts`:

```typescript
getInteractiveCommand: async (executor: string, variant: string): Promise<{ command: string }> => {
  const response = await makeRequest(`/api/profiles/${executor}/${variant}/interactive-command`);
  return handleApiResponse<{ command: string }>(response);
}
```

### Agent Settings page button

In `AgentSettings.tsx`, add a "Copy Command" button next to the existing Delete Configuration button (around line 849). The button:
- Calls `profilesApi.getInteractiveCommand(selectedExecutorType, selectedConfiguration)`.
- Copies the `command` string to clipboard via `navigator.clipboard.writeText()`.
- Shows a brief toast/notification on success ("Command copied!").
- Is disabled when no valid configuration is selected.
- Uses a clipboard/copy icon (e.g., `Copy` from lucide-react).

### Task dropdown menu item

In `ActionsDropdown` (`frontend/src/components/ui/actions-dropdown.tsx`), add a "Copy Run Command" menu item in the Attempt section:
- Uses `task.executor` and `task.variant ?? 'DEFAULT'` to call the API.
- Copies result to clipboard, shows toast.
- Placed after "Edit branch name" and before the separator.
- Add i18n key: `actionsMenu.copyRunCommand`.

### Toast notification

Use the existing toast/notification system in the project for clipboard copy feedback. If no toast system exists, use a simple transient CSS-based feedback on the button itself (e.g., icon changes from clipboard to check for 2 seconds).

## Files to modify

### Backend
- `crates/executors/src/executors/mod.rs` — add `interactive_command()` to `CodingAgent` enum impl
- `crates/executors/src/executors/claude.rs` — add `build_interactive_command_builder()` method
- `crates/executors/src/executors/cursor.rs` — add `build_interactive_command_builder()` method
- `crates/executors/src/executors/amp.rs` — add `build_interactive_command_builder()` method
- `crates/executors/src/executors/droid.rs` — add `build_interactive_command_builder()` method
- `crates/executors/src/executors/codex.rs` — add `build_interactive_command_builder()` method
- `crates/executors/src/executors/opencode.rs` — add `build_interactive_command_builder()` method
- `crates/executors/src/executors/gemini.rs` — add `build_interactive_command_builder()` method
- All other ACP executor files — add `build_interactive_command_builder()` method
- `crates/executors/src/command.rs` — add `InteractiveCommand` struct, `format_interactive_command()` helper
- `crates/server/src/routes/config.rs` — add route + handler

### Frontend
- `frontend/src/lib/api.ts` — add `getInteractiveCommand` to `profilesApi`
- `frontend/src/pages/settings/AgentSettings.tsx` — add Copy Command button
- `frontend/src/components/ui/actions-dropdown.tsx` — add Copy Run Command menu item
- `frontend/src/i18n/locales/en/tasks.json` — add i18n key

### Types (auto-generated)
- `shared/types.ts` — will be updated by `pnpm run generate-types` if new TS types are derived

## Testing

- Backend: unit test for each executor's `build_interactive_command_builder()` confirming protocol params are absent and user config params are present.
- Backend: integration test for the API endpoint with a known profile.
- Frontend: manual verification — click button in settings, verify clipboard contains correct command. Click menu item in task dropdown, verify same.
