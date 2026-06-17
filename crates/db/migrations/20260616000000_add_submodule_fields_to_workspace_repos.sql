-- Add submodule relationship metadata to workspace_repos.
-- A submodule's on-disk path is task-specific (lives inside the task's parent
-- worktree), so submodules are NOT inserted into the global path-UNIQUE repos
-- table. Instead we record the parent/child relationship and mount path here.
-- Both columns are nullable and additive: NULL for top-level repos.
ALTER TABLE workspace_repos ADD COLUMN parent_workspace_repo_id BLOB REFERENCES workspace_repos (id) ON DELETE CASCADE;
ALTER TABLE workspace_repos ADD COLUMN submodule_path TEXT;
