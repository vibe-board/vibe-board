-- Weak association: find merges by task without going through workspace
ALTER TABLE merges ADD COLUMN task_id BLOB REFERENCES tasks(id);

-- JSON text storing normalized entries from commit-message agent run
ALTER TABLE merges ADD COLUMN commit_message_conversation TEXT;

-- Index for future "find merges by task" queries
CREATE INDEX idx_merges_task_id ON merges(task_id);

-- Backfill task_id from existing data
UPDATE merges SET task_id = (
    SELECT w.task_id FROM workspaces w WHERE w.id = merges.workspace_id
);
