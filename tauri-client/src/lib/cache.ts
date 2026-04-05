import Database from '@tauri-apps/plugin-sql';
import type { Project, Task } from '@shared/types';

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load('sqlite:offline_cache.db');
  }
  return db;
}

export async function cacheProjects(projects: Project[]): Promise<void> {
  const db = await getDb();
  for (const p of projects) {
    await db.execute(
      `INSERT OR REPLACE INTO projects (id, name, default_agent_working_dir, remote_project_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        p.id,
        p.name,
        p.default_agent_working_dir ?? null,
        p.remote_project_id ?? null,
        p.created_at,
        p.updated_at,
      ],
    );
  }
}

export async function getCachedProjects(): Promise<Project[]> {
  const db = await getDb();
  return db.select<Project[]>(
    'SELECT * FROM projects ORDER BY updated_at DESC',
  );
}

export async function cacheTasks(
  projectId: string,
  tasks: Task[],
): Promise<void> {
  const db = await getDb();
  for (const t of tasks) {
    await db.execute(
      `INSERT OR REPLACE INTO tasks
       (id, project_id, title, description, status, parent_workspace_id,
        created_at, updated_at, has_in_progress_attempt, last_attempt_failed,
        executor, variant)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        t.id,
        projectId,
        t.title,
        t.description ?? null,
        t.status,
        t.parent_workspace_id ?? null,
        t.created_at,
        t.updated_at,
        t.has_in_progress_attempt ? 1 : 0,
        t.last_attempt_failed ? 1 : 0,
        t.executor ?? '',
        t.variant ?? null,
      ],
    );
  }
}

export async function getCachedTasks(
  projectId: string,
): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.select<
    {
      id: string;
      project_id: string;
      title: string;
      description: string | null;
      status: string;
      parent_workspace_id: string | null;
      created_at: string;
      updated_at: string;
      has_in_progress_attempt: number;
      last_attempt_failed: number;
      executor: string;
      variant: string | null;
    }[]
  >('SELECT * FROM tasks WHERE project_id = $1 ORDER BY updated_at DESC', [
    projectId,
  ]);
  return rows.map((r) => ({
    ...r,
    has_in_progress_attempt: r.has_in_progress_attempt === 1,
    last_attempt_failed: r.last_attempt_failed === 1,
  })) as Task[];
}
