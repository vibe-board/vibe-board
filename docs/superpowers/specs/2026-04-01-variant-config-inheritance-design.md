# Variant Configuration Inheritance

## Problem

When multiple configurations (variants) under the same executor share environment variables or other settings, users must duplicate them in every variant. For example, if all CLAUDE_CODE variants need `ANTHROPIC_API_KEY`, it must be set in DEFAULT, OPUS, PLAN, etc. individually.

## Solution

Add reference-based inheritance to variant configurations. A variant can declare `inherit_from` pointing to another variant in the same executor. At runtime, the parent's full config is loaded first, then the child's explicitly-set fields override it.

**Single-layer only**: if variant A inherits from B, then A cannot be inherited by others. No recursive chains.

## Data Model

### New `VariantConfig` wrapper

Wrap `CodingAgent` in a new struct that carries the optional `inherit_from` field:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct VariantConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inherit_from: Option<String>,
    #[serde(flatten)]
    pub agent: CodingAgent,
}
```

### `ExecutorConfig` change

```rust
pub struct ExecutorConfig {
    #[serde(flatten)]
    pub configurations: HashMap<String, VariantConfig>,  // was HashMap<String, CodingAgent>
}
```

### JSON format (fully backward compatible)

```json
{
  "CLAUDE_CODE": {
    "DEFAULT": {
      "CLAUDE_CODE": {
        "dangerously_skip_permissions": true,
        "env": { "ANTHROPIC_API_KEY": "sk-xxx", "MY_PROXY": "http://proxy" }
      }
    },
    "OPUS": {
      "inherit_from": "DEFAULT",
      "CLAUDE_CODE": {
        "model": "opus",
        "env": { "MY_PROXY": "http://opus-proxy" }
      }
    },
    "PLAN": {
      "inherit_from": "DEFAULT",
      "CLAUDE_CODE": {
        "plan": true
      }
    }
  }
}
```

Existing JSON without `inherit_from` parses identically to today (field defaults to `None`).

### Resolved result for OPUS at runtime

```json
{
  "model": "opus",
  "dangerously_skip_permissions": true,
  "env": { "ANTHROPIC_API_KEY": "sk-xxx", "MY_PROXY": "http://opus-proxy" }
}
```

### Resolved result for PLAN at runtime

```json
{
  "plan": true,
  "dangerously_skip_permissions": true,
  "env": { "ANTHROPIC_API_KEY": "sk-xxx", "MY_PROXY": "http://proxy" }
}
```

## Merge Semantics

When resolving a variant with `inherit_from`:

1. Load the parent variant's `CodingAgent` (parent must not have `inherit_from` itself).
2. Overlay child's fields using these rules:
   - **Scalar `Option<T>` fields** (`model`, `plan`, `dangerously_skip_permissions`, etc.): child `Some` wins; child `None` inherits parent.
   - **`env` (`Option<HashMap<String, String>>`)**: deep merge — start with parent's env map, insert/overwrite with child's env entries. Child `Some({})` means explicitly empty overlay (parent keys still present). Child `None` means inherit parent's env entirely.
   - **`additional_params` (`Option<Vec<String>>`)**: child `Some` replaces entirely; child `None` inherits parent.
   - **`base_command_override` (`Option<String>`)**: child `Some` replaces; child `None` inherits parent.

### Implementation: `merge_coding_agent`

Since `CodingAgent` is an enum with many variants (`ClaudeCode`, `Amp`, `Gemini`, etc.), each with different fields, the merge function needs to work per-variant. The approach:

- Serialize both parent and child `CodingAgent` to `serde_json::Value`.
- Perform a JSON-level deep merge: for each key in child, if value is non-null, it overwrites parent. Special handling for `env` (object merge rather than replace).
- Deserialize the merged `Value` back to `CodingAgent`.

This avoids writing per-executor-type merge logic and automatically supports new executor types.

```rust
fn merge_coding_agent(parent: &CodingAgent, child: &CodingAgent) -> CodingAgent {
    let parent_val = serde_json::to_value(parent).unwrap();
    let child_val = serde_json::to_value(child).unwrap();
    let merged = json_deep_merge(parent_val, child_val);
    serde_json::from_value(merged).unwrap()
}

fn json_deep_merge(base: Value, overlay: Value) -> Value {
    match (base, overlay) {
        (Value::Object(mut base_map), Value::Object(overlay_map)) => {
            for (key, overlay_val) in overlay_map {
                let merged_val = if let Some(base_val) = base_map.remove(&key) {
                    // For "env" key specifically, deep merge the objects
                    // For other objects, overlay replaces entirely
                    if key == "env" {
                        json_deep_merge(base_val, overlay_val)
                    } else {
                        overlay_val
                    }
                } else {
                    overlay_val
                };
                base_map.insert(key, merged_val);
            }
            Value::Object(base_map)
        }
        (_, overlay) => overlay,
    }
}
```

## Validation Rules

Added to `validate_merged()`:

1. **Reference exists**: `inherit_from` must point to an existing variant within the same executor.
2. **No self-reference**: a variant cannot `inherit_from` itself.
3. **Single-layer only**: if variant A has `inherit_from`, no other variant may set `inherit_from` pointing to A. Equivalently: a variant that is referenced by `inherit_from` must not have `inherit_from` itself.
4. **Executor type match**: parent and child must wrap the same `CodingAgent` variant (both `CLAUDE_CODE`, not one `CLAUDE_CODE` and one `AMP`). This is already guaranteed by being in the same executor, but worth asserting.

## Resolution Integration

### `ExecutorConfig::get_variant` and `ExecutorConfig::get_default`

These methods currently return `Option<&CodingAgent>`. They need to return the **resolved** (merged) config instead of the raw stored config.

Change to:

```rust
pub fn resolve_variant(&self, variant: &str) -> Option<CodingAgent> {
    let config = self.configurations.get(variant)?;
    match &config.inherit_from {
        None => Some(config.agent.clone()),
        Some(parent_name) => {
            let parent = self.configurations.get(parent_name)?;
            Some(merge_coding_agent(&parent.agent, &config.agent))
        }
    }
}
```

Callers of `get_variant` / `get_default` (primarily `ExecutorConfigs::get_coding_agent`) switch to `resolve_variant`.

### `compute_overrides` and `merge_with_defaults`

These operate on `ExecutorConfigs` for persistence. They compare/merge at the `VariantConfig` level (including `inherit_from`), not the resolved level. No change to their merge logic needed — `VariantConfig` replaces `CodingAgent` as the map value, and serde handles the rest.

## UI Changes

### CreateConfigurationDialog

Currently supports "clone from" (copy). Add a second mode:

- **Clone** (existing): deep-copy all fields from source variant. No `inherit_from` set.
- **Inherit**: set `inherit_from` to the selected source variant. Only store the fields the user explicitly changes.

### AgentSettings form view

When the selected variant has `inherit_from`:
- Show a small badge/text above the form: "Inherits from {parent_name}".
- The form fields show the child's explicit values (possibly empty). Inherited values are not shown in the form — they are implicit.

### Variant list / delete guard

When attempting to delete a variant that is referenced by other variants' `inherit_from`:
- Show a warning listing dependent variants.
- Require user to either remove inheritance from dependents first, or convert them to clones before deleting.

## TypeScript Type Changes

`VariantConfig` needs to be exported via ts-rs so the frontend can read `inherit_from`:

```typescript
export type VariantConfig = {
  inherit_from?: string;
} & CodingAgent;  // flattened via serde
```

The frontend `ExecutorsMap` type alias and all code that reads `localParsedProfiles.executors[type][variant]` need to account for the optional `inherit_from` key sitting alongside the executor type key.

## Testing

- **Unit tests** for `merge_coding_agent`: scalar override, env deep merge, additional_params replace, no-op when child is empty.
- **Unit tests** for `resolve_variant`: no inheritance, single-layer inheritance, parent not found returns None.
- **Validation tests**: self-reference rejected, chain reference rejected, missing parent rejected.
- **Serialization round-trip**: JSON with `inherit_from` -> deserialize -> serialize -> identical JSON.
- **Backward compatibility**: existing `profiles.json` without `inherit_from` loads correctly.

## Migration

No migration needed. Existing JSON without `inherit_from` deserializes with the field as `None`, which means "no inheritance" — identical to current behavior.
