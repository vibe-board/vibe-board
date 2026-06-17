#[cfg(test)]
mod nested_repos_tests {
    use std::{path::Path, process::Command};

    use chrono::Utc;
    use db::models::repo::Repo;
    use services::services::workspace_manager::{
        NestedMount, RepoWorkspaceInput, WorkspaceManager,
    };
    use tempfile::TempDir;
    use uuid::Uuid;

    fn git(dir: &Path, args: &[&str]) {
        let ok = Command::new("git")
            .args(args)
            .current_dir(dir)
            .status()
            .unwrap()
            .success();
        assert!(ok, "git {:?} failed in {}", args, dir.display());
    }

    fn git_out(dir: &Path, args: &[&str]) -> String {
        let o = Command::new("git")
            .args(args)
            .current_dir(dir)
            .output()
            .unwrap();
        assert!(
            o.status.success(),
            "git {:?} failed in {}",
            args,
            dir.display()
        );
        String::from_utf8(o.stdout).unwrap().trim().to_string()
    }

    fn test_repo(path: &Path, name: &str) -> Repo {
        Repo {
            id: Uuid::new_v4(),
            path: path.to_path_buf(),
            name: name.to_string(),
            display_name: name.to_string(),
            setup_script: None,
            cleanup_script: None,
            archive_script: None,
            copy_files: None,
            parallel_setup_script: false,
            dev_server_script: None,
            default_target_branch: None,
            default_working_dir: None,
            host_provider_override: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[tokio::test]
    async fn nested_child_worktree_is_isolated_from_parent() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        // Parent repo A at root/open, ignoring child/.
        let parent = root.join("open");
        std::fs::create_dir_all(&parent).unwrap();
        git(&parent, &["init", "-b", "main"]);
        git(&parent, &["config", "user.email", "t@t.t"]);
        git(&parent, &["config", "user.name", "t"]);
        std::fs::write(parent.join(".gitignore"), "child/\n").unwrap();
        std::fs::write(parent.join("a.txt"), "open").unwrap();
        git(&parent, &["add", "-A"]);
        git(&parent, &["commit", "-m", "init open"]);

        // Child repo B independently inited at root/open/child.
        let child = parent.join("child");
        std::fs::create_dir_all(&child).unwrap();
        git(&child, &["init", "-b", "main"]);
        git(&child, &["config", "user.email", "t@t.t"]);
        git(&child, &["config", "user.name", "t"]);
        std::fs::write(child.join("b.txt"), "closed").unwrap();
        git(&child, &["add", "-A"]);
        git(&child, &["commit", "-m", "init child"]);

        let parent_input = RepoWorkspaceInput::new(test_repo(&parent, "open"), "main".into());
        let child_input = RepoWorkspaceInput::nested(
            test_repo(&child, "child"),
            "main".into(),
            NestedMount {
                parent_repo_name: "open".into(),
                rel_path: "child".into(),
            },
        );

        let ws = root.join("ws");
        let branch = "vb/test";
        WorkspaceManager::create_workspace(&ws, &[parent_input, child_input], branch)
            .await
            .expect("create_workspace should succeed");

        let parent_wt = ws.join("open");
        let child_wt = parent_wt.join("child");
        assert!(
            child_wt.join("b.txt").exists(),
            "child file missing at {}",
            child_wt.display()
        );
        assert_eq!(
            git_out(&child_wt, &["rev-parse", "--abbrev-ref", "HEAD"]),
            branch
        );
        assert_eq!(
            git_out(&parent_wt, &["rev-parse", "--abbrev-ref", "HEAD"]),
            branch
        );
        // ISOLATION: parent status must NOT show child/ (gitignored)
        let status = git_out(&parent_wt, &["status", "--porcelain"]);
        assert!(
            !status.contains("child"),
            "parent must not see child: {status}"
        );
    }
}
