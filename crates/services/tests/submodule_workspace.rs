#[cfg(test)]
mod submodule_workspace_tests {
    use std::{path::Path, process::Command};

    use chrono::Utc;
    use db::models::repo::Repo;
    use services::services::workspace_manager::{
        RepoWorkspaceInput, SUBMODULE_BASE_BRANCH, WorkspaceManager,
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

    // Capture stdout of a git command (trimmed).
    fn git_out(dir: &Path, args: &[&str]) -> String {
        let out = Command::new("git")
            .args(args)
            .current_dir(dir)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "git {:?} failed in {}",
            args,
            dir.display()
        );
        String::from_utf8(out.stdout).unwrap().trim().to_string()
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
    async fn submodule_is_materialized_nested_with_base_and_task_branch() {
        // Local-path (file://) submodules are blocked by git's default
        // `protocol.file.allow=user` security policy. Real-world submodules use
        // https/ssh so production code does not (and should not) override this.
        // For this hermetic test we inject the config via the GIT_CONFIG_* env
        // vars, which git applies to every child process — including the git
        // subprocesses spawned by the production submodule-init code path. This
        // is a test-harness concern only; no production code is modified.
        //
        // SAFETY: set_var is only unsafe due to data races with concurrent
        // getenv across threads. These vars are set once at the start of this
        // single test before any git subprocess is spawned, and are not read
        // by Rust code, so there is no observable race.
        unsafe {
            std::env::set_var("GIT_CONFIG_COUNT", "1");
            std::env::set_var("GIT_CONFIG_KEY_0", "protocol.file.allow");
            std::env::set_var("GIT_CONFIG_VALUE_0", "always");
        }

        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        // 1. Submodule source repo with one committed file, default branch main.
        let sub_src = root.join("sub_src");
        std::fs::create_dir_all(&sub_src).unwrap();
        git(&sub_src, &["init", "-b", "main"]);
        git(&sub_src, &["config", "user.email", "t@t.t"]);
        git(&sub_src, &["config", "user.name", "t"]);
        std::fs::write(sub_src.join("hello.txt"), "hi").unwrap();
        git(&sub_src, &["add", "-A"]);
        git(&sub_src, &["commit", "-m", "init sub"]);

        // 2. Parent repo, add submodule at libs/foo, commit.
        let parent = root.join("parent");
        std::fs::create_dir_all(&parent).unwrap();
        git(&parent, &["init", "-b", "main"]);
        git(&parent, &["config", "user.email", "t@t.t"]);
        git(&parent, &["config", "user.name", "t"]);
        git(
            &parent,
            &[
                "-c",
                "protocol.file.allow=always",
                "submodule",
                "add",
                sub_src.to_str().unwrap(),
                "libs/foo",
            ],
        );
        git(&parent, &["commit", "-m", "add submodule"]);

        // 3. create_workspace from the parent repo.
        let workspace_dir = root.join("ws");
        let repo = test_repo(&parent, "parent");
        let input = RepoWorkspaceInput::new(repo, "main".to_string());
        let branch = "vb/test-branch";
        WorkspaceManager::create_workspace(&workspace_dir, &[input], branch)
            .await
            .expect("create_workspace should succeed");

        // 4. Assertions.
        let parent_wt = workspace_dir.join("parent");
        let sub_wt = parent_wt.join("libs/foo");
        // submodule file materialized at nested path
        assert!(
            sub_wt.join("hello.txt").exists(),
            "submodule file missing at {}",
            sub_wt.display()
        );
        // parent worktree on the task branch
        assert_eq!(
            git_out(&parent_wt, &["rev-parse", "--abbrev-ref", "HEAD"]),
            branch
        );
        // submodule worktree on the task branch (workspace branch)
        assert_eq!(
            git_out(&sub_wt, &["rev-parse", "--abbrev-ref", "HEAD"]),
            branch
        );
        // submodule base branch exists
        let branches = git_out(&sub_wt, &["branch", "--list", SUBMODULE_BASE_BRANCH]);
        assert!(
            branches.contains(SUBMODULE_BASE_BRANCH),
            "base branch missing in submodule: {branches}"
        );
    }
}
