//! QA Mode: Mock executor for testing
//!
//! This module provides a mock executor that:
//! 1. Performs random file operations (create, delete, modify)
//! 2. Streams 10 mock log entries over 10 seconds
//! 3. Outputs logs in ClaudeJson format for compatibility with existing log normalization

use std::{path::Path, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use rand::seq::SliceRandom as _;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tracing::{info, warn};
use ts_rs::TS;

use crate::{
    env::ExecutionEnv,
    executors::{
        ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
        claude::{
            ClaudeContentItem, ClaudeJson, ClaudeMessage, ClaudeMessageContent, ClaudeToolData,
        },
    },
    logs::utils::{ConversationSink, EntryIndexProvider},
};

/// Mock executor for QA testing
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, TS, JsonSchema)]
pub struct QaMockExecutor;

#[async_trait]
impl StandardCodingAgentExecutor for QaMockExecutor {
    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        _env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        info!("QA Mock Executor: spawning mock execution");

        // 1. Perform file operations before spawning the log output process
        perform_file_operations(current_dir).await;

        // 2. Generate mock logs and write to temp file to avoid shell escaping issues
        let logs = generate_mock_logs(prompt);
        let temp_dir = std::env::temp_dir();
        let log_file = temp_dir.join(format!("qa_mock_logs_{}.jsonl", uuid::Uuid::new_v4()));

        // Write all logs to file, one per line
        let content = logs.join("\n") + "\n";
        tokio::fs::write(&log_file, &content)
            .await
            .map_err(|e| ExecutorError::Io(std::io::Error::other(e)))?;

        // 3. Create shell script that reads file and outputs with delays
        // Using IFS= read -r to preserve exact content (no word splitting, no backslash interpretation)
        let script = format!(
            r#"while IFS= read -r line; do echo "$line"; sleep 1; done < "{}"; rm -f "{}""#,
            log_file.display(),
            log_file.display()
        );

        let mut cmd = tokio::process::Command::new("sh");
        cmd.arg("-c")
            .arg(&script)
            .current_dir(current_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let child = cmd.group_spawn().map_err(ExecutorError::Io)?;
        Ok(SpawnedChild::from(child))
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        _session_id: &str,
        _reset_to_message_id: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        // QA mode doesn't support real sessions, just spawn fresh
        info!("QA Mock Executor: follow-up request treated as new spawn");
        self.spawn(current_dir, prompt, env).await
    }

    fn normalize_logs(
        &self,
        msg_store: Arc<dyn ConversationSink>,
        current_dir: &Path,
        entry_index_provider: EntryIndexProvider,
    ) {
        // Reuse Claude's log processor since we output ClaudeJson format
        crate::executors::claude::ClaudeLogProcessor::process_logs(
            msg_store,
            current_dir,
            entry_index_provider,
            crate::executors::claude::HistoryStrategy::Default,
        );
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        None // QA mock doesn't need MCP config
    }
}

/// Perform random file operations in the worktree
async fn perform_file_operations(dir: &Path) {
    info!("QA Mock: performing file operations in {:?}", dir);

    // Create: qa_created_{uuid}.txt
    let uuid = uuid::Uuid::new_v4();
    let new_file = dir.join(format!("qa_created_{}.txt", uuid));
    match tokio::fs::write(&new_file, "QA mode created this file\n").await {
        Ok(_) => info!("QA Mock: created file {:?}", new_file),
        Err(e) => warn!("QA Mock: failed to create file: {}", e),
    }

    // Find files (excluding .git and binary files)
    let files: Vec<_> = walkdir::WalkDir::new(dir)
        .max_depth(3) // Limit depth to avoid long walks
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| !e.path().to_string_lossy().contains(".git"))
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| ["rs", "ts", "js", "txt", "md", "json"].contains(&ext))
        })
        .collect();

    if files.len() >= 2 {
        // Pick random indices before any await points (thread_rng is not Send)
        let (remove_idx, modify_idx) = {
            let mut rng = rand::thread_rng();
            let mut indices: Vec<usize> = (0..files.len()).collect();
            indices.shuffle(&mut rng);
            (indices.first().copied(), indices.get(1).copied())
        };

        // Remove a random file (first shuffled index)
        if let Some(idx) = remove_idx {
            let file_to_remove = files[idx].path().to_path_buf();
            // Don't remove the file we just created
            if file_to_remove != new_file {
                match tokio::fs::remove_file(&file_to_remove).await {
                    Ok(_) => info!("QA Mock: removed file {:?}", file_to_remove),
                    Err(e) => warn!("QA Mock: failed to remove file: {}", e),
                }
            }
        }

        // Modify a different random file (second shuffled index)
        if let Some(idx) = modify_idx {
            let file_to_modify = files[idx].path().to_path_buf();
            // Don't modify the file we just created
            if file_to_modify != new_file {
                match tokio::fs::read_to_string(&file_to_modify).await {
                    Ok(content) => {
                        let modified = format!(
                            "{}\n// QA modification at {}\n",
                            content,
                            chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC")
                        );
                        match tokio::fs::write(&file_to_modify, modified).await {
                            Ok(_) => info!("QA Mock: modified file {:?}", file_to_modify),
                            Err(e) => warn!("QA Mock: failed to write modified file: {}", e),
                        }
                    }
                    Err(e) => warn!("QA Mock: failed to read file for modification: {}", e),
                }
            }
        }
    } else {
        info!(
            "QA Mock: not enough files found for remove/modify operations (found {})",
            files.len()
        );
    }
}

/// Generate 10 mock log entries in ClaudeJson format using strongly-typed structs
fn generate_mock_logs(prompt: &str) -> Vec<String> {
    let session_id = uuid::Uuid::new_v4().to_string();

    let logs: Vec<ClaudeJson> = vec![
        // 1. System init
        ClaudeJson::System {
            subtype: Some("init".to_string()),
            session_id: Some(session_id.clone()),
            cwd: None,
            tools: None,
            model: Some("qa-mock-executor".to_string()),
            api_key_source: Some("unknown".to_string()),
            status: None,
            slash_commands: vec![],
            plugins: vec![],
            agents: vec![],
        },
        // 2. Assistant thinking
        ClaudeJson::Assistant {
            message: ClaudeMessage {
                id: Some("msg-qa-1".to_string()),
                message_type: Some("message".to_string()),
                role: "assistant".to_string(),
                model: Some("qa-mock".to_string()),
                content: ClaudeMessageContent::Array(vec![ClaudeContentItem::Thinking {
                    thinking: "Analyzing the QA task and preparing mock execution...".to_string(),
                }]),
                stop_reason: None,
            },
            session_id: Some(session_id.clone()),
            uuid: Some("uuid-qa-1".to_string()),
        },
        // 3. Read tool use
        ClaudeJson::Assistant {
            message: ClaudeMessage {
                id: Some("msg-qa-2".to_string()),
                message_type: Some("message".to_string()),
                role: "assistant".to_string(),
                model: Some("qa-mock".to_string()),
                content: ClaudeMessageContent::Array(vec![ClaudeContentItem::ToolUse {
                    id: "qa-tool-1".to_string(),
                    tool_data: ClaudeToolData::Read {
                        file_path: "README.md".to_string(),
                    },
                }]),
                stop_reason: None,
            },
            session_id: Some(session_id.clone()),
            uuid: Some("uuid-qa-2".to_string()),
        },
        // 4. Read tool result
        ClaudeJson::User {
            message: ClaudeMessage {
                id: Some("msg-qa-3".to_string()),
                message_type: Some("message".to_string()),
                role: "user".to_string(),
                model: None,
                content: ClaudeMessageContent::Array(vec![ClaudeContentItem::ToolResult {
                    tool_use_id: "qa-tool-1".to_string(),
                    content: serde_json::json!(
                        "# Project README\\n\\nThis is a QA test repository."
                    ),
                    is_error: Some(false),
                }]),
                stop_reason: None,
            },
            is_synthetic: false,
            is_replay: false,
            session_id: Some(session_id.clone()),
            uuid: Some("uuid-qa-3".to_string()),
        },
        // 5. Write tool use
        ClaudeJson::Assistant {
            message: ClaudeMessage {
                id: Some("msg-qa-4".to_string()),
                message_type: Some("message".to_string()),
                role: "assistant".to_string(),
                model: Some("qa-mock".to_string()),
                content: ClaudeMessageContent::Array(vec![ClaudeContentItem::ToolUse {
                    id: "qa-tool-2".to_string(),
                    tool_data: ClaudeToolData::Write {
                        file_path: "qa_output.txt".to_string(),
                        content: "QA generated content".to_string(),
                    },
                }]),
                stop_reason: None,
            },
            session_id: Some(session_id.clone()),
            uuid: Some("uuid-qa-4".to_string()),
        },
        // 6. Write tool result
        ClaudeJson::User {
            message: ClaudeMessage {
                id: Some("msg-qa-5".to_string()),
                message_type: Some("message".to_string()),
                role: "user".to_string(),
                model: None,
                content: ClaudeMessageContent::Array(vec![ClaudeContentItem::ToolResult {
                    tool_use_id: "qa-tool-2".to_string(),
                    content: serde_json::json!("File written successfully"),
                    is_error: Some(false),
                }]),
                stop_reason: None,
            },
            session_id: Some(session_id.clone()),
            uuid: Some("uuid-qa-5".to_string()),
            is_synthetic: false,
            is_replay: false,
        },
        // 7. Bash tool use
        ClaudeJson::Assistant {
            message: ClaudeMessage {
                id: Some("msg-qa-6".to_string()),
                message_type: Some("message".to_string()),
                role: "assistant".to_string(),
                model: Some("qa-mock".to_string()),
                content: ClaudeMessageContent::Array(vec![ClaudeContentItem::ToolUse {
                    id: "qa-tool-3".to_string(),
                    tool_data: ClaudeToolData::Bash {
                        command: "echo 'QA test complete'".to_string(),
                        description: Some("Run QA test command".to_string()),
                    },
                }]),
                stop_reason: None,
            },
            session_id: Some(session_id.clone()),
            uuid: Some("uuid-qa-6".to_string()),
        },
        // 8. Bash tool result
        ClaudeJson::User {
            message: ClaudeMessage {
                id: Some("msg-qa-7".to_string()),
                message_type: Some("message".to_string()),
                role: "user".to_string(),
                model: None,
                content: ClaudeMessageContent::Array(vec![ClaudeContentItem::ToolResult {
                    tool_use_id: "qa-tool-3".to_string(),
                    content: serde_json::json!("QA test complete\\n"),
                    is_error: Some(false),
                }]),
                stop_reason: None,
            },
            is_synthetic: false,
            session_id: Some(session_id.clone()),
            uuid: Some("uuid-qa-7".to_string()),
            is_replay: false,
        },
        // 9. Assistant final message
        ClaudeJson::Assistant {
            message: ClaudeMessage {
                id: Some("msg-qa-8".to_string()),
                message_type: Some("message".to_string()),
                role: "assistant".to_string(),
                model: Some("qa-mock".to_string()),
                content: ClaudeMessageContent::Array(vec![ClaudeContentItem::Text {
                    text: format!(
                        "QA mode execution completed successfully.\\n\\nI performed the following operations:\\n1. Read README.md\\n2. Created qa_output.txt\\n3. Ran a test command\\nOriginal prompt: {}",
                        prompt
                    ),
                }]),
                stop_reason: Some("end_turn".to_string()),
            },
            session_id: Some(session_id.clone()),
            uuid: Some("uuid-qa-8".to_string()),
        },
        // 10. Result success
        ClaudeJson::Result {
            subtype: Some("success".to_string()),
            is_error: Some(false),
            duration_ms: Some(10000),
            result: None,
            error: None,
            num_turns: Some(3),
            session_id: Some(session_id),
            model_usage: None,
            usage: None,
        },
    ];

    // Serialize to JSON strings - this ensures proper escaping
    logs.into_iter()
        .map(|log| serde_json::to_string(&log).expect("ClaudeJson should serialize"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_mock_logs_count() {
        let logs = generate_mock_logs("test prompt");
        assert_eq!(logs.len(), 10, "Should generate exactly 10 log entries");
    }

    #[test]
    fn test_generate_mock_logs_valid_json() {
        let logs = generate_mock_logs("test prompt");
        for (i, log) in logs.iter().enumerate() {
            let parsed: Result<serde_json::Value, _> = serde_json::from_str(log);
            assert!(
                parsed.is_ok(),
                "Log entry {} should be valid JSON: {}",
                i,
                log
            );
        }
    }

    #[test]
    fn test_generate_mock_logs_deserializes_to_claudejson() {
        let logs = generate_mock_logs("test prompt");
        for (i, log) in logs.iter().enumerate() {
            let parsed: Result<ClaudeJson, _> = serde_json::from_str(log);
            assert!(
                parsed.is_ok(),
                "Log entry {} should deserialize to ClaudeJson: {} - error: {:?}",
                i,
                log,
                parsed.err()
            );
        }
    }

    #[test]
    fn test_escape_special_characters() {
        let logs = generate_mock_logs("test with \"quotes\" and\nnewlines");
        // The final assistant message (index 8) should contain the prompt
        let final_log = &logs[8];
        let parsed: ClaudeJson = serde_json::from_str(final_log).unwrap();

        if let ClaudeJson::Assistant { message, .. } = parsed {
            if let ClaudeMessageContent::Array(items) = &message.content {
                if let Some(ClaudeContentItem::Text { text }) = items.first() {
                    assert!(text.contains("test with \"quotes\" and\nnewlines"));
                } else {
                    panic!("Expected Text content item");
                }
            } else {
                panic!("Expected Array content");
            }
        } else {
            panic!("Expected Assistant variant");
        }
    }

    /// Pushes a synthetic Claude-format JSON line through the qa_mock executor's
    /// log normalizer (which delegates to the Claude processor) and asserts the
    /// resulting ToolUse entries carry timing data.
    #[tokio::test]
    async fn qa_mock_normalize_stamps_tool_timing() {
        use std::time::Duration;

        use workspace_utils::{log_msg::LogMsg, msg_store::MsgStore};

        use crate::logs::{
            NormalizedEntryType, ToolStatus,
            utils::{ConversationMsgStore, ConversationSink, extract_normalized_entry_from_patch},
        };

        let inner = Arc::new(MsgStore::new());
        let sink: Arc<dyn ConversationSink> = ConversationMsgStore::wrap(inner.clone());

        // Push a synthetic ClaudeJson assistant turn with one tool_use entry,
        // then a tool_result entry. The exact JSON shape is what claude.rs emits
        // for stream-json. Use Bash so the parser produces a Created -> Success
        // transition (the Read tool result handler doesn't change status, but
        // Bash explicitly maps `is_error` to Success/Failed).
        let assistant_json = serde_json::json!({
            "type": "assistant",
            "message": {
                "id": "msg_1",
                "role": "assistant",
                "content": [{
                    "type": "tool_use",
                    "id": "toolu_1",
                    "name": "Bash",
                    "input": {"command": "echo ok"}
                }],
                "stop_reason": null,
                "usage": {"input_tokens": 0, "output_tokens": 0}
            }
        });
        let result_json = serde_json::json!({
            "type": "user",
            "message": {
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": "toolu_1",
                    "content": "ok",
                    "is_error": false
                }]
            }
        });

        sink.push_stdout(format!("{assistant_json}\n"));
        sink.push_stdout(format!("{result_json}\n"));
        sink.push_finished();

        let executor = QaMockExecutor;
        let entry_index_provider = EntryIndexProvider::start_from(sink.as_ref());
        executor.normalize_logs(
            sink.clone(),
            std::path::Path::new("/tmp"),
            entry_index_provider,
        );

        // Allow normalizer tasks to drain
        tokio::time::sleep(Duration::from_millis(200)).await;

        let history = inner.get_history();
        let tool_use = history
            .into_iter()
            .filter_map(|m| match m {
                LogMsg::JsonPatch(p) => extract_normalized_entry_from_patch(&p),
                _ => None,
            })
            .filter_map(|(_, entry)| match entry.entry_type {
                NormalizedEntryType::ToolUse { .. } => Some(entry),
                _ => None,
            })
            .last()
            .expect("expected at least one ToolUse entry in history");

        match tool_use.entry_type {
            NormalizedEntryType::ToolUse {
                status,
                started_at,
                completed_at,
                approved_at,
                ..
            } => {
                assert!(matches!(status, ToolStatus::Success | ToolStatus::Failed));
                assert!(started_at.is_some(), "started_at should be stamped");
                assert!(completed_at.is_some(), "completed_at should be stamped");
                assert_eq!(approved_at, None, "no approval phase, should stay None");
            }
            other => panic!("expected ToolUse, got {other:?}"),
        }
    }
}
