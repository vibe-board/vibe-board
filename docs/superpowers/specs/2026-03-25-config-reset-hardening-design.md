# Config Reset Hardening Design

**Date:** 2026-03-25
**Status:** Draft
**Scope:** Broad hardening — fix silent config reset bug + atomic writes + backup + resilient deserialization

## Problem

General settings (workspace directory, commit message config, git branch prefix, etc.) are silently reset to defaults. The config is stored server-side at `~/.config/vibe-board/config.json` with a version migration chain (v1→v10).

### Root causes

1. **Silent fallback to `Config::default()`**: Every version's `From<String>` implementation falls back to `Self::default()` on any deserialization or migration error. A single bad field (e.g., unknown enum variant from a newer version) nukes the entire config.

2. **Unconditional overwrite on startup**: `local-deployment/src/lib.rs:79` calls `save_config_to_file()` on every startup, persisting whatever was loaded — including defaults from a failed parse. The original file is gone.

3. **Non-atomic file writes**: `std::fs::write()` is used directly. A crash mid-write corrupts the file, which triggers problem #1 on next startup.

4. **No backup mechanism**: Unlike `profiles.json` (backed up in v6 migration), `config.json` has zero backup or recovery support.

5. **serde(default) silent fill**: All Config fields use `#[serde(default)]`. If the frontend sends incomplete JSON, missing fields are silently filled with defaults and written to disk.

## Design

Three layers: storage safety, resilient deserialization, and startup flow.

### Layer 1: Storage — Atomic Writes + Backup

#### Atomic writes

Replace `std::fs::write(path, data)` in `save_config_to_file` with:

1. Write to `config.json.tmp` in the same directory
2. `fsync` the temp file
3. `std::fs::rename("config.json.tmp", "config.json")` — atomic on POSIX; on Windows, use `MoveFileEx` with `MOVEFILE_REPLACE_EXISTING` or the `atomicwrites` crate for cross-platform support

If a crash happens mid-write, the original `config.json` is untouched. Stale `.tmp` files are ignored on startup.

#### Backup before migration

In `load_config_from_file`, when version mismatch is detected:

1. Copy `config.json` → `config.json.bak.{unix_timestamp}`
2. Proceed with migration
3. Save migrated config via atomic write

#### Backup on parse failure

If JSON parsing fails entirely:

1. Copy `config.json` → `config.json.bak.{unix_timestamp}`
2. Log warning with backup path
3. Return `Config::default()`

#### Cleanup

Keep at most 3 backup files. Delete oldest when creating a new one.

### Layer 2: Resilient Deserialization

#### Two-phase parsing

Replace the current `From<String>` pattern:

```
OLD: try typed v10 → try migration chain → default()
```

```
NEW:
1. Parse as serde_json::Value (valid JSON check only)
2. Extract config_version from Value
3. If version == "v10":
   - Deserialize Value → Config with serde(default) filling missing fields
   - Diff original Value keys vs known struct fields → store remainder in extra_fields sidecar
4. If version < "v10":
   - Backup file, run typed migration chain (existing code)
   - Migrated result gets extra_fields = empty map (older versions cannot have v10+ unknown fields)
5. If JSON parse fails entirely:
   - Backup file, return Config::default()
```

#### The extra_fields sidecar

Add to the Config struct a **skipped** field that does not participate in serde or ts-rs:

```rust
#[serde(skip)]
#[ts(skip)]
pub extra_fields: serde_json::Map<String, serde_json::Value>,
```

This field is populated manually during the two-phase parse: after deserializing known fields from the `serde_json::Value`, compute the diff between the original Value's keys and the known struct fields, and store the remainder in `extra_fields`.

On serialization (in `save_config_to_file`), merge `extra_fields` back into the JSON output:
1. Serialize `Config` to `serde_json::Value` (known fields only)
2. Merge `extra_fields` map into the top-level object
3. Write the merged Value to disk

This avoids `#[serde(flatten)]` which would break ts-rs type generation (ts-rs has no stable representation for flattened `Map<String, Value>` and would either fail compilation or produce `& Record<string, any>`, making the Config type untyped).

A v11 config loaded by a v10 binary keeps its v11-only fields through round-trips.

#### Per-field enum resilience

For `Vec<BaseCodingAgent>` fields (`agent_enabled`, `agent_order`), add a custom deserializer that skips unknown variants instead of failing the entire struct:

```rust
#[serde(default = "default_agent_enabled", deserialize_with = "deserialize_vec_skip_unknown")]
pub agent_enabled: Vec<BaseCodingAgent>,
```

This handles the scenario where a newer version adds an agent enum variant — older binaries just ignore it rather than resetting the whole config.

**Note:** Unknown variants are silently dropped from the Vec on deserialization. This is a one-way door: if a user runs a newer version, enables agent X, then downgrades, agent X is removed from the list. To mitigate, the custom deserializer should log a warning with the specific unknown variant strings. Full round-trip preservation of unknown enum values (e.g., storing raw strings in a sidecar) is deferred as a future improvement.

### Layer 3: Startup Flow

#### LoadOutcome enum

```rust
pub enum LoadOutcome {
    Loaded,                          // Parsed successfully, no changes
    Migrated { backup_path: PathBuf }, // Upgraded from older version
    ParseFailed { backup_path: PathBuf }, // JSON corrupt, backed up, using defaults
    FileNotFound,                    // No config file existed
}
```

`load_config_from_file` returns `(Config, LoadOutcome)`.

#### Conditional save on startup

In `local-deployment/src/lib.rs`, replace the unconditional `save_config_to_file` with:

```
match outcome {
    FileNotFound   → save (create new file)
    Migrated       → save (persist migration, backup already made)
    ParseFailed    → save (write defaults, backup already made)
    Loaded         → DON'T save (no changes needed)
}
```

Exception: if the `executor_profile` was auto-overridden (onboarding not acknowledged), save regardless.

## Files Changed

| File | Changes |
|------|---------|
| `crates/services/src/services/config/mod.rs` | Atomic write in `save_config_to_file`; `load_config_from_file` returns `(Config, LoadOutcome)`; add `backup_config_file()` helper; add `LoadOutcome` enum |
| `crates/services/src/services/config/versions/v10.rs` | Add `extra_fields` sidecar (`#[serde(skip)]`); rewrite `From<String>` with two-phase parse; add `deserialize_vec_skip_unknown`; update `Default` and `from_v9_config` |
| `crates/local-deployment/src/lib.rs` | Match on `LoadOutcome`, conditional save |
| `crates/server/src/routes/config.rs` | In `update_config`: read current in-memory config's `extra_fields`, carry them over to the incoming `new_config` before saving. This prevents the frontend (which has no knowledge of extra_fields) from stripping unknown fields on save. |
| `shared/types.ts` | Auto-generated via `pnpm run generate-types` — `extra_fields` is `#[ts(skip)]` so no TS type changes |

### Out of scope

- No changes to v1-v9 migration functions (only run on old configs). **Known limitation:** the old migration chain still cascades `default()` at each level — a corrupted v7 config silently becomes `v7::default() → v8 → v9 → v10`. The backup-before-migration mechanism mitigates this (the original file is preserved), but the migrated result may contain default values. A full fix of the old chain is deferred.
- No frontend error UI for parse failures (server-side log only)
- No changes to `ConfigProvider.tsx` (spread-based merge preserves known fields; extra_fields are invisible to the frontend)

### Guardrails

- `#[serde(deny_unknown_fields)]` must **never** be added to `Config` or any nested struct (`NotificationConfig`, `EditorConfig`, `GitHubConfig`). This would conflict with the two-phase parse resilience and the extra_fields preservation.
