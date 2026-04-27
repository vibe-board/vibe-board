# MiMoCode Executor Design

## Overview

Add `MimoCode` as a new `CodingAgent` variant in the vibe-kanban executor system. MiMoCode works identically to opencode but uses a different CLI command (`mimo`) and separate configuration directories. No npx installation support — the `mimo` command must be pre-installed.

## Key Differences from Opencode

| Aspect | Opencode | MiMoCode |
|---|---|---|
| Base command | `npx -y opencode-ai@1.2.24` | `mimo` |
| Server output prefix | `opencode server listening on ` | `mimocode server listening on ` |
| XDG config prefix | `opencode` | `mimocode` |
| XDG data/state prefix | `opencode` | `mimocode` |
| Home config dir | `.opencode` | `.mimocode` |
| Config file name | `opencode.json` / `opencode.jsonc` | `mimocode.json` / `mimocode.jsonc` |
| Env: permission | `OPENCODE_PERMISSION` | `MIMOCODE_PERMISSION` |
| Env: config content | `OPENCODE_CONFIG_CONTENT` | `MIMOCODE_CONFIG_CONTENT` |
| Env: server username | `OPENCODE_SERVER_USERNAME` | `MIMOCODE_SERVER_USERNAME` |
| Env: server password | `OPENCODE_SERVER_PASSWORD` | `MIMOCODE_SERVER_PASSWORD` |
| MCP `$schema` | `https://opencode.ai/config.json` | *(none)* |
| Install method | `npx -y opencode-ai@1.2.24` | Pre-installed `mimo` command |

## Implementation Approach

Full duplication of the opencode executor module, with all names and constants adapted for MiMoCode.

## Files to Create/Modify

### New: `crates/executors/src/executors/mimo_code.rs`

Copy of `opencode.rs` with:
- Struct `Opencode` → `MimoCode`
- `DEFAULT_OPENCODE_BASE` = `"npx -y opencode-ai@1.2.24"` → `DEFAULT_MIMOCODE_BASE` = `"mimo"`
- Server prefix string: `"opencode server listening on "` → `"mimocode server listening on "`
- All `OPENCODE_*` env vars → `MIMOCODE_*`
- XDG prefix `"opencode"` → `"mimocode"`
- Home dir `.opencode` → `.mimocode`
- Config file `opencode.json`/`opencode.jsonc` → `mimocode.json`/`mimocode.jsonc`

### New: `crates/executors/src/executors/mimo_code/` (directory)

Copy of `opencode/` sub-modules with renames:
- `types.rs`: `OpencodeExecutorEvent` → `MimoCodeExecutorEvent`
- `sdk.rs`: update imports/types to use `MimoCode*` names
- `normalize_logs.rs`: update imports/types
- `models.rs`: update imports/types
- `slash_commands.rs`: `OpencodeSlashCommand` → `MimoCodeSlashCommand`, `hardcoded_slash_commands` adapted for MiMoCode

### Modify: `crates/executors/src/executors/mod.rs`

1. Add `pub mod mimo_code;`
2. Import: `use crate::executors::mimo_code::MimoCode;`
3. Add `MimoCode` variant to `CodingAgent` enum
4. Add `MimoCode` match arm in `get_mcp_config()`:
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
5. Add `MimoCode` match arm in `capabilities()`:
   ```rust
   Self::MimoCode(_) => vec![
       BaseAgentCapability::SessionFork,
       BaseAgentCapability::ContextUsage,
   ],
   ```
6. Add `MimoCode` match arm in `interactive_command()`:
   ```rust
   Self::MimoCode(inner) => {
       let builder = inner.build_interactive_command_builder()?;
       format_interactive_command(&builder, &inner.cmd.env)
   }
   ```

### Regenerate: `shared/types.ts`

Run `pnpm run generate-types` to pick up the new `MIMO_CODE` variant.

### New: `docs/agents/mimo-code.mdx`

Documentation for setting up MiMoCode with vibe-kanban.

## Capabilities

- `SessionFork`: Yes — MiMoCode supports session continuation
- `ContextUsage`: Yes — MiMoCode reports token usage
- `SetupHelper`: No
- MCP config path: `~/.config/mimocode/mimocode.json` (or `.jsonc`)

## Testing

1. `cargo test --workspace` — ensure existing tests pass
2. `pnpm run generate-types` — verify TS types include `MIMOCODE`
3. `pnpm run check` — frontend type check passes
