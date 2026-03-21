mod error;
mod types;

use std::collections::HashSet;

use db::models::{
    merge::{Merge, PrMerge},
    migration_state::{CreateMigrationState, EntityType, MigrationState, MigrationStatus},
    project::Project,
    task::Task,
    workspace::Workspace,
};
pub use error::MigrationError;
use sqlx::SqlitePool;
use tracing::info;
pub use types::*;
use uuid::Uuid;

const BATCH_SIZE: usize = 100;

pub struct MigrationService {
    sqlite_pool: SqlitePool,
}

impl MigrationService {
    pub fn new(sqlite_pool: SqlitePool) -> Self {
        Self { sqlite_pool }
    }

    pub async fn run_migration(
        &self,
        organization_id: Uuid,
        project_ids: HashSet<Uuid>,
    ) -> Result<MigrationReport, MigrationError> {
        let mut report = MigrationReport::default();

        info!(
            "Starting migration to organization {} for {} projects",
            organization_id,
            project_ids.len()
        );

        info!("Phase 1: Migrating projects...");
        self.migrate_projects(organization_id, &project_ids, &mut report)
            .await?;

        info!("Phase 2: Migrating tasks to issues...");
        self.migrate_tasks(&project_ids, &mut report).await?;

        info!("Phase 3: Migrating PR merges to pull requests...");
        self.migrate_pr_merges(&project_ids, &mut report).await?;

        info!("Phase 4: Migrating workspaces...");
        self.migrate_workspaces(&project_ids, &mut report).await?;

        info!(
            "Migration complete. Projects: {}/{}, Tasks: {}/{}, PRs: {}/{}, Workspaces: {}/{}",
            report.projects.migrated,
            report.projects.total,
            report.tasks.migrated,
            report.tasks.total,
            report.pr_merges.migrated,
            report.pr_merges.total,
            report.workspaces.migrated,
            report.workspaces.total
        );

        Ok(report)
    }

    pub async fn get_status(
        &self,
        project_ids: &HashSet<Uuid>,
    ) -> Result<MigrationReport, MigrationError> {
        let projects =
            MigrationState::find_by_entity_type(&self.sqlite_pool, EntityType::Project).await?;
        let tasks =
            MigrationState::find_by_entity_type(&self.sqlite_pool, EntityType::Task).await?;
        let pr_merges =
            MigrationState::find_by_entity_type(&self.sqlite_pool, EntityType::PrMerge).await?;
        let workspaces =
            MigrationState::find_by_entity_type(&self.sqlite_pool, EntityType::Workspace).await?;

        let projects: Vec<_> = projects
            .into_iter()
            .filter(|s| project_ids.contains(&s.local_id))
            .collect();

        Ok(MigrationReport {
            projects: Self::entity_report_from_states(&projects),
            tasks: Self::entity_report_from_states(&tasks),
            pr_merges: Self::entity_report_from_states(&pr_merges),
            workspaces: Self::entity_report_from_states(&workspaces),
            warnings: vec![],
        })
    }

    pub async fn resume_migration(
        &self,
        organization_id: Uuid,
        project_ids: HashSet<Uuid>,
    ) -> Result<MigrationReport, MigrationError> {
        MigrationState::reset_failed(&self.sqlite_pool).await?;
        self.run_migration(organization_id, project_ids).await
    }

    async fn migrate_projects(
        &self,
        organization_id: Uuid,
        project_ids: &HashSet<Uuid>,
        report: &mut MigrationReport,
    ) -> Result<(), MigrationError> {
        let all_projects = Project::find_all(&self.sqlite_pool).await?;
        let projects: Vec<_> = all_projects
            .into_iter()
            .filter(|p| project_ids.contains(&p.id))
            .collect();
        report.projects.total = projects.len();

        let mut pending_projects = Vec::new();
        for project in &projects {
            if let Some(existing) =
                MigrationState::find_by_entity(&self.sqlite_pool, EntityType::Project, project.id)
                    .await?
                && existing.status == MigrationStatus::Migrated
            {
                report.projects.skipped += 1;
                continue;
            }
            pending_projects.push(project.clone());
        }

        for chunk in pending_projects.chunks(BATCH_SIZE) {
            self.migrate_project_batch(organization_id, chunk, report)
                .await?;
        }

        Ok(())
    }

    async fn migrate_project_batch(
        &self,
        _organization_id: Uuid,
        projects: &[Project],
        _report: &mut MigrationReport,
    ) -> Result<(), MigrationError> {
        for project in projects {
            MigrationState::upsert(
                &self.sqlite_pool,
                &CreateMigrationState {
                    entity_type: EntityType::Project,
                    local_id: project.id,
                },
            )
            .await?;
        }

        Ok(())
    }

    async fn migrate_tasks(
        &self,
        project_ids: &HashSet<Uuid>,
        report: &mut MigrationReport,
    ) -> Result<(), MigrationError> {
        let all_tasks = Task::find_all(&self.sqlite_pool).await?;
        let tasks: Vec<_> = all_tasks
            .into_iter()
            .filter(|t| project_ids.contains(&t.project_id))
            .collect();
        report.tasks.total = tasks.len();

        let mut pending_tasks = Vec::new();
        for task in &tasks {
            if let Some(existing) =
                MigrationState::find_by_entity(&self.sqlite_pool, EntityType::Task, task.id).await?
                && existing.status == MigrationStatus::Migrated
            {
                report.tasks.skipped += 1;
                continue;
            }
            pending_tasks.push(task.clone());
        }

        for chunk in pending_tasks.chunks(BATCH_SIZE) {
            self.migrate_task_batch(chunk, report).await?;
        }

        Ok(())
    }

    async fn migrate_task_batch(
        &self,
        tasks: &[Task],
        _report: &mut MigrationReport,
    ) -> Result<(), MigrationError> {
        for task in tasks {
            MigrationState::upsert(
                &self.sqlite_pool,
                &CreateMigrationState {
                    entity_type: EntityType::Task,
                    local_id: task.id,
                },
            )
            .await?;
        }

        Ok(())
    }

    async fn migrate_pr_merges(
        &self,
        project_ids: &HashSet<Uuid>,
        report: &mut MigrationReport,
    ) -> Result<(), MigrationError> {
        let all_pr_merges = Merge::find_all_pr(&self.sqlite_pool).await?;

        let mut pr_merges = Vec::new();
        for pr_merge in all_pr_merges {
            if let Some(workspace) =
                Workspace::find_by_id(&self.sqlite_pool, pr_merge.workspace_id).await?
                && let Some(task) = Task::find_by_id(&self.sqlite_pool, workspace.task_id).await?
                && project_ids.contains(&task.project_id)
            {
                pr_merges.push(pr_merge);
            }
        }
        report.pr_merges.total = pr_merges.len();

        let mut pending_merges = Vec::new();
        for pr_merge in &pr_merges {
            if let Some(existing) =
                MigrationState::find_by_entity(&self.sqlite_pool, EntityType::PrMerge, pr_merge.id)
                    .await?
                && existing.status == MigrationStatus::Migrated
            {
                report.pr_merges.skipped += 1;
                continue;
            }
            pending_merges.push(pr_merge.clone());
        }

        for chunk in pending_merges.chunks(BATCH_SIZE) {
            self.migrate_pr_merge_batch(chunk, report).await?;
        }

        Ok(())
    }

    async fn migrate_pr_merge_batch(
        &self,
        pr_merges: &[PrMerge],
        _report: &mut MigrationReport,
    ) -> Result<(), MigrationError> {
        for pr_merge in pr_merges {
            MigrationState::upsert(
                &self.sqlite_pool,
                &CreateMigrationState {
                    entity_type: EntityType::PrMerge,
                    local_id: pr_merge.id,
                },
            )
            .await?;
        }

        Ok(())
    }

    async fn migrate_workspaces(
        &self,
        project_ids: &HashSet<Uuid>,
        report: &mut MigrationReport,
    ) -> Result<(), MigrationError> {
        let all_workspaces = Workspace::fetch_all(&self.sqlite_pool, None).await?;

        let mut workspaces = Vec::new();
        for workspace in all_workspaces {
            if let Some(task) = Task::find_by_id(&self.sqlite_pool, workspace.task_id).await?
                && project_ids.contains(&task.project_id)
            {
                workspaces.push(workspace);
            }
        }
        report.workspaces.total = workspaces.len();

        let mut pending_workspaces = Vec::new();
        for workspace in &workspaces {
            if let Some(existing) = MigrationState::find_by_entity(
                &self.sqlite_pool,
                EntityType::Workspace,
                workspace.id,
            )
            .await?
                && existing.status == MigrationStatus::Migrated
            {
                report.workspaces.skipped += 1;
                continue;
            }
            pending_workspaces.push(workspace.clone());
        }

        for chunk in pending_workspaces.chunks(BATCH_SIZE) {
            self.migrate_workspace_batch(chunk, report).await?;
        }

        Ok(())
    }

    async fn migrate_workspace_batch(
        &self,
        workspaces: &[Workspace],
        _report: &mut MigrationReport,
    ) -> Result<(), MigrationError> {
        for workspace in workspaces {
            MigrationState::upsert(
                &self.sqlite_pool,
                &CreateMigrationState {
                    entity_type: EntityType::Workspace,
                    local_id: workspace.id,
                },
            )
            .await?;
        }

        Ok(())
    }

    fn entity_report_from_states(states: &[MigrationState]) -> EntityReport {
        let mut report = EntityReport {
            total: states.len(),
            ..Default::default()
        };

        for state in states {
            match state.status {
                MigrationStatus::Migrated => report.migrated += 1,
                MigrationStatus::Failed => {
                    report.failed += 1;
                    if let Some(ref msg) = state.error_message {
                        report.errors.push(EntityError {
                            local_id: state.local_id,
                            error: msg.clone(),
                        });
                    }
                }
                MigrationStatus::Skipped => report.skipped += 1,
                MigrationStatus::Pending => {}
            }
        }

        report
    }
}
