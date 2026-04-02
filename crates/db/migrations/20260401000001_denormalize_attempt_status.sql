-- Add denormalized attempt status columns to tasks
ALTER TABLE tasks ADD COLUMN has_in_progress_attempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN last_attempt_failed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN executor TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN variant TEXT;

-- Backfill active tasks only
UPDATE tasks SET
  has_in_progress_attempt = CASE WHEN EXISTS (
    SELECT 1 FROM workspaces w
    JOIN sessions s ON s.workspace_id = w.id
    JOIN execution_processes ep ON ep.session_id = s.id
    WHERE w.task_id = tasks.id
      AND ep.status = 'running'
      AND ep.run_reason IN ('setupscript','cleanupscript','codingagent','commitmessage')
    LIMIT 1
  ) THEN 1 ELSE 0 END,
  last_attempt_failed = CASE WHEN (
    SELECT ep.status FROM workspaces w
    JOIN sessions s ON s.workspace_id = w.id
    JOIN execution_processes ep ON ep.session_id = s.id
    WHERE w.task_id = tasks.id
      AND ep.run_reason IN ('setupscript','cleanupscript','codingagent')
    ORDER BY ep.created_at DESC LIMIT 1
  ) IN ('failed','killed') THEN 1 ELSE 0 END,
  executor = COALESCE((
    SELECT s.executor FROM workspaces w
    JOIN sessions s ON s.workspace_id = w.id
    WHERE w.task_id = tasks.id
    ORDER BY s.created_at DESC LIMIT 1
  ), ''),
  variant = (
    SELECT JSON_EXTRACT(ep.executor_action, '$.typ.executor_profile_id.variant')
    FROM workspaces w
    JOIN sessions s ON s.workspace_id = w.id
    JOIN execution_processes ep ON ep.session_id = s.id
    WHERE w.task_id = tasks.id
      AND ep.run_reason IN ('setupscript','cleanupscript','codingagent')
      AND ep.dropped = 0
    ORDER BY ep.created_at DESC LIMIT 1
  )
WHERE status IN ('todo', 'inprogress', 'inreview');
