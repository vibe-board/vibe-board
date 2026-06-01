# Repo Git Host Override — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Git Host" dropdown on Repo Settings (Auto / GitHub / GitLab / Azure DevOps) so users can manually pick the provider when URL heuristics + probe can't detect it (e.g., self-hosted GitLab on `code.company.com`). Show `Auto (detected: <X>)` to help users choose.

**Architecture:** New nullable column `host_provider_override` on `repos` table. Precedence is **override → URL heuristic → glab probe → Unknown** wherever provider is resolved (`RepoBranchStatus.host_provider` + `create_pr` handler). UI is a Radix `Select` next to `display_name` in `ReposSettings.tsx`.

**Tech Stack:** Rust (sqlx, ts-rs), React + TypeScript (Radix Select, i18next), SQLite migration.

**Spec reference:** Discussion in chat after GitLab provider implementation landed (commits `7797418b0`..`fae7b2f3b`).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `crates/db/migrations/20260529000000_add_host_provider_override_to_repos.sql` | Create | `ALTER TABLE repos ADD COLUMN host_provider_override TEXT` |
| `crates/db/src/models/repo.rs` | Modify | `Repo` + `UpdateRepo` get `host_provider_override: Option<ProviderKind>`; all 5 SELECT queries updated; `update()` SQL updated |
| `crates/server/src/routes/task_attempts.rs` | Modify | `host_provider` precedence: override → `detect_provider_from_url` |
| `crates/server/src/routes/task_attempts/pr.rs` | Modify | `create_pr` uses override to short-circuit `from_url_with_probe` |
| `frontend/src/pages/settings/ReposSettings.tsx` | Modify | Add Git Host `<Select>` to form, wire to update API, show `Auto (detected: X)` |
| `frontend/src/i18n/locales/en/settings.json` | Modify | Add 6 keys under `repos.gitHost.*` |
| `frontend/src/i18n/locales/zh-Hans/settings.json` | Modify | Same keys, Chinese |
| `shared/types.ts` | Auto-generated | Updated via `pnpm run generate-types` |

---

## Task 1: DB migration + Repo model field

**Files:**
- Create: `crates/db/migrations/20260529000000_add_host_provider_override_to_repos.sql`
- Modify: `crates/db/src/models/repo.rs`

- [ ] **Step 1: Create the migration**

Create `crates/db/migrations/20260529000000_add_host_provider_override_to_repos.sql`:

```sql
-- User override for git host provider detection. NULL means "auto-detect from URL".
-- Stored as snake_case ProviderKind string ('git_hub' | 'azure_dev_ops' | 'git_lab').
ALTER TABLE repos ADD COLUMN host_provider_override TEXT;
```

- [ ] **Step 2: Prepare SQLx offline cache**

Run: `pnpm run prepare-db`
Expected: regenerates `.sqlx/` query cache. The new column must be present.

- [ ] **Step 3: Add field to `Repo` struct**

In `crates/db/src/models/repo.rs`, find `pub struct Repo` (around line 19). Add the field:

```rust
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Repo {
    pub id: Uuid,
    pub path: PathBuf,
    pub name: String,
    pub display_name: String,
    pub setup_script: Option<String>,
    pub cleanup_script: Option<String>,
    pub archive_script: Option<String>,
    pub copy_files: Option<String>,
    pub parallel_setup_script: bool,
    pub dev_server_script: Option<String>,
    pub default_target_branch: Option<String>,
    pub default_working_dir: Option<String>,
    pub host_provider_override: Option<services::services::git_host::types::ProviderKind>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}
```

If the `db` crate doesn't already depend on `services`, you'll have a circular dependency. **In that case**, store as `Option<String>` and let the server crate parse it:

```rust
/// Snake-case `ProviderKind` string set by the user; NULL = auto-detect.
/// Validated at the API layer (server crate). Parsed via `serde_json::from_value`
/// at read sites in routes.
pub host_provider_override: Option<String>,
```

Verify which form compiles by reading `crates/db/Cargo.toml` — if `services` is not a dep, go with `Option<String>`.

- [ ] **Step 4: Update `UpdateRepo` struct**

Find `pub struct UpdateRepo` in the same file (search for it). Add the field with the same type:

```rust
#[serde(default, skip_serializing_if = "Option::is_none")]
pub host_provider_override: Option<HostProviderOverridePatch>,
```

Define `HostProviderOverridePatch` to allow distinguishing "leave unchanged" from "explicit unset":

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(untagged)]
pub enum HostProviderOverridePatch {
    /// Explicit set: a provider string or null
    Set(Option<String>),
}
```

**If this is overkill** (e.g., the existing update pattern just uses `Option<String>` for all nullable fields and "missing" = "unchanged"), match that pattern instead. Read the surrounding `UpdateRepo` fields like `setup_script: Option<String>` to confirm. If they treat `None` as "no change" then use the simple form:

```rust
pub host_provider_override: Option<String>,
```

But then the API can't *clear* the override — that's fine for v1; user can edit or destroy the repo to reset.

- [ ] **Step 5: Update all SELECT queries**

In `crates/db/src/models/repo.rs`, find every `SELECT` that lists Repo columns (use grep: `grep -n "FROM repos" crates/db/src/models/repo.rs`). There are 5+ sites:

- `find_by_id` (~line 159)
- `find_by_ids` (~line 184)
- `list_all` (~line 254)
- `list_by_recent_workspace_usage` (~line 278)
- `list_needing_name_fix` (~line 118) — this one returns `(id, name, path)` only; may not need the new col
- the `RETURNING` clause in `update()` (~line 309-400)

Add `host_provider_override` to the column list in each (alphabetical or after `default_working_dir` for grouping with optional config fields).

- [ ] **Step 6: Update `update()` SQL**

In the same file (around line 309), the `UPDATE repos SET ...` query needs:

```rust
sqlx::query_as!(
    Repo,
    r#"UPDATE repos
       SET display_name = $1,
           setup_script = $2,
           cleanup_script = $3,
           archive_script = $4,
           copy_files = $5,
           parallel_setup_script = $6,
           dev_server_script = $7,
           default_target_branch = $8,
           default_working_dir = $9,
           host_provider_override = $10,
           updated_at = datetime('now', 'subsec')
       WHERE id = $11
       RETURNING
           id as "id!: Uuid",
           path,
           name,
           display_name,
           setup_script,
           cleanup_script,
           archive_script,
           copy_files,
           parallel_setup_script,
           dev_server_script,
           default_target_branch,
           default_working_dir,
           host_provider_override,
           created_at as "created_at: DateTime<Utc>",
           updated_at as "updated_at: DateTime<Utc>"
       "#,
    payload.display_name,
    payload.setup_script,
    payload.cleanup_script,
    payload.archive_script,
    payload.copy_files,
    payload.parallel_setup_script,
    payload.dev_server_script,
    payload.default_target_branch,
    payload.default_working_dir,
    payload.host_provider_override,
    id,
)
```

Note the parameter count goes from 10 to 11.

The "merged state" block higher up in `update()` (where it copies fields from current Repo when the patch doesn't override) needs a matching merge line for `host_provider_override`.

- [ ] **Step 7: Verify compile + tests**

Run:
```bash
pnpm run prepare-db
cargo check --workspace
cargo test -p db
```
Expected: compiles + DB tests pass.

- [ ] **Step 8: Commit**

```bash
git add crates/db/migrations/20260529000000_add_host_provider_override_to_repos.sql crates/db/src/models/repo.rs .sqlx/
git commit -m "feat(db): add host_provider_override column to repos"
```

---

## Task 2: Server reads override with correct precedence

**Files:**
- Modify: `crates/server/src/routes/task_attempts.rs`
- Modify: `crates/server/src/routes/task_attempts/pr.rs`

- [ ] **Step 1: Update `host_provider` derivation in `get_task_attempt_branch_status`**

In `crates/server/src/routes/task_attempts.rs`, find the block (added in Task 11 of the GitLab plan) that sets `host_provider`. It currently looks like:

```rust
let host_provider = match git
    .resolve_remote_for_branch(&repo.path, &target_branch)
{
    Ok(remote) => {
        let kind = detect_provider_from_url(&remote.url);
        if kind == ProviderKind::Unknown { None } else { Some(kind) }
    }
    Err(_) => None,
};
```

Replace with override-first logic. If `Repo.host_provider_override` is stored as `Option<String>`, parse it here:

```rust
let host_provider = {
    // 1. Explicit user override wins
    let override_kind = repo
        .host_provider_override
        .as_deref()
        .and_then(|s| serde_json::from_value::<ProviderKind>(
            serde_json::Value::String(s.to_string())
        ).ok())
        .filter(|k| !matches!(k, ProviderKind::Unknown));

    // 2. Otherwise heuristic from the resolved remote URL
    override_kind.or_else(|| {
        match git.resolve_remote_for_branch(&repo.path, &target_branch) {
            Ok(remote) => {
                let kind = detect_provider_from_url(&remote.url);
                (!matches!(kind, ProviderKind::Unknown)).then_some(kind)
            }
            Err(_) => None,
        }
    })
};
```

If `Repo.host_provider_override` is `Option<ProviderKind>` (Task 1 took the typed path), simplify:

```rust
let host_provider = repo
    .host_provider_override
    .filter(|k| !matches!(k, ProviderKind::Unknown))
    .or_else(|| {
        match git.resolve_remote_for_branch(&repo.path, &target_branch) {
            Ok(remote) => {
                let kind = detect_provider_from_url(&remote.url);
                (!matches!(kind, ProviderKind::Unknown)).then_some(kind)
            }
            Err(_) => None,
        }
    });
```

- [ ] **Step 2: Update `create_pr` handler to use override**

In `crates/server/src/routes/task_attempts/pr.rs`, find the `from_url_with_probe` call (around line 269):

```rust
let git_host = match git_host::GitHostService::from_url_with_probe(
    &target_remote.url,
    &repo_path,
) {
```

Replace with override-first logic. Need to also fetch the `Repo` to read the override — check whether `repo` is already in scope (probably is, near line 196 the handler loads it).

```rust
// Honor user-set override; fall back to URL heuristic + glab probe.
let git_host = match repo.host_provider_override
    .as_ref()
    .and_then(|s| serde_json::from_value::<git_host::types::ProviderKind>(
        serde_json::Value::String(s.clone())
    ).ok())
{
    Some(git_host::types::ProviderKind::GitHub) => {
        git_host::GitHostService::GitHub(
            git_host::github::GitHubProvider::new()?
        )
    }
    Some(git_host::types::ProviderKind::AzureDevOps) => {
        git_host::GitHostService::AzureDevOps(
            git_host::azure::AzureDevOpsProvider::new()?
        )
    }
    Some(git_host::types::ProviderKind::GitLab) => {
        git_host::GitHostService::GitLab(
            git_host::gitlab::GitLabProvider::new()?
        )
    }
    Some(git_host::types::ProviderKind::Unknown) | None => {
        // Fall back to existing detection chain
        match git_host::GitHostService::from_url_with_probe(
            &target_remote.url,
            &repo_path,
        ) {
            Ok(host) => host,
            // ... existing error branches kept
```

**Better**: extract a helper into `git_host/mod.rs` (`GitHostService::from_provider_kind(kind) -> Result<Self, GitHostError>`) so the handler doesn't reach into provider constructors. Add it to mod.rs:

```rust
impl GitHostService {
    pub fn from_provider_kind(kind: ProviderKind) -> Result<Self, GitHostError> {
        match kind {
            ProviderKind::GitHub => Ok(Self::GitHub(github::GitHubProvider::new()?)),
            ProviderKind::AzureDevOps => Ok(Self::AzureDevOps(azure::AzureDevOpsProvider::new()?)),
            ProviderKind::GitLab => Ok(Self::GitLab(gitlab::GitLabProvider::new()?)),
            ProviderKind::Unknown => Err(GitHostError::UnsupportedProvider),
        }
    }
}
```

Then in `pr.rs`:

```rust
let git_host = match repo.host_provider_override
    .as_ref()
    .and_then(|s| /* parse to ProviderKind */)
    .filter(|k| !matches!(k, git_host::types::ProviderKind::Unknown))
{
    Some(kind) => git_host::GitHostService::from_provider_kind(kind)?,
    None => match git_host::GitHostService::from_url_with_probe(
        &target_remote.url,
        &repo_path,
    ) {
        Ok(host) => host,
        // ... existing match arms
    },
};
```

- [ ] **Step 3: Verify it compiles + tests**

Run:
```bash
cargo check --workspace
cargo test -p services -- git_host
cargo test -p server
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/routes/task_attempts.rs crates/server/src/routes/task_attempts/pr.rs crates/services/src/services/git_host/mod.rs
git commit -m "feat(routes): honor host_provider_override before URL detection"
```

---

## Task 3: Regenerate TypeScript types

**Files:**
- Modify: `shared/types.ts` (auto-generated)

- [ ] **Step 1: Run the type generator**

Run: `pnpm run generate-types`

- [ ] **Step 2: Verify new fields appear**

```bash
grep -n "host_provider_override" shared/types.ts
```

Expected: appears on both `Repo` and `UpdateRepo` types.

- [ ] **Step 3: Verify frontend type-checks**

Run: `pnpm run check`
Expected: passes (no consumers of the new field yet).

- [ ] **Step 4: Commit**

```bash
git add shared/types.ts
git commit -m "chore(types): regenerate after host_provider_override field"
```

---

## Task 4: Frontend Git Host dropdown

**Files:**
- Modify: `frontend/src/pages/settings/ReposSettings.tsx`

- [ ] **Step 1: Read existing form structure**

Read `frontend/src/pages/settings/ReposSettings.tsx` end-to-end (~480 lines). Understand:
- `RepoScriptsFormState` interface (line ~32)
- How `display_name` field is rendered (Input + Label pattern)
- Where the form state is initialized from the selected repo
- Where `attemptsApi`'s repo update is called (or wherever the update is wired)

- [ ] **Step 2: Add `host_provider_override` to form state**

Extend `RepoScriptsFormState`:

```typescript
interface RepoScriptsFormState {
  display_name: string;
  setup_script: string;
  parallel_setup_script: boolean;
  cleanup_script: string;
  copy_files: string;
  dev_server_script: string;
  host_provider_override: string; // '' | 'git_hub' | 'azure_dev_ops' | 'git_lab'
}
```

Initialize from selected repo (e.g., `selectedRepo.host_provider_override ?? ''`).

- [ ] **Step 3: Add detected-provider readout**

Find where the form already has access to detected provider info. Two options:

a. If `RepoBranchStatus` is available in this component (unlikely since this is settings, not the task page), read `host_provider` from there.

b. Call a hook that returns the detected provider for the selected repo. Likely needs a new tiny query — but to keep this task small, just derive it on the client from the repo's git remote URL via a new utility:

```typescript
import { detectProviderFromUrl } from '@/lib/providerDetection';
```

Create `frontend/src/lib/providerDetection.ts` as a JavaScript port of the backend heuristic (same anchored patterns):

```typescript
import type { ProviderKind } from 'shared/types';

export function detectProviderFromUrl(url: string | null | undefined): ProviderKind {
  if (!url) return 'unknown';
  const lower = url.toLowerCase();
  if (lower.includes('github.com')) return 'git_hub';
  if (
    lower.includes('dev.azure.com') ||
    lower.includes('.visualstudio.com') ||
    lower.includes('ssh.dev.azure.com') ||
    lower.includes('/_git/')
  ) return 'azure_dev_ops';
  if (lower.includes('github.')) return 'git_hub';
  if (
    lower.includes('//gitlab.') ||
    lower.includes('@gitlab.') ||
    lower.includes('.gitlab.')
  ) return 'git_lab';
  return 'unknown';
}
```

Now, **does the frontend know the repo's git remote URL?** Probably not — `Repo` model has `path` (filesystem) not remote URL. **Quick fix**: just don't show the detected hint in this initial implementation. The dropdown still works; the user picks what they know. The label can read "Git Host" with options `Auto / GitHub / GitLab / Azure DevOps` without the `(detected: ...)` annotation.

**Updated decision for v1**: skip the detection readout. Just expose the dropdown. If users complain they don't know what their detected provider is, add the readout later (it needs a new API endpoint to surface the resolved provider per repo).

So Steps 3 above is replaced: **no provider-detection import needed**. Just add the static dropdown.

- [ ] **Step 4: Render the `<Select>` in the form**

After the `display_name` Input (around line 298-330 per the explore report), add:

```tsx
<div className="space-y-2">
  <Label htmlFor="git-host-override">{t('repos.gitHost.label')}</Label>
  <Select
    value={formState.host_provider_override || 'auto'}
    onValueChange={(value) =>
      setFormState((s) => ({
        ...s,
        host_provider_override: value === 'auto' ? '' : value,
      }))
    }
  >
    <SelectTrigger id="git-host-override">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="auto">{t('repos.gitHost.auto')}</SelectItem>
      <SelectItem value="git_hub">{t('repos.gitHost.github')}</SelectItem>
      <SelectItem value="git_lab">{t('repos.gitHost.gitlab')}</SelectItem>
      <SelectItem value="azure_dev_ops">{t('repos.gitHost.azure')}</SelectItem>
    </SelectContent>
  </Select>
  <p className="text-xs text-muted-foreground">
    {t('repos.gitHost.helper')}
  </p>
</div>
```

(Match the existing form-row styling — look at an adjacent field like `display_name` for the exact wrapper classes.)

- [ ] **Step 5: Wire to update payload**

When the form is submitted (find the existing `update()` call to `attemptsApi.repos.update(...)`), include the new field:

```typescript
host_provider_override: formState.host_provider_override || null,
```

- [ ] **Step 6: Verify it type-checks**

Run: `pnpm run check`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/settings/ReposSettings.tsx
git commit -m "feat(ui): add Git Host dropdown to Repo Settings"
```

---

## Task 5: i18n

**Files:**
- Modify: `frontend/src/i18n/locales/en/settings.json`
- Modify: `frontend/src/i18n/locales/zh-Hans/settings.json`

- [ ] **Step 1: Add English keys**

In `frontend/src/i18n/locales/en/settings.json`, locate the `repos` block (the one used by `ReposSettings.tsx`). Add:

```json
"gitHost": {
  "label": "Git Host",
  "auto": "Auto (detect from remote URL)",
  "github": "GitHub",
  "gitlab": "GitLab",
  "azure": "Azure DevOps",
  "helper": "Override automatic detection. Use this for self-hosted GitLab instances on uncommon domains (e.g., code.company.com)."
}
```

- [ ] **Step 2: Add Chinese keys**

In `frontend/src/i18n/locales/zh-Hans/settings.json`, in the same `repos` block, add:

```json
"gitHost": {
  "label": "Git 托管",
  "auto": "自动（从 remote URL 检测）",
  "github": "GitHub",
  "gitlab": "GitLab",
  "azure": "Azure DevOps",
  "helper": "覆盖自动检测。在使用非常规域名的自托管 GitLab 实例（如 code.company.com）时使用。"
}
```

- [ ] **Step 3: Verify JSON parses**

```bash
node -e "JSON.parse(require('fs').readFileSync('frontend/src/i18n/locales/en/settings.json', 'utf8'))"
node -e "JSON.parse(require('fs').readFileSync('frontend/src/i18n/locales/zh-Hans/settings.json', 'utf8'))"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/i18n/locales/en/settings.json frontend/src/i18n/locales/zh-Hans/settings.json
git commit -m "i18n(settings): add repos.gitHost keys (en, zh-Hans)"
```

---

## Task 6: Verification

**Files:** None modified.

- [ ] **Step 1: Full test suite**

Run:
```bash
cargo test --workspace
pnpm run check
pnpm run lint
```
Expected: all green (no NEW lint errors).

- [ ] **Step 2: Manual UI test**

1. Start `pnpm run dev`
2. Open Settings → Repos
3. Select any existing repo
4. **Expected**: "Git Host" dropdown is visible, defaulting to "Auto (detect from remote URL)"
5. Change to "GitLab", save
6. Navigate to a task in that repo
7. **Expected**: GitOperations toolbar now shows "Create MR" (button switches) even if the repo's actual remote is e.g. a GitHub URL
8. Change back to "Auto", save
9. **Expected**: button reverts to the detected default

- [ ] **Step 3: Database sanity check**

```bash
sqlite3 ~/.config/vibe_kanban/db.sqlite "SELECT id, name, host_provider_override FROM repos LIMIT 5;"
```

Expected: column exists; rows you didn't touch are NULL.

---

## Self-Review Notes

- **Spec coverage:** Override field, override-precedence in both `branch-status` and `create_pr`, UI dropdown, i18n. ✅
- **Detection readout deferred:** Initial plan called for "Auto (detected: X)" hint. Postponed because frontend doesn't have remote URL in `Repo` model; would require either a new API or backend exposing remote URL on `Repo`. Documented in Task 4 Step 3.
- **`Option<ProviderKind>` vs `Option<String>`:** Plan handles both depending on whether `db` crate can depend on `services`. Task 1 Step 3 has the branch logic.
- **No new tests:** This is config plumbing — exercised in Task 6 manual flow. Adding integration tests for the precedence chain is reasonable follow-up but not blocking.

---

## Risks

1. **Circular crate dep**: If `db` can't import `services::ProviderKind`, falling back to `Option<String>` works but loses type safety at the boundary. Server-side parsing is needed at every read site (a small annoyance).
2. **`pr.rs` already-deep handler**: This handler is now wrapping a 4th conditional path on top of existing logic. If it gets noisier, consider extracting `resolve_git_host(repo, target_remote_url, repo_path) -> Result<GitHostService, ...>` into a small helper.
3. **Stale cache**: Once user sets override, the next branch-status poll (within ~5s) picks it up. No cache invalidation needed.

---

## Estimate

| Task | Files | Lines |
|---|---|---|
| 1. DB + Repo model | 2 (1 new, 1 modify) | ~50 |
| 2. Server precedence | 2-3 modify | ~80 |
| 3. Type regen | 1 (auto) | ~3 |
| 4. Frontend dropdown | 1 modify | ~50 |
| 5. i18n | 2 modify | ~20 |
| 6. Verify | none | manual |

**Total: ~200 lines + 1 migration. Half day with subagent-driven execution.**

---

## Critical Files

- `/home/wangqiying/projects/.vibe-board-workspaces/d8eb-pr/vibe-kanban/crates/db/src/models/repo.rs`
- `/home/wangqiying/projects/.vibe-board-workspaces/d8eb-pr/vibe-kanban/crates/db/migrations/`
- `/home/wangqiying/projects/.vibe-board-workspaces/d8eb-pr/vibe-kanban/crates/server/src/routes/task_attempts.rs`
- `/home/wangqiying/projects/.vibe-board-workspaces/d8eb-pr/vibe-kanban/crates/server/src/routes/task_attempts/pr.rs`
- `/home/wangqiying/projects/.vibe-board-workspaces/d8eb-pr/vibe-kanban/crates/services/src/services/git_host/mod.rs` (new helper `from_provider_kind`)
- `/home/wangqiying/projects/.vibe-board-workspaces/d8eb-pr/vibe-kanban/frontend/src/pages/settings/ReposSettings.tsx`
- `/home/wangqiying/projects/.vibe-board-workspaces/d8eb-pr/vibe-kanban/frontend/src/lib/api.ts` (verify update method already passes through new fields)
- `/home/wangqiying/projects/.vibe-board-workspaces/d8eb-pr/vibe-kanban/frontend/src/i18n/locales/{en,zh-Hans}/settings.json`
