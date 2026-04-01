-- Add index on workspaces.task_id to speed up correlated subqueries
-- in Task::find_by_project_id_with_attempt_status (join key for all 4 subqueries)
CREATE INDEX IF NOT EXISTS idx_workspaces_task_id ON workspaces(task_id);
