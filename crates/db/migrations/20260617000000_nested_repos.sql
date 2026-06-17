-- Nested repos via path containment (replaces .gitmodules submodule model).

-- 1. Project-level parent/child relationship (source of truth).
ALTER TABLE project_repos
    ADD COLUMN parent_project_repo_id BLOB
        REFERENCES project_repos (id) ON DELETE SET NULL;
ALTER TABLE project_repos
    ADD COLUMN nested_path TEXT;

-- 2. Rename the shipped submodule field on workspace_repos to the
--    relationship-neutral name. parent_workspace_repo_id stays as-is.
ALTER TABLE workspace_repos RENAME COLUMN submodule_path TO nested_path;
