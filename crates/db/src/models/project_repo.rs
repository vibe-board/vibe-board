use std::path::Path;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::repo::Repo;

#[derive(Debug, Error)]
pub enum ProjectRepoError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Repository not found")]
    NotFound,
    #[error("Repository already exists in this project")]
    AlreadyExists,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct ProjectRepo {
    pub id: Uuid,
    pub project_id: Uuid,
    pub repo_id: Uuid,
    pub parent_project_repo_id: Option<Uuid>,
    pub nested_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateProjectRepo {
    pub display_name: String,
    pub git_repo_path: String,
}

impl ProjectRepo {
    pub async fn find_by_project_id(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectRepo,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      repo_id as "repo_id!: Uuid",
                      parent_project_repo_id as "parent_project_repo_id?: Uuid",
                      nested_path
               FROM project_repos
               WHERE project_id = $1"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_repo_id(
        pool: &SqlitePool,
        repo_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectRepo,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      repo_id as "repo_id!: Uuid",
                      parent_project_repo_id as "parent_project_repo_id?: Uuid",
                      nested_path
               FROM project_repos
               WHERE repo_id = $1"#,
            repo_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_repos_for_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Repo>, sqlx::Error> {
        sqlx::query_as!(
            Repo,
            r#"SELECT r.id as "id!: Uuid",
                      r.path,
                      r.name,
                      r.display_name,
                      r.setup_script,
                      r.cleanup_script,
                      r.archive_script,
                      r.copy_files,
                      r.parallel_setup_script as "parallel_setup_script!: bool",
                      r.dev_server_script,
                      r.default_target_branch,
                      r.default_working_dir,
                      r.host_provider_override,
                      r.created_at as "created_at!: DateTime<Utc>",
                      r.updated_at as "updated_at!: DateTime<Utc>"
               FROM repos r
               JOIN project_repos pr ON r.id = pr.repo_id
               WHERE pr.project_id = $1
               ORDER BY r.display_name ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_project_and_repo(
        pool: &SqlitePool,
        project_id: Uuid,
        repo_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectRepo,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      repo_id as "repo_id!: Uuid",
                      parent_project_repo_id as "parent_project_repo_id?: Uuid",
                      nested_path
               FROM project_repos
               WHERE project_id = $1 AND repo_id = $2"#,
            project_id,
            repo_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn add_repo_to_project(
        pool: &SqlitePool,
        project_id: Uuid,
        repo_path: &str,
        repo_name: &str,
    ) -> Result<Repo, ProjectRepoError> {
        let repo = Repo::find_or_create(pool, Path::new(repo_path), repo_name).await?;

        if Self::find_by_project_and_repo(pool, project_id, repo.id)
            .await?
            .is_some()
        {
            return Err(ProjectRepoError::AlreadyExists);
        }

        let id = Uuid::new_v4();
        sqlx::query!(
            r#"INSERT INTO project_repos (id, project_id, repo_id)
               VALUES ($1, $2, $3)"#,
            id,
            project_id,
            repo.id
        )
        .execute(pool)
        .await?;

        Self::recompute_nesting(pool, project_id).await?;

        Ok(repo)
    }

    /// Recompute parent/child nesting for every repo in the project based on
    /// on-disk path containment. Each repo's parent is the NEAREST project repo
    /// whose canonical path is a directory ancestor of this repo's canonical path;
    /// siblings get NULL. One materialized level (nearest ancestor).
    pub async fn recompute_nesting(pool: &SqlitePool, project_id: Uuid) -> Result<(), sqlx::Error> {
        let rows = sqlx::query!(
            r#"SELECT pr.id as "pr_id!: Uuid", r.path
               FROM project_repos pr
               JOIN repos r ON r.id = pr.repo_id
               WHERE pr.project_id = $1"#,
            project_id
        )
        .fetch_all(pool)
        .await?;

        // Canonicalize; fall back to the raw path if canonicalize fails (path may
        // not exist on this machine) so we never panic.
        let entries: Vec<(Uuid, std::path::PathBuf)> = rows
            .into_iter()
            .map(|row| {
                let raw = std::path::PathBuf::from(&row.path);
                let canon = std::fs::canonicalize(&raw).unwrap_or(raw);
                (row.pr_id, canon)
            })
            .collect();

        for (pr_id, path) in &entries {
            let mut best: Option<(Uuid, String, usize)> = None; // (parent_pr_id, rel, parent_depth)
            for (other_id, other_path) in &entries {
                if other_id == pr_id {
                    continue;
                }
                if let Some(rel) = utils::containment::relative_if_nested(other_path, path) {
                    let depth = other_path.components().count();
                    if best.as_ref().map(|(_, _, d)| depth > *d).unwrap_or(true) {
                        best = Some((*other_id, rel, depth));
                    }
                }
            }
            match best {
                Some((parent_id, rel, _)) => {
                    sqlx::query!(
                        r#"UPDATE project_repos SET parent_project_repo_id = $1, nested_path = $2 WHERE id = $3"#,
                        parent_id, rel, pr_id
                    ).execute(pool).await?;
                }
                None => {
                    sqlx::query!(
                        r#"UPDATE project_repos SET parent_project_repo_id = NULL, nested_path = NULL WHERE id = $1"#,
                        pr_id
                    ).execute(pool).await?;
                }
            }
        }
        Ok(())
    }

    pub async fn remove_repo_from_project(
        pool: &SqlitePool,
        project_id: Uuid,
        repo_id: Uuid,
    ) -> Result<(), ProjectRepoError> {
        let result = sqlx::query!(
            "DELETE FROM project_repos WHERE project_id = $1 AND repo_id = $2",
            project_id,
            repo_id
        )
        .execute(pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(ProjectRepoError::NotFound);
        }

        Self::recompute_nesting(pool, project_id).await?;

        Ok(())
    }

    pub async fn create(
        executor: impl sqlx::Executor<'_, Database = sqlx::Sqlite>,
        project_id: Uuid,
        repo_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as!(
            ProjectRepo,
            r#"INSERT INTO project_repos (id, project_id, repo_id)
               VALUES ($1, $2, $3)
               RETURNING id as "id!: Uuid",
                         project_id as "project_id!: Uuid",
                         repo_id as "repo_id!: Uuid",
                         parent_project_repo_id as "parent_project_repo_id?: Uuid",
                         nested_path"#,
            id,
            project_id,
            repo_id
        )
        .fetch_one(executor)
        .await
    }
}
