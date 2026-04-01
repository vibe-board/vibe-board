# Variant Configuration Inheritance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow variant configurations to inherit from a parent variant within the same executor, so shared settings (env vars, model, etc.) don't need duplication.

**Architecture:** Add a `VariantConfig` wrapper around `CodingAgent` with an optional `inherit_from` field. At runtime, `resolve_variant` merges parent config with child overrides using JSON-level deep merge. Single-layer only — a variant that inherits cannot itself be inherited.

**Tech Stack:** Rust (serde, serde_json, ts-rs), TypeScript/React (RJSF forms), shared type generation

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `crates/executors/src/profile.rs` | Add `VariantConfig`, change `ExecutorConfig.configurations` to `HashMap<String, VariantConfig>`, add `resolve_variant`, update `validate_merged`, update all callers |
| Modify | `crates/server/src/bin/generate_types.rs` | Export `VariantConfig` type to TypeScript |
| Modify | `frontend/src/components/dialogs/settings/CreateConfigurationDialog.tsx` | Add "Inherit" mode alongside existing "Clone" |
| Modify | `frontend/src/pages/settings/AgentSettings.tsx` | Show inheritance badge, handle `inherit_from` in config read/write, delete guard |

---

### Task 1: Add `VariantConfig` wrapper and update `ExecutorConfig`

**Files:**
- Modify: `crates/executors/src/profile.rs:121-173`

- [ ] **Step 1: Write failing test for VariantConfig deserialization**

Add at the bottom of `crates/executors/src/profile.rs`, inside a new `#[cfg(test)] mod tests { ... }` block:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn variant_config_without_inherit_from_deserializes() {
        let json = json!({
            "CLAUDE_CODE": {
                "DEFAULT": {
                    "CLAUDE_CODE": {
                        "dangerously_skip_permissions": true
                    }
                }
            }
        });
        let configs: ExecutorConfigs = serde_json::from_value(json).unwrap();
        let claude = configs.executors.get(&BaseCodingAgent::ClaudeCode).unwrap();
        let default = claude.configurations.get("DEFAULT").unwrap();
        assert!(default.inherit_from.is_none());
    }

    #[test]
    fn variant_config_with_inherit_from_deserializes() {
        let json = json!({
            "CLAUDE_CODE": {
                "DEFAULT": {
                    "CLAUDE_CODE": {
                        "dangerously_skip_permissions": true
                    }
                },
                "OPUS": {
                    "inherit_from": "DEFAULT",
                    "CLAUDE_CODE": {
                        "model": "opus"
                    }
                }
            }
        });
        let configs: ExecutorConfigs = serde_json::from_value(json).unwrap();
        let claude = configs.executors.get(&BaseCodingAgent::ClaudeCode).unwrap();
        let opus = claude.configurations.get("OPUS").unwrap();
        assert_eq!(opus.inherit_from, Some("DEFAULT".to_string()));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --workspace -p executors -- tests::variant_config`
Expected: compilation error — `VariantConfig` does not exist yet, `configurations` is `HashMap<String, CodingAgent>` not `HashMap<String, VariantConfig>`.

- [ ] **Step 3: Add `VariantConfig` struct and update `ExecutorConfig`**

In `crates/executors/src/profile.rs`, add the new struct just before `ExecutorConfig`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct VariantConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inherit_from: Option<String>,
    #[serde(flatten)]
    pub agent: CodingAgent,
}
```

Change `ExecutorConfig`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct ExecutorConfig {
    #[serde(flatten)]
    pub configurations: HashMap<String, VariantConfig>,
}
```

- [ ] **Step 4: Fix all compilation errors from the type change**

Every place that reads or writes `configurations` now gets `VariantConfig` instead of `CodingAgent`. Update each method in `ExecutorConfig`:

In `get_variant`:
```rust
pub fn get_variant(&self, variant: &str) -> Option<&CodingAgent> {
    self.configurations.get(variant).map(|vc| &vc.agent)
}
```

In `get_default`:
```rust
pub fn get_default(&self) -> Option<&CodingAgent> {
    self.configurations.get("DEFAULT").map(|vc| &vc.agent)
}
```

In `new_with_default`:
```rust
pub fn new_with_default(default_config: CodingAgent) -> Self {
    let mut configurations = HashMap::new();
    configurations.insert("DEFAULT".to_string(), VariantConfig {
        inherit_from: None,
        agent: default_config,
    });
    Self { configurations }
}
```

In `set_variant`:
```rust
pub fn set_variant(
    &mut self,
    variant_name: String,
    config: CodingAgent,
) -> Result<(), &'static str> {
    let key = canonical_variant_key(&variant_name);
    if key == "DEFAULT" {
        return Err(
            "Cannot override 'DEFAULT' variant using set_variant, use set_default instead",
        );
    }
    self.configurations.insert(key, VariantConfig {
        inherit_from: None,
        agent: config,
    });
    Ok(())
}
```

In `set_default`:
```rust
pub fn set_default(&mut self, config: CodingAgent) {
    self.configurations.insert("DEFAULT".to_string(), VariantConfig {
        inherit_from: None,
        agent: config,
    });
}
```

In `validate_merged`, update the line that reads `DEFAULT`:
```rust
let default_config = profile.configurations.get("DEFAULT").ok_or_else(|| {
    ProfileError::Validation(format!(
        "Executor '{executor_key}' is missing required 'default' configuration"
    ))
})?;

// Validate that the default agent type matches the executor key
if BaseCodingAgent::from(&default_config.agent) != *executor_key {
    return Err(ProfileError::Validation(format!(
        "Executor key '{executor_key}' does not match the agent variant '{}'", default_config.agent
    )));
}
```

In `compute_overrides`, the comparison `current_config != default_config` and the `.clone()` calls now operate on `VariantConfig` — this works as-is since `VariantConfig` derives `PartialEq` and `Clone`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test --workspace -p executors`
Expected: all tests pass, including the two new ones.

- [ ] **Step 6: Verify default_profiles.json still parses**

Run: `cargo test --workspace -p executors -- tests::variant_config`
Expected: PASS — existing JSON without `inherit_from` deserializes with `inherit_from: None`.

- [ ] **Step 7: Commit**

```bash
git add crates/executors/src/profile.rs
git commit -m "feat(config): add VariantConfig wrapper with inherit_from field"
```

---

### Task 2: Implement `merge_coding_agent` and `resolve_variant`

**Files:**
- Modify: `crates/executors/src/profile.rs`

- [ ] **Step 1: Write failing tests for merge and resolve**

Add to the `tests` module in `crates/executors/src/profile.rs`:

```rust
#[test]
fn resolve_variant_without_inheritance() {
    let json = json!({
        "CLAUDE_CODE": {
            "DEFAULT": {
                "CLAUDE_CODE": {
                    "dangerously_skip_permissions": true
                }
            }
        }
    });
    let configs: ExecutorConfigs = serde_json::from_value(json).unwrap();
    let claude = configs.executors.get(&BaseCodingAgent::ClaudeCode).unwrap();
    let resolved = claude.resolve_variant("DEFAULT");
    assert!(resolved.is_some());
}

#[test]
fn resolve_variant_inherits_scalar_fields() {
    let json = json!({
        "CLAUDE_CODE": {
            "DEFAULT": {
                "CLAUDE_CODE": {
                    "dangerously_skip_permissions": true
                }
            },
            "OPUS": {
                "inherit_from": "DEFAULT",
                "CLAUDE_CODE": {
                    "model": "opus"
                }
            }
        }
    });
    let configs: ExecutorConfigs = serde_json::from_value(json).unwrap();
    let claude = configs.executors.get(&BaseCodingAgent::ClaudeCode).unwrap();
    let resolved = claude.resolve_variant("OPUS").unwrap();

    // Serialize to check merged fields
    let val = serde_json::to_value(&resolved).unwrap();
    let inner = val.get("CLAUDE_CODE").unwrap();
    assert_eq!(inner.get("model").unwrap(), "opus");
    assert_eq!(inner.get("dangerously_skip_permissions").unwrap(), true);
}

#[test]
fn resolve_variant_deep_merges_env() {
    let json = json!({
        "CLAUDE_CODE": {
            "DEFAULT": {
                "CLAUDE_CODE": {
                    "env": {
                        "API_KEY": "default-key",
                        "PROXY": "http://default"
                    }
                }
            },
            "OPUS": {
                "inherit_from": "DEFAULT",
                "CLAUDE_CODE": {
                    "model": "opus",
                    "env": {
                        "PROXY": "http://opus"
                    }
                }
            }
        }
    });
    let configs: ExecutorConfigs = serde_json::from_value(json).unwrap();
    let claude = configs.executors.get(&BaseCodingAgent::ClaudeCode).unwrap();
    let resolved = claude.resolve_variant("OPUS").unwrap();

    let val = serde_json::to_value(&resolved).unwrap();
    let inner = val.get("CLAUDE_CODE").unwrap();
    let env = inner.get("env").unwrap();
    assert_eq!(env.get("API_KEY").unwrap(), "default-key");
    assert_eq!(env.get("PROXY").unwrap(), "http://opus");
}

#[test]
fn resolve_variant_missing_parent_returns_none() {
    let json = json!({
        "CLAUDE_CODE": {
            "DEFAULT": {
                "CLAUDE_CODE": {}
            },
            "BAD": {
                "inherit_from": "NONEXISTENT",
                "CLAUDE_CODE": {}
            }
        }
    });
    let configs: ExecutorConfigs = serde_json::from_value(json).unwrap();
    let claude = configs.executors.get(&BaseCodingAgent::ClaudeCode).unwrap();
    assert!(claude.resolve_variant("BAD").is_none());
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --workspace -p executors -- tests::resolve_variant`
Expected: compilation error — `resolve_variant` method does not exist.

- [ ] **Step 3: Implement `json_deep_merge` and `merge_coding_agent`**

Add these free functions in `crates/executors/src/profile.rs` (above the `impl ExecutorConfig` block):

```rust
use serde_json::Value;

/// Deep-merge two JSON values. `overlay` wins for scalar fields.
/// For the `env` key specifically, objects are merged (overlay keys win).
/// For all other object keys, overlay replaces entirely.
fn json_deep_merge(base: Value, overlay: Value) -> Value {
    match (base, overlay) {
        (Value::Object(mut base_map), Value::Object(overlay_map)) => {
            for (key, overlay_val) in overlay_map {
                let merged_val = if let Some(base_val) = base_map.remove(&key) {
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

/// Merge a parent CodingAgent with a child CodingAgent.
/// Child's explicitly-set fields override parent. The `env` HashMap
/// is deep-merged (child keys override parent keys).
fn merge_coding_agent(parent: &CodingAgent, child: &CodingAgent) -> CodingAgent {
    let parent_val = serde_json::to_value(parent).expect("parent serializes");
    let child_val = serde_json::to_value(child).expect("child serializes");
    let merged = json_deep_merge(parent_val, child_val);
    serde_json::from_value(merged).expect("merged value deserializes")
}
```

- [ ] **Step 4: Add `resolve_variant` method to `ExecutorConfig`**

Add inside `impl ExecutorConfig`:

```rust
/// Resolve a variant's configuration, applying inheritance if `inherit_from` is set.
/// Returns the fully-merged CodingAgent, or None if the variant (or its parent) is missing.
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

- [ ] **Step 5: Update `get_coding_agent` to use `resolve_variant`**

In `impl ExecutorConfigs`, change `get_coding_agent`:

```rust
pub fn get_coding_agent(&self, executor_profile_id: &ExecutorProfileId) -> Option<CodingAgent> {
    self.executors
        .get(&executor_profile_id.executor)
        .and_then(|executor| {
            executor.resolve_variant(
                &executor_profile_id
                    .variant
                    .clone()
                    .unwrap_or("DEFAULT".to_string()),
            )
        })
}
```

Note: `resolve_variant` already returns an owned `CodingAgent`, so remove the `.cloned()` that was on the old version.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cargo test --workspace -p executors`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add crates/executors/src/profile.rs
git commit -m "feat(config): implement merge_coding_agent and resolve_variant for inheritance"
```

---

### Task 3: Add validation rules for `inherit_from`

**Files:**
- Modify: `crates/executors/src/profile.rs`

- [ ] **Step 1: Write failing validation tests**

Add to the `tests` module in `crates/executors/src/profile.rs`:

```rust
#[test]
fn validate_rejects_self_reference() {
    let json = json!({
        "executors": {
            "CLAUDE_CODE": {
                "DEFAULT": {
                    "CLAUDE_CODE": { "dangerously_skip_permissions": true }
                },
                "BAD": {
                    "inherit_from": "BAD",
                    "CLAUDE_CODE": {}
                }
            }
        }
    });
    let configs: ExecutorConfigs = serde_json::from_value(json).unwrap();
    let result = ExecutorConfigs::validate_merged(&configs);
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("cannot inherit from itself"));
}

#[test]
fn validate_rejects_missing_parent() {
    let json = json!({
        "executors": {
            "CLAUDE_CODE": {
                "DEFAULT": {
                    "CLAUDE_CODE": { "dangerously_skip_permissions": true }
                },
                "BAD": {
                    "inherit_from": "NONEXISTENT",
                    "CLAUDE_CODE": {}
                }
            }
        }
    });
    let configs: ExecutorConfigs = serde_json::from_value(json).unwrap();
    let result = ExecutorConfigs::validate_merged(&configs);
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("NONEXISTENT"));
}

#[test]
fn validate_rejects_chain_inheritance() {
    let json = json!({
        "executors": {
            "CLAUDE_CODE": {
                "DEFAULT": {
                    "CLAUDE_CODE": { "dangerously_skip_permissions": true }
                },
                "MID": {
                    "inherit_from": "DEFAULT",
                    "CLAUDE_CODE": { "model": "opus" }
                },
                "LEAF": {
                    "inherit_from": "MID",
                    "CLAUDE_CODE": {}
                }
            }
        }
    });
    let configs: ExecutorConfigs = serde_json::from_value(json).unwrap();
    let result = ExecutorConfigs::validate_merged(&configs);
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("already inherits"));
}

#[test]
fn validate_accepts_valid_inheritance() {
    let json = json!({
        "executors": {
            "CLAUDE_CODE": {
                "DEFAULT": {
                    "CLAUDE_CODE": { "dangerously_skip_permissions": true }
                },
                "OPUS": {
                    "inherit_from": "DEFAULT",
                    "CLAUDE_CODE": { "model": "opus" }
                },
                "PLAN": {
                    "inherit_from": "DEFAULT",
                    "CLAUDE_CODE": { "plan": true }
                }
            }
        }
    });
    let configs: ExecutorConfigs = serde_json::from_value(json).unwrap();
    let result = ExecutorConfigs::validate_merged(&configs);
    assert!(result.is_ok());
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --workspace -p executors -- tests::validate_rejects`
Expected: FAIL — validation does not check `inherit_from` yet.

- [ ] **Step 3: Add inheritance validation to `validate_merged`**

In `crates/executors/src/profile.rs`, add the following block inside `validate_merged`, after the existing reserved-word check (after the `config_name.starts_with("__")` block):

```rust
// Validate inherit_from references
for (config_name, variant_config) in &profile.configurations {
    if let Some(ref parent_name) = variant_config.inherit_from {
        // No self-reference
        if parent_name == config_name {
            return Err(ProfileError::Validation(format!(
                "Configuration '{executor_key}:{config_name}' cannot inherit from itself"
            )));
        }

        // Parent must exist
        let parent = profile.configurations.get(parent_name).ok_or_else(|| {
            ProfileError::Validation(format!(
                "Configuration '{executor_key}:{config_name}' inherits from '{parent_name}' which does not exist"
            ))
        })?;

        // Single-layer: parent must not itself inherit
        if parent.inherit_from.is_some() {
            return Err(ProfileError::Validation(format!(
                "Configuration '{executor_key}:{config_name}' inherits from '{parent_name}' which already inherits from another configuration. Only single-layer inheritance is allowed."
            )));
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --workspace -p executors`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/executors/src/profile.rs
git commit -m "feat(config): add validation rules for inherit_from (self-ref, missing parent, chain)"
```

---

### Task 4: Export `VariantConfig` to TypeScript and regenerate types

**Files:**
- Modify: `crates/server/src/bin/generate_types.rs`

- [ ] **Step 1: Add `VariantConfig` to the type generation list**

In `crates/server/src/bin/generate_types.rs`, find the line:

```rust
executors::profile::ExecutorConfig::decl(),
```

Add just before it:

```rust
executors::profile::VariantConfig::decl(),
```

- [ ] **Step 2: Regenerate TypeScript types**

Run: `pnpm run generate-types`
Expected: `shared/types.ts` is updated with a new `VariantConfig` type that has `inherit_from?: string` and is otherwise identical to `CodingAgent` (flattened).

- [ ] **Step 3: Verify the generated type looks correct**

Run: `grep -A 2 'VariantConfig' shared/types.ts`
Expected: output contains `inherit_from` field and the `CodingAgent` union flattened in.

- [ ] **Step 4: Run type checks**

Run: `pnpm run check`
Expected: PASS (or errors in frontend code that now needs to handle the new type — those are addressed in Tasks 5-6).

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/bin/generate_types.rs shared/types.ts
git commit -m "feat(config): export VariantConfig type to TypeScript"
```

---

### Task 5: Update `CreateConfigurationDialog` with Inherit mode

**Files:**
- Modify: `frontend/src/components/dialogs/settings/CreateConfigurationDialog.tsx`

- [ ] **Step 1: Add `creationMode` state and update result type**

In `CreateConfigurationDialog.tsx`, update `CreateConfigurationResult`:

```typescript
export type CreateConfigurationResult = {
  action: 'created' | 'canceled';
  configName?: string;
  cloneFrom?: string | null;
  inheritFrom?: string | null;
};
```

Inside the component, add state after the `cloneFrom` state:

```typescript
const [creationMode, setCreationMode] = useState<'blank' | 'clone' | 'inherit'>('blank');
```

- [ ] **Step 2: Replace the "Clone from" dropdown with mode selector + source selector**

Replace the existing "Clone from" `<div className="space-y-2">` block (the one with `<Label htmlFor="clone-from">`) with:

```tsx
<div className="space-y-2">
  <Label>Creation Mode</Label>
  <Select
    value={creationMode}
    onValueChange={(value) => {
      setCreationMode(value as 'blank' | 'clone' | 'inherit');
      if (value === 'blank') {
        setCloneFrom(null);
      }
    }}
  >
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="blank">Start blank</SelectItem>
      <SelectItem value="clone">Clone from existing</SelectItem>
      <SelectItem value="inherit">Inherit from existing</SelectItem>
    </SelectContent>
  </Select>
</div>

{creationMode !== 'blank' && (
  <div className="space-y-2">
    <Label htmlFor="source-config">
      {creationMode === 'clone' ? 'Clone from' : 'Inherit from'}
    </Label>
    <Select
      value={cloneFrom || ''}
      onValueChange={(value) => setCloneFrom(value || null)}
    >
      <SelectTrigger id="source-config">
        <SelectValue placeholder="Select a configuration" />
      </SelectTrigger>
      <SelectContent>
        {existingConfigs.map((configuration) => (
          <SelectItem key={configuration} value={configuration}>
            {configuration}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}
```

- [ ] **Step 3: Update `handleCreate` to pass `inheritFrom`**

Change the `handleCreate` function's resolve call:

```typescript
const handleCreate = () => {
  const validationError = validateConfigName(configName);
  if (validationError) {
    setError(validationError);
    return;
  }

  modal.resolve({
    action: 'created',
    configName: configName.trim(),
    cloneFrom: creationMode === 'clone' ? cloneFrom : null,
    inheritFrom: creationMode === 'inherit' ? cloneFrom : null,
  } as CreateConfigurationResult);
  modal.hide();
};
```

- [ ] **Step 4: Reset `creationMode` when dialog opens**

In the `useEffect` that resets form state, add:

```typescript
setCreationMode('blank');
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dialogs/settings/CreateConfigurationDialog.tsx
git commit -m "feat(ui): add Inherit mode to CreateConfigurationDialog"
```

---

### Task 6: Update `AgentSettings` to handle inheritance

**Files:**
- Modify: `frontend/src/pages/settings/AgentSettings.tsx`

- [ ] **Step 1: Update `createConfiguration` to handle `inheritFrom`**

In `AgentSettings.tsx`, find the `openCreateDialog` function. Update it to pass `inheritFrom`:

```typescript
const openCreateDialog = async () => {
  try {
    const result = await CreateConfigurationDialog.show({
      executorType: selectedExecutorType,
      existingConfigs: Object.keys(
        localParsedProfiles?.executors?.[selectedExecutorType] || {}
      ),
    });

    if (result.action === 'created' && result.configName) {
      createConfiguration(
        selectedExecutorType,
        result.configName,
        result.cloneFrom,
        result.inheritFrom
      );
    }
  } catch (error) {
    // User cancelled - do nothing
  }
};
```

Update `createConfiguration` to accept and handle `inheritFrom`:

```typescript
const createConfiguration = (
  executorType: string,
  configName: string,
  baseConfig?: string | null,
  inheritFrom?: string | null
) => {
  if (!localParsedProfiles || !localParsedProfiles.executors) return;

  const executorsMap =
    localParsedProfiles.executors as unknown as ExecutorsMap;

  let newVariant: Record<string, unknown>;
  if (inheritFrom) {
    // Inherit mode: set inherit_from, start with empty executor config
    newVariant = {
      inherit_from: inheritFrom,
      [executorType]: {},
    };
  } else {
    // Clone or blank mode (existing behavior)
    const base =
      baseConfig && executorsMap[executorType]?.[baseConfig]?.[executorType]
        ? executorsMap[executorType][baseConfig][executorType]
        : {};
    newVariant = {
      [executorType]: base,
    };
  }

  const updatedProfiles = {
    ...localParsedProfiles,
    executors: {
      ...localParsedProfiles.executors,
      [executorType]: {
        ...executorsMap[executorType],
        [configName]: newVariant,
      },
    },
  };

  markDirty(updatedProfiles);
  setSelectedConfiguration(configName);
};
```

- [ ] **Step 2: Show inheritance badge above config form**

In `AgentSettings.tsx`, find the block that renders `<ExecutorConfigForm>` (inside the IIFE `(() => { const executorsMap = ...`). Add an inheritance indicator just before `<ExecutorConfigForm>`:

```tsx
{(() => {
  const executorsMap =
    localParsedProfiles.executors as unknown as ExecutorsMap;
  const currentVariant = executorsMap[selectedExecutorType]?.[selectedConfiguration];
  const inheritFrom = currentVariant?.inherit_from as string | undefined;

  return (
    <>
      {inheritFrom && (
        <Alert>
          <AlertDescription>
            Inherits from <span className="font-mono font-medium">{inheritFrom}</span>. Only explicitly set fields are shown below — empty fields inherit from the parent.
          </AlertDescription>
        </Alert>
      )}
      {!!currentVariant?.[selectedExecutorType] && (
        <ExecutorConfigForm
          key={`${selectedExecutorType}-${selectedConfiguration}`}
          executor={selectedExecutorType}
          value={
            (currentVariant[selectedExecutorType] as Record<string, unknown>) || {}
          }
          onChange={(formData) =>
            handleExecutorConfigChange(
              selectedExecutorType,
              selectedConfiguration,
              formData
            )
          }
          onSave={handleExecutorConfigSave}
          disabled={profilesSaving}
          isSaving={profilesSaving}
          isDirty={isDirty}
        />
      )}
    </>
  );
})()}
```

- [ ] **Step 3: Update `handleExecutorConfigChange` to preserve `inherit_from`**

In `handleExecutorConfigChange`, preserve the `inherit_from` field when updating:

```typescript
const handleExecutorConfigChange = (
  executorType: string,
  configuration: string,
  formData: unknown
) => {
  if (!localParsedProfiles || !localParsedProfiles.executors) return;

  const executorsMap =
    localParsedProfiles.executors as unknown as ExecutorsMap;

  // Preserve inherit_from if it exists on the current variant
  const existing = executorsMap[executorType]?.[configuration];
  const inheritFrom = existing?.inherit_from;

  const updatedVariant: Record<string, unknown> = {
    [executorType]: formData,
  };
  if (inheritFrom) {
    updatedVariant.inherit_from = inheritFrom;
  }

  const updatedProfiles = {
    ...localParsedProfiles,
    executors: {
      ...localParsedProfiles.executors,
      [executorType]: {
        ...executorsMap[executorType],
        [configuration]: updatedVariant,
      },
    },
  };

  markDirty(updatedProfiles);
};
```

- [ ] **Step 4: Update `handleExecutorConfigSave` to preserve `inherit_from`**

Similarly, in `handleExecutorConfigSave`:

```typescript
const handleExecutorConfigSave = async (formData: unknown) => {
  if (!localParsedProfiles || !localParsedProfiles.executors) return;

  setSaveError(null);

  const executorsMap =
    localParsedProfiles.executors as unknown as ExecutorsMap;

  // Preserve inherit_from if it exists
  const existing = executorsMap[selectedExecutorType]?.[selectedConfiguration];
  const inheritFrom = existing?.inherit_from;

  const updatedVariant: Record<string, unknown> = {
    [selectedExecutorType]: formData,
  };
  if (inheritFrom) {
    updatedVariant.inherit_from = inheritFrom;
  }

  const updatedProfiles = {
    ...localParsedProfiles,
    executors: {
      ...localParsedProfiles.executors,
      [selectedExecutorType]: {
        ...localParsedProfiles.executors[selectedExecutorType],
        [selectedConfiguration]: updatedVariant,
      },
    },
  };

  setLocalParsedProfiles(updatedProfiles);

  try {
    const contentToSave = JSON.stringify(updatedProfiles, null, 2);
    await saveProfiles(contentToSave);
    setProfilesSuccess(true);
    setIsDirty(false);
    setTimeout(() => setProfilesSuccess(false), 3000);
    setLocalProfilesContent(contentToSave);
    reloadSystem();
  } catch (err: unknown) {
    console.error('Failed to save profiles:', err);
    setSaveError(t('settings.agents.errors.saveConfigFailed'));
  }
};
```

- [ ] **Step 5: Add delete guard for variants that are inherited by others**

In `AgentSettings.tsx`, update the delete button's `disabled` logic and the `openDeleteDialog` function. Find where the delete button is rendered and update its `disabled` condition:

```tsx
{(() => {
  const executorsMap = localParsedProfiles.executors as unknown as ExecutorsMap;
  const currentExecutor = executorsMap[selectedExecutorType] || {};
  const dependents = Object.entries(currentExecutor)
    .filter(([, vc]) => (vc as Record<string, unknown>)?.inherit_from === selectedConfiguration)
    .map(([name]) => name);
  const hasDependents = dependents.length > 0;
  const isLastConfig = Object.keys(currentExecutor).length <= 1;

  return (
    <Button
      variant="destructive"
      size="sm"
      className="h-10"
      onClick={() => openDeleteDialog(selectedConfiguration)}
      disabled={profilesSaving || !currentExecutor || isLastConfig || hasDependents}
      title={
        hasDependents
          ? `Cannot delete: inherited by ${dependents.join(', ')}`
          : isLastConfig
            ? t('settings.agents.editor.deleteTitle')
            : t('settings.agents.editor.deleteButton', { name: selectedConfiguration })
      }
    >
      {t('settings.agents.editor.deleteText')}
    </Button>
  );
})()}
```

- [ ] **Step 6: Run frontend checks**

Run: `pnpm run check && pnpm run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/settings/AgentSettings.tsx
git commit -m "feat(ui): handle inherit_from in AgentSettings — badge, preserve on save, delete guard"
```

---

### Task 7: Full integration test and backward compatibility check

**Files:**
- No new files

- [ ] **Step 1: Run full Rust test suite**

Run: `cargo test --workspace`
Expected: all tests pass.

- [ ] **Step 2: Run type generation check**

Run: `pnpm run generate-types:check`
Expected: PASS — generated types match.

- [ ] **Step 3: Run frontend checks**

Run: `pnpm run check && pnpm run lint`
Expected: PASS

- [ ] **Step 4: Verify backward compatibility by parsing default_profiles.json**

Run: `cargo test --workspace -p executors -- tests::variant_config_without_inherit`
Expected: PASS — existing profiles without `inherit_from` parse correctly.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -u
git commit -m "fix: address integration issues from variant config inheritance"
```

Only create this commit if there were changes; skip if everything passed cleanly.
