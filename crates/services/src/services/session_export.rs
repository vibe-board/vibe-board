//! Build a downloadable zip export of a task attempt's CodingAgent conversation.
//!
//! Public surface:
//!   - `build_attempt_export`: DB + disk read, returns `AttemptExport`
//!   - `render_html`: pure, `AttemptExport` -> single combined HTML string
//!   - `build_zip_bytes`: pure, `AttemptExport` -> zip bytes
//!   - `export_filename`: pure, `AttemptExport` -> zip filename string
//!
//! See `docs/superpowers/specs/2026-05-28-task-attempt-session-export-design.md`.

use std::{
    io::{Cursor, Write},
    path::PathBuf,
    sync::Arc,
    time::Duration,
};

use chrono::{DateTime, Utc};
use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason, ExecutionProcessStatus},
    session::Session,
    task::Task,
    workspace::Workspace,
};
use executors::{
    actions::{ExecutorAction, ExecutorActionType},
    executors::{BaseCodingAgent, StandardCodingAgentExecutor},
    logs::NormalizedEntry,
    profile::{ExecutorConfigs, ExecutorProfileId},
};
use sqlx::SqlitePool;
use thiserror::Error;
use utils::{log_msg::LogMsg, msg_store::MsgStore};
use uuid::Uuid;

use crate::services::raw_log_store;

#[derive(Debug, Clone)]
pub struct ProcessExport {
    pub index: u32,
    pub execution_id: Uuid,
    pub executor_type: String,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub status: ExecutionProcessStatus,
    pub exit_code: Option<i64>,
    pub raw_lines: Vec<String>,
    pub raw_log_missing: bool,
    pub entries: Vec<NormalizedEntry>,
    pub normalize_status: NormalizeStatus,
}

#[derive(Debug, Clone)]
pub enum NormalizeStatus {
    Ok,
    Skipped { reason: String },
    PartialTimeout,
}

#[derive(Debug, Clone)]
pub struct AttemptExport {
    pub attempt_id: Uuid,
    pub branch: String,
    pub task_title: String,
    pub exported_at: DateTime<Utc>,
    pub processes: Vec<ProcessExport>,
}

#[derive(Debug, Error)]
pub enum ExportError {
    #[error("attempt not found")]
    AttemptNotFound,
    #[error("no CodingAgent processes for attempt")]
    NoCodingAgentProcesses,
    #[error("export too large: {bytes} bytes")]
    TooLarge { bytes: usize },
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Zip(#[from] zip::result::ZipError),
}

/// Max raw bytes across all processes before we refuse to build a zip in memory.
pub const MAX_EXPORT_RAW_BYTES: usize = 200 * 1024 * 1024;

/// Reduce a branch name to chars safe in a zip filename.
/// Non-`[A-Za-z0-9._-]` chars become `-`. Leading/trailing `-` are trimmed.
/// Empty input or input that sanitizes to nothing returns `""`.
pub fn sanitize_branch(branch: &str) -> String {
    let cleaned: String = branch
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
                c
            } else {
                '-'
            }
        })
        .collect();
    cleaned.trim_matches('-').to_string()
}

/// Build the zip filename for an export: `attempt-{branch-slug}-{YYYY-MM-DD-HHmm}.zip`.
/// If the branch is empty/all-special, fall back to `attempt-{first8(id)}`.
pub fn export_filename(export: &AttemptExport) -> String {
    let slug = {
        let s = sanitize_branch(&export.branch);
        if s.is_empty() {
            export.attempt_id.to_string()[..8].to_string()
        } else {
            s
        }
    };
    let ts = export.exported_at.format("%Y-%m-%d-%H%M");
    format!("attempt-{slug}-{ts}.zip")
}

/// Cap on how long we will wait for a normalizer to settle.
const REPLAY_HARD_TIMEOUT: Duration = Duration::from_secs(30);
/// We declare normalization "done" after this many ms with no new JsonPatch.
const REPLAY_STABILIZE_WINDOW: Duration = Duration::from_millis(250);
/// Poll cadence for the stabilization check.
const REPLAY_POLL_INTERVAL: Duration = Duration::from_millis(50);

/// Re-derive `NormalizedEntry`s from raw stdout lines by feeding them through
/// the executor's existing `normalize_logs` function.
///
/// Pre-loads all lines into a fresh [`MsgStore`], kicks off the normalizer
/// (which spawns internal tasks), then waits for the emitted JsonPatch count
/// to stop changing (250ms stable, 30s hard cap). Finally applies all patches
/// to reconstruct the entry array.
pub async fn replay_normalize(
    executor: Arc<dyn StandardCodingAgentExecutor + Send + Sync>,
    raw_lines: Vec<String>,
    worktree_path: PathBuf,
) -> (Vec<NormalizedEntry>, NormalizeStatus) {
    let store = Arc::new(MsgStore::new());

    for line in raw_lines {
        store.push_stdout(format!("{line}\n"));
    }
    store.push_finished();

    executor.normalize_logs(store.clone(), &worktree_path);

    let status = wait_for_patches_to_stabilize(&store).await;

    // Patches are emitted at JSON-pointer paths like `/entries/{index}`, with
    // values shaped `{"type": "NORMALIZED_ENTRY", "content": <NormalizedEntry>}`
    // (see `crates/executors/src/logs/utils/patch.rs::PatchType`). Apply them
    // against an `{"entries": []}` root, then unwrap each NORMALIZED_ENTRY
    // payload back into a flat `Vec<NormalizedEntry>`.
    let mut value = serde_json::json!({"entries": []});
    for msg in store.get_history() {
        if let LogMsg::JsonPatch(p) = msg {
            let _ = json_patch::patch(&mut value, &p);
        }
    }

    let entries: Vec<NormalizedEntry> = value
        .get("entries")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|wrapper| {
                    let typ = wrapper.get("type").and_then(|t| t.as_str())?;
                    if typ != "NORMALIZED_ENTRY" {
                        return None;
                    }
                    let content = wrapper.get("content")?.clone();
                    serde_json::from_value::<NormalizedEntry>(content).ok()
                })
                .collect()
        })
        .unwrap_or_default();
    (entries, status)
}

async fn wait_for_patches_to_stabilize(store: &MsgStore) -> NormalizeStatus {
    let start = std::time::Instant::now();
    let mut last_count = patch_count(store);
    let mut stable_for = Duration::ZERO;

    loop {
        tokio::time::sleep(REPLAY_POLL_INTERVAL).await;
        let current = patch_count(store);
        if current == last_count {
            stable_for += REPLAY_POLL_INTERVAL;
            if stable_for >= REPLAY_STABILIZE_WINDOW {
                return NormalizeStatus::Ok;
            }
        } else {
            stable_for = Duration::ZERO;
            last_count = current;
        }
        if start.elapsed() >= REPLAY_HARD_TIMEOUT {
            return NormalizeStatus::PartialTimeout;
        }
    }
}

fn patch_count(store: &MsgStore) -> usize {
    store
        .get_history()
        .iter()
        .filter(|m| matches!(m, LogMsg::JsonPatch(_)))
        .count()
}

/// Given the `executor_action` payload of an `ExecutionProcess`, instantiate
/// the concrete coding agent so we can replay logs through it. Returns `None`
/// if the action is not a coding-agent variant (e.g. `ScriptRequest`) or the
/// executor profile is no longer registered.
pub fn resolve_executor(
    action: &ExecutorAction,
) -> Option<(
    Arc<dyn StandardCodingAgentExecutor + Send + Sync>,
    BaseCodingAgent,
)> {
    let profile_id: ExecutorProfileId = match action.typ() {
        ExecutorActionType::CodingAgentInitialRequest(req) => req.executor_profile_id.clone(),
        ExecutorActionType::CodingAgentFollowUpRequest(req) => req.executor_profile_id.clone(),
        _ => return None,
    };
    let base = profile_id.executor;
    let agent = ExecutorConfigs::get_cached().get_coding_agent(&profile_id)?;
    Some((Arc::new(agent), base))
}

/// Walk DB + disk to build a complete `AttemptExport`.
/// Errors map directly to HTTP statuses in the route handler.
pub async fn build_attempt_export(
    pool: &SqlitePool,
    attempt_id: Uuid,
) -> Result<AttemptExport, ExportError> {
    let workspace = Workspace::find_by_id(pool, attempt_id)
        .await?
        .ok_or(ExportError::AttemptNotFound)?;

    let task = Task::find_by_id(pool, workspace.task_id)
        .await?
        .ok_or(ExportError::AttemptNotFound)?;

    // The "current" session is the most recently used; sessions are returned
    // already ordered that way by find_by_workspace_id.
    let sessions = Session::find_by_workspace_id(pool, workspace.id).await?;
    let session = sessions
        .into_iter()
        .next()
        .ok_or(ExportError::NoCodingAgentProcesses)?;

    let processes_all = ExecutionProcess::find_by_session_id(pool, session.id, false).await?;

    let mut processes: Vec<ProcessExport> = Vec::new();
    let mut total_raw_bytes: usize = 0;

    for (i, proc) in processes_all
        .into_iter()
        .filter(|p| matches!(p.run_reason, ExecutionProcessRunReason::CodingAgent))
        .enumerate()
    {
        let raw_opt = raw_log_store::read_log_lines(proc.id).await;
        let raw_lines = raw_opt.clone().unwrap_or_default();
        let raw_log_missing = raw_opt.is_none();

        total_raw_bytes =
            total_raw_bytes.saturating_add(raw_lines.iter().map(|s| s.len() + 1).sum::<usize>());
        if total_raw_bytes > MAX_EXPORT_RAW_BYTES {
            return Err(ExportError::TooLarge {
                bytes: total_raw_bytes,
            });
        }

        // `executor_action` on `ExecutionProcess` is `sqlx::types::Json<ExecutorActionField>`,
        // where `ExecutorActionField` is an enum (`ExecutorAction(ExecutorAction) | Other(Value)`)
        // — not a newtype. Use the existing helper which handles the variant for us.
        let action_opt: Option<ExecutorAction> = proc.executor_action().ok().cloned();

        let (entries, status, executor_type) = match action_opt.as_ref().and_then(resolve_executor)
        {
            Some((agent, base)) if !raw_lines.is_empty() => {
                let (entries, status) = replay_normalize(
                    agent,
                    raw_lines.clone(),
                    std::path::PathBuf::from("/"), // worktree path unused by most normalizers
                )
                .await;
                (entries, status, format!("{base:?}"))
            }
            Some((_, base)) => (Vec::new(), NormalizeStatus::Ok, format!("{base:?}")),
            None => (
                Vec::new(),
                NormalizeStatus::Skipped {
                    reason: "executor not resolvable".to_string(),
                },
                "unknown".to_string(),
            ),
        };

        processes.push(ProcessExport {
            index: (i as u32) + 1,
            execution_id: proc.id,
            executor_type,
            started_at: proc.started_at,
            completed_at: proc.completed_at,
            status: proc.status,
            exit_code: proc.exit_code,
            raw_lines,
            raw_log_missing,
            entries,
            normalize_status: status,
        });
    }

    if processes.is_empty() {
        return Err(ExportError::NoCodingAgentProcesses);
    }

    Ok(AttemptExport {
        attempt_id: workspace.id,
        branch: workspace.branch.clone(),
        task_title: task.title.clone(),
        exported_at: Utc::now(),
        processes,
    })
}

use executors::logs::{NormalizedEntryError, NormalizedEntryType};

const PAGE_CSS: &str = r#"
:root { --bg:#fff; --fg:#1a1a1a; --muted:#666; --border:#e5e5e5;
        --accent-user:#2563eb; --accent-assistant:#059669;
        --accent-tool:#9333ea; --accent-system:#737373;
        --accent-thinking:#a16207; --accent-error:#dc2626; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#0f172a; --fg:#e5e7eb; --muted:#94a3b8; --border:#1f2937; }
}
body { background:var(--bg); color:var(--fg); margin:0;
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
       line-height:1.55; }
main, .page-header, .page-footer { max-width:880px; margin:0 auto; padding:1rem; }
.page-header { border-bottom:1px solid var(--border); }
.meta { display:grid; grid-template-columns:max-content 1fr; gap:.25rem 1rem; font-size:.9em; color:var(--muted); }
.meta dt { font-weight:600; }
.process { margin:1.5rem 0; padding-top:.5rem; border-top:1px solid var(--border); }
.process-header { font-size:1.1rem; color:var(--muted); font-weight:500; }
.process-footer { font-size:.85em; color:var(--muted); margin-top:.5rem; }
.entry { border-left:3px solid var(--border); padding:.5rem .75rem; margin:.5rem 0; }
.entry header { font-size:.85em; color:var(--muted); margin-bottom:.25rem; display:flex; gap:.5rem; }
.entry .role { font-weight:600; color:var(--fg); }
.entry--user { border-left-color:var(--accent-user); }
.entry--assistant { border-left-color:var(--accent-assistant); }
.entry--tool { border-left-color:var(--accent-tool); }
.entry--system { border-left-color:var(--accent-system); }
.entry--thinking { border-left-color:var(--accent-thinking); font-style:italic; }
.entry--error { border-left-color:var(--accent-error); }
.entry .content pre, .entry pre { background:rgba(127,127,127,.08); padding:.5rem; overflow-x:auto;
       font-family:ui-monospace,"SF Mono",Menlo,monospace; font-size:.85em; }
.entry details summary { cursor:pointer; }
.no-data { color:var(--muted); font-style:italic; padding:2rem 0; text-align:center; }
.warn { background:rgba(220,38,38,.1); border-left:3px solid var(--accent-error); padding:.5rem; margin:.5rem 0; }
"#;

/// Render the whole AttemptExport into a single self-contained HTML document.
pub fn render_html(export: &AttemptExport) -> String {
    let mut s = String::with_capacity(8192);
    s.push_str("<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">");
    s.push_str(&format!(
        "<title>Session · {} · {}</title>",
        html_escape::encode_text(&export.task_title),
        html_escape::encode_text(&export.branch)
    ));
    s.push_str(&format!("<style>{PAGE_CSS}</style></head><body>"));

    s.push_str("<header class=\"page-header\">");
    s.push_str(&format!(
        "<h1>{}</h1>",
        html_escape::encode_text(&export.task_title)
    ));
    s.push_str(&format!(
        r#"<dl class="meta"><dt>Attempt</dt><dd>{}</dd><dt>Branch</dt><dd>{}</dd><dt>Processes</dt><dd>{}</dd><dt>Exported</dt><dd>{}</dd></dl>"#,
        export.attempt_id,
        html_escape::encode_text(&export.branch),
        export.processes.len(),
        export.exported_at.format("%Y-%m-%d %H:%M UTC"),
    ));
    s.push_str("</header><main>");

    if export.processes.is_empty() {
        s.push_str(r#"<div class="no-data">No data</div>"#);
    } else {
        for p in &export.processes {
            render_process(&mut s, p);
        }
    }

    s.push_str(
        "</main><footer class=\"page-footer\">Exported by vibe-kanban</footer></body></html>",
    );
    s
}

fn render_process(out: &mut String, p: &ProcessExport) {
    let header_suffix = if matches!(p.status, ExecutionProcessStatus::Running) {
        " (running)".to_string()
    } else {
        let dur = p
            .completed_at
            .map(|c| (c - p.started_at).num_seconds())
            .unwrap_or(0);
        let exit = p
            .exit_code
            .map(|e| format!(", exit {e}"))
            .unwrap_or_default();
        format!(" ({}s{})", dur, exit)
    };

    out.push_str(&format!(
        r#"<section class="process" id="p{0}"><h2 class="process-header">Process {0} · <span class="executor">{1}</span> · <time>{2}</time>{3}</h2>"#,
        p.index,
        html_escape::encode_text(&p.executor_type),
        p.started_at.format("%Y-%m-%d %H:%M:%S"),
        header_suffix,
    ));

    if let NormalizeStatus::PartialTimeout = p.normalize_status {
        out.push_str(r#"<div class="warn">[partial normalize: timeout]</div>"#);
    }
    if let NormalizeStatus::Skipped { reason } = &p.normalize_status {
        out.push_str(&format!(
            r#"<div class="warn">[normalize skipped: {}]</div>"#,
            html_escape::encode_text(reason)
        ));
    }
    if p.raw_log_missing {
        out.push_str(r#"<div class="warn">[raw log unavailable]</div>"#);
    }

    for entry in &p.entries {
        let fragment = render_entry(entry);
        if !fragment.is_empty() {
            out.push_str(&fragment);
        }
    }

    // Footer with token info if present in any entry.
    let token_summary = p.entries.iter().find_map(|e| match &e.entry_type {
        NormalizedEntryType::TokenUsageInfo(info) => Some(format!(
            "in {} · out {} · total {}",
            info.input_tokens.unwrap_or(0),
            info.output_tokens.unwrap_or(0),
            info.total_tokens,
        )),
        _ => None,
    });
    if let Some(t) = token_summary {
        out.push_str(&format!(
            r#"<footer class="process-footer">Tokens: {t}</footer>"#
        ));
    }

    out.push_str("</section>");
}

/// Render a single NormalizedEntry to an HTML fragment.
/// Returns `""` for entry types we deliberately skip (Loading, NextAction,
/// TokenUsageInfo — Token info is aggregated into the process footer).
pub fn render_entry(entry: &NormalizedEntry) -> String {
    let timestamp = entry
        .timestamp
        .as_deref()
        .map(|t| format!(r#"<time class="ts">{}</time>"#, html_escape::encode_text(t)))
        .unwrap_or_default();

    match &entry.entry_type {
        NormalizedEntryType::UserMessage => render_message(
            "entry--user",
            "User",
            &timestamp,
            &markdown_to_html(&entry.content),
        ),
        NormalizedEntryType::UserFeedback { denied_tool } => render_message(
            "entry--user",
            &format!("User · denied {}", html_escape::encode_text(denied_tool)),
            &timestamp,
            &markdown_to_html(&entry.content),
        ),
        NormalizedEntryType::AssistantMessage => render_message(
            "entry--assistant",
            "Assistant",
            &timestamp,
            &markdown_to_html(&entry.content),
        ),
        NormalizedEntryType::SystemMessage => render_message(
            "entry--system",
            "System",
            &timestamp,
            &markdown_to_html(&entry.content),
        ),
        NormalizedEntryType::Thinking => render_message(
            "entry--thinking",
            "Thinking",
            &timestamp,
            &markdown_to_html(&entry.content),
        ),
        NormalizedEntryType::ToolUse {
            tool_name,
            action_type,
            status,
        } => {
            let summary = format!(
                "{} · {:?}",
                html_escape::encode_text(tool_name),
                action_type
            );
            format!(
                r#"<article class="entry entry--tool" data-status="{:?}">
  <header><span class="role">🔧 {}</span>{}</header>
  <details><summary>{}</summary><pre><code>{}</code></pre></details>
</article>"#,
                status,
                html_escape::encode_text(tool_name),
                timestamp,
                summary,
                html_escape::encode_text(&entry.content),
            )
        }
        NormalizedEntryType::ErrorMessage { error_type } => {
            let label = match error_type {
                NormalizedEntryError::SetupRequired => "setup required",
                NormalizedEntryError::Other => "error",
            };
            format!(
                r#"<article class="entry entry--error">
  <header><span class="role">⚠ {}</span>{}</header>
  <pre>{}</pre>
</article>"#,
                label,
                timestamp,
                html_escape::encode_text(&entry.content),
            )
        }
        NormalizedEntryType::UserAnsweredQuestions { answers } => {
            let items: String = answers
                .iter()
                .map(|qa| {
                    format!(
                        "<dt>{}</dt><dd>{}</dd>",
                        html_escape::encode_text(&qa.question),
                        html_escape::encode_text(&qa.answer.join(", ")),
                    )
                })
                .collect();
            format!(
                r#"<article class="entry entry--user"><header><span class="role">User · answered</span>{}</header><dl class="qa">{}</dl></article>"#,
                timestamp, items,
            )
        }
        NormalizedEntryType::TaskDuration { .. }
        | NormalizedEntryType::TokenUsageInfo(_)
        | NormalizedEntryType::Loading
        | NormalizedEntryType::NextAction { .. } => String::new(),
    }
}

fn render_message(class: &str, role: &str, timestamp: &str, body_html: &str) -> String {
    format!(
        r#"<article class="entry {class}">
  <header><span class="role">{role}</span>{timestamp}</header>
  <div class="content">{body_html}</div>
</article>"#
    )
}

fn markdown_to_html(src: &str) -> String {
    use pulldown_cmark::{Options, Parser, html};
    // First escape HTML to prevent injection, then parse as markdown
    let escaped = html_escape::encode_text(src).to_string();
    let mut opts = Options::empty();
    opts.insert(Options::ENABLE_TABLES);
    opts.insert(Options::ENABLE_STRIKETHROUGH);
    opts.insert(Options::ENABLE_FOOTNOTES);
    let parser = Parser::new_ext(&escaped, opts);
    let mut out = String::with_capacity(src.len() + 64);
    html::push_html(&mut out, parser);
    out
}

/// Pack an `AttemptExport` into an in-memory zip.
pub fn build_zip_bytes(export: &AttemptExport) -> Result<Vec<u8>, ExportError> {
    use zip::{ZipWriter, write::SimpleFileOptions};

    let buf = Cursor::new(Vec::with_capacity(64 * 1024));
    let mut zip = ZipWriter::new(buf);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let html = render_html(export);
    zip.start_file("conversation.html", opts)?;
    zip.write_all(html.as_bytes())?;

    zip.start_file("README.txt", opts)?;
    zip.write_all(build_readme(export).as_bytes())?;

    for p in &export.processes {
        if p.raw_lines.is_empty() && p.raw_log_missing {
            continue;
        }
        let name = format!(
            "raw/{:02}-{}.jsonl",
            p.index,
            &p.execution_id.to_string()[..8]
        );
        zip.start_file(&name, opts)?;
        for line in &p.raw_lines {
            zip.write_all(line.as_bytes())?;
            zip.write_all(b"\n")?;
        }
    }

    let cursor = zip.finish()?;
    Ok(cursor.into_inner())
}

fn build_readme(export: &AttemptExport) -> String {
    let mut s = String::new();
    s.push_str("vibe-kanban session export\n");
    s.push_str(&format!("Attempt:  {}\n", export.attempt_id));
    s.push_str(&format!("Branch:   {}\n", export.branch));
    s.push_str(&format!("Task:     {}\n", export.task_title));
    s.push_str(&format!(
        "Exported: {}\n",
        export.exported_at.format("%Y-%m-%d %H:%M:%S UTC")
    ));
    s.push_str(&format!("Processes: {}\n\n", export.processes.len()));
    s.push_str("Files:\n");
    s.push_str("  conversation.html  - combined rendered timeline (open in any browser)\n");
    s.push_str(
        "  raw/NN-XXXXXXXX.jsonl - raw stdout per CodingAgent process, in chronological order\n",
    );
    s
}

#[cfg(test)]
mod tests {
    use executors::logs::{ActionType, NormalizedEntryError, NormalizedEntryType, ToolStatus};

    use super::*;

    #[test]
    fn render_entry_user_message_uses_user_class_and_escapes() {
        let e = NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::UserMessage,
            content: "<script>alert(1)</script>".to_string(),
            metadata: None,
        };
        let html = render_entry(&e);
        assert!(html.contains("entry--user"), "got: {html}");
        assert!(
            !html.contains("<script>alert(1)</script>"),
            "must escape: {html}"
        );
        assert!(html.contains("&lt;script&gt;"));
    }

    #[test]
    fn render_entry_assistant_message_renders_markdown() {
        let e = NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::AssistantMessage,
            content: "Here is **bold** text".to_string(),
            metadata: None,
        };
        let html = render_entry(&e);
        assert!(html.contains("entry--assistant"));
        assert!(
            html.contains("<strong>bold</strong>"),
            "markdown bold should render: {html}"
        );
    }

    #[test]
    fn render_entry_tool_use_wraps_in_details() {
        let e = NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: "Edit".to_string(),
                action_type: ActionType::FileEdit {
                    path: "src/main.rs".to_string(),
                    changes: vec![],
                },
                status: ToolStatus::Success,
            },
            content: "patch body".to_string(),
            metadata: None,
        };
        let html = render_entry(&e);
        assert!(html.contains("entry--tool"));
        assert!(html.contains("<details>"));
        assert!(html.contains("Edit"));
    }

    #[test]
    fn render_entry_loading_returns_empty_string() {
        let e = NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::Loading,
            content: "".to_string(),
            metadata: None,
        };
        assert_eq!(render_entry(&e), "");
    }

    #[test]
    fn render_entry_next_action_returns_empty_string() {
        let e = NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::NextAction {
                failed: false,
                execution_processes: 1,
                needs_setup: false,
            },
            content: "".to_string(),
            metadata: None,
        };
        assert_eq!(render_entry(&e), "");
    }

    #[test]
    fn render_entry_error_uses_error_class() {
        let e = NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ErrorMessage {
                error_type: NormalizedEntryError::Other,
            },
            content: "boom".to_string(),
            metadata: None,
        };
        let html = render_entry(&e);
        assert!(html.contains("entry--error"));
        assert!(html.contains("boom"));
    }

    #[test]
    fn sanitize_branch_keeps_safe_chars() {
        assert_eq!(sanitize_branch("feature.x_1-2"), "feature.x_1-2");
    }

    #[test]
    fn sanitize_branch_replaces_slashes_and_unicode() {
        assert_eq!(sanitize_branch("user/foo/bar"), "user-foo-bar");
        assert_eq!(sanitize_branch("feat/中文"), "feat");
    }

    #[test]
    fn sanitize_branch_trims_leading_trailing_dashes() {
        assert_eq!(sanitize_branch("/foo/"), "foo");
        assert_eq!(sanitize_branch("---abc---"), "abc");
    }

    #[test]
    fn sanitize_branch_empty_returns_empty_string() {
        assert_eq!(sanitize_branch(""), "");
        assert_eq!(sanitize_branch("///"), "");
    }

    #[test]
    fn export_filename_uses_branch_when_present() {
        let export = sample_export("feature.x", Uuid::nil());
        let name = export_filename(&export);
        assert!(name.starts_with("attempt-feature.x-"));
        assert!(name.ends_with(".zip"));
    }

    #[test]
    fn export_filename_falls_back_to_attempt_id_prefix_when_branch_blank() {
        let id = Uuid::parse_str("0123abcd-0000-0000-0000-000000000000").unwrap();
        let export = sample_export("//", id);
        let name = export_filename(&export);
        assert!(name.starts_with("attempt-0123abcd-"));
        assert!(name.ends_with(".zip"));
    }

    fn sample_export(branch: &str, attempt_id: Uuid) -> AttemptExport {
        AttemptExport {
            attempt_id,
            branch: branch.to_string(),
            task_title: "T".to_string(),
            exported_at: DateTime::<Utc>::from_timestamp(1_700_000_000, 0).unwrap(),
            processes: vec![],
        }
    }

    fn sample_claude_executor() -> executors::executors::claude::ClaudeCode {
        // ClaudeCode has a private `approvals_service` field, so we construct
        // it via Serde rather than touching the struct literally.
        serde_json::from_value(serde_json::json!({})).expect("ClaudeCode deserialises from {}")
    }

    #[tokio::test]
    async fn replay_normalize_handles_claude_assistant_line() {
        use std::sync::Arc;

        let line = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello"}]},"session_id":"s1"}"#;
        let raw_lines = vec![line.to_string()];

        let executor = Arc::new(sample_claude_executor());
        let (entries, status) = replay_normalize(executor, raw_lines, std::env::temp_dir()).await;

        assert!(matches!(status, NormalizeStatus::Ok));
        assert!(
            !entries.is_empty(),
            "expected at least one normalized entry"
        );
        assert!(
            matches!(
                entries[0].entry_type,
                executors::logs::NormalizedEntryType::AssistantMessage
            ),
            "first entry should be an AssistantMessage, got {:?}",
            entries[0].entry_type
        );
    }

    #[test]
    fn resolve_executor_returns_some_for_known_initial_request() {
        use executors::{
            actions::{
                ExecutorAction, ExecutorActionType, coding_agent_initial::CodingAgentInitialRequest,
            },
            executors::BaseCodingAgent,
            profile::ExecutorProfileId,
        };

        let action = ExecutorAction::new(
            ExecutorActionType::CodingAgentInitialRequest(CodingAgentInitialRequest {
                prompt: "p".to_string(),
                executor_profile_id: ExecutorProfileId {
                    executor: BaseCodingAgent::ClaudeCode,
                    variant: None,
                },
                working_dir: None,
            }),
            None,
        );
        let resolved = resolve_executor(&action);
        assert!(resolved.is_some(), "ClaudeCode should resolve to an agent");
        let (agent, base) = resolved.unwrap();
        assert_eq!(base, BaseCodingAgent::ClaudeCode);
        // Ensure the trait object is usable.
        let _: &dyn StandardCodingAgentExecutor = agent.as_ref();
    }

    #[test]
    fn resolve_executor_returns_none_for_script_action() {
        use executors::actions::{
            ExecutorAction, ExecutorActionType,
            script::{ScriptContext, ScriptRequest, ScriptRequestLanguage},
        };

        let action = ExecutorAction::new(
            ExecutorActionType::ScriptRequest(ScriptRequest {
                script: "echo hi".to_string(),
                language: ScriptRequestLanguage::Bash,
                context: ScriptContext::SetupScript,
                working_dir: None,
            }),
            None,
        );
        assert!(resolve_executor(&action).is_none());
    }

    #[test]
    fn render_html_empty_processes_returns_no_data_placeholder() {
        let export = sample_export("br", Uuid::nil());
        let html = render_html(&export);
        assert!(html.starts_with("<!DOCTYPE html>"));
        assert!(html.contains("No data"));
        assert!(html.contains("<style>"), "should inline CSS");
    }

    #[test]
    fn render_html_includes_process_sections_and_meta() {
        let mut export = sample_export("br", Uuid::nil());
        export.processes.push(ProcessExport {
            index: 1,
            execution_id: Uuid::nil(),
            executor_type: "ClaudeCode".to_string(),
            started_at: DateTime::<Utc>::from_timestamp(1_700_000_000, 0).unwrap(),
            completed_at: Some(DateTime::<Utc>::from_timestamp(1_700_000_300, 0).unwrap()),
            status: ExecutionProcessStatus::Completed,
            exit_code: Some(0),
            raw_lines: vec!["dummy".to_string()],
            raw_log_missing: false,
            entries: vec![NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::AssistantMessage,
                content: "hi".to_string(),
                metadata: None,
            }],
            normalize_status: NormalizeStatus::Ok,
        });
        let html = render_html(&export);
        assert!(html.contains("ClaudeCode"));
        assert!(html.contains("Process 1"));
        assert!(html.contains("entry--assistant"));
    }

    #[test]
    fn render_html_escapes_task_title_and_branch() {
        let mut export = sample_export("<evil>", Uuid::nil());
        export.task_title = "<img onerror=alert(1)>".to_string();
        let html = render_html(&export);
        assert!(
            !html.contains("<img onerror=alert(1)>"),
            "title must escape"
        );
        assert!(!html.contains("<evil>"), "branch must escape");
        assert!(html.contains("&lt;img"));
    }

    #[test]
    fn render_html_marks_in_progress_processes() {
        let mut export = sample_export("br", Uuid::nil());
        export.processes.push(ProcessExport {
            index: 1,
            execution_id: Uuid::nil(),
            executor_type: "ClaudeCode".to_string(),
            started_at: DateTime::<Utc>::from_timestamp(1_700_000_000, 0).unwrap(),
            completed_at: None,
            status: ExecutionProcessStatus::Running,
            exit_code: None,
            raw_lines: vec![],
            raw_log_missing: false,
            entries: vec![],
            normalize_status: NormalizeStatus::Ok,
        });
        let html = render_html(&export);
        assert!(html.contains("(running)"));
    }

    #[test]
    fn render_html_marks_missing_raw_log() {
        let mut export = sample_export("br", Uuid::nil());
        export.processes.push(ProcessExport {
            index: 1,
            execution_id: Uuid::nil(),
            executor_type: "ClaudeCode".to_string(),
            started_at: DateTime::<Utc>::from_timestamp(1_700_000_000, 0).unwrap(),
            completed_at: Some(DateTime::<Utc>::from_timestamp(1_700_000_100, 0).unwrap()),
            status: ExecutionProcessStatus::Completed,
            exit_code: Some(0),
            raw_lines: vec![],
            raw_log_missing: true,
            entries: vec![],
            normalize_status: NormalizeStatus::Ok,
        });
        let html = render_html(&export);
        assert!(html.contains("raw log unavailable"));
    }

    /// End-to-end smoke test of `build_attempt_export` exercising the full
    /// pipeline: DB lookups, on-disk raw log read, executor resolution,
    /// replay through the normalizer, and `build_zip_bytes` assembly.
    ///
    /// Bypasses the `utils::assets::DATA_DIR_OVERRIDE` `OnceLock` by setting it
    /// only when no override is already present, and reusing whatever path it
    /// returns. This makes the test resilient to ordering with any other test
    /// that may also set the data dir (none currently do, but defensiveness
    /// here keeps a future addition from silently corrupting `~/.vibe-board`).
    #[tokio::test(flavor = "current_thread")]
    async fn build_attempt_export_end_to_end() {
        use db::models::{
            execution_process::{
                CreateExecutionProcess, ExecutionProcess, ExecutionProcessRunReason,
            },
            project::{CreateProject, Project},
            session::{CreateSession, Session},
            task::{CreateTask, Task},
            workspace::{CreateWorkspace, Workspace, WorkspaceMode},
        };
        use executors::{
            actions::{
                ExecutorAction, ExecutorActionType, coding_agent_initial::CodingAgentInitialRequest,
            },
            executors::BaseCodingAgent,
            profile::ExecutorProfileId,
        };
        use tempfile::TempDir;

        // --- Point DATA_DIR_OVERRIDE at a tempdir (best-effort) -----------
        let tmp = TempDir::new().expect("tempdir creation");
        utils::assets::set_data_dir(tmp.path().to_path_buf());
        // The OnceLock may have already been claimed by another test in this
        // binary. Whatever `asset_dir()` returns is the dir we have to live in.
        let asset_root = utils::assets::asset_dir();
        std::fs::create_dir_all(&asset_root).expect("create asset root");
        std::fs::create_dir_all(asset_root.join("logs")).expect("create logs/");

        // --- Pool + migrations -------------------------------------------
        let db = db::DBService::new()
            .await
            .expect("DBService::new should succeed for tempdir asset dir");
        let pool = db.pool;

        // --- Insert minimal Project → Task → Workspace → Session → ExecProc.
        let project_id = Uuid::new_v4();
        Project::create(
            &pool,
            &CreateProject {
                name: "test-project".into(),
                repositories: vec![],
            },
            project_id,
        )
        .await
        .expect("project create");

        let task_id = Uuid::new_v4();
        Task::create(
            &pool,
            &CreateTask {
                project_id,
                title: "test task".into(),
                description: None,
                status: None,
                parent_workspace_id: None,
                image_ids: None,
            },
            task_id,
        )
        .await
        .expect("task create");

        let workspace_id = Uuid::new_v4();
        Workspace::create(
            &pool,
            &CreateWorkspace {
                branch: "vb/test-branch".into(),
                agent_working_dir: None,
                mode: Some(WorkspaceMode::Worktree),
            },
            workspace_id,
            task_id,
        )
        .await
        .expect("workspace create");

        let session_id = Uuid::new_v4();
        Session::create(
            &pool,
            &CreateSession {
                executor: Some("CLAUDE_CODE".into()),
            },
            session_id,
            workspace_id,
        )
        .await
        .expect("session create");

        let action = ExecutorAction::new(
            ExecutorActionType::CodingAgentInitialRequest(CodingAgentInitialRequest {
                prompt: "p".into(),
                executor_profile_id: ExecutorProfileId {
                    executor: BaseCodingAgent::ClaudeCode,
                    variant: None,
                },
                working_dir: None,
            }),
            None,
        );
        let execution_id = Uuid::new_v4();
        ExecutionProcess::create(
            &pool,
            &CreateExecutionProcess {
                session_id,
                executor_action: action,
                run_reason: ExecutionProcessRunReason::CodingAgent,
            },
            execution_id,
            &[], // no repo_states
        )
        .await
        .expect("execution process create");

        // --- Write a single fake JSONL log line (plain, not zst). --------
        let log_path = asset_root
            .join("logs")
            .join(format!("{execution_id}.jsonl"));
        std::fs::write(
            &log_path,
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello"}]},"session_id":"s1"}
"#,
        )
        .expect("write log");

        // --- Run pipeline ------------------------------------------------
        let export = build_attempt_export(&pool, workspace_id)
            .await
            .expect("build_attempt_export should succeed");

        assert_eq!(export.processes.len(), 1, "exactly one CodingAgent process");
        let proc = &export.processes[0];
        assert_eq!(proc.raw_lines.len(), 1, "one raw line read from disk");
        assert!(!proc.raw_log_missing, "log file was written");
        assert!(
            !proc.entries.is_empty(),
            "replay should yield at least one normalized entry"
        );
        assert!(
            matches!(
                proc.entries[0].entry_type,
                executors::logs::NormalizedEntryType::AssistantMessage
            ),
            "first entry should be AssistantMessage, got {:?}",
            proc.entries[0].entry_type
        );

        // --- Zip the result and inspect layout ---------------------------
        let bytes = build_zip_bytes(&export).expect("zip");
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).expect("zip readable");
        let names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();
        assert!(
            names.iter().any(|n| n == "conversation.html"),
            "names={:?}",
            names
        );
        assert!(names.iter().any(|n| n == "README.txt"), "names={:?}", names);
        assert!(
            names
                .iter()
                .any(|n| n.starts_with("raw/01-") && n.ends_with(".jsonl")),
            "names={:?}",
            names
        );

        // Hold tempdir guard until end so it isn't dropped early.
        drop(tmp);
    }

    #[test]
    fn build_zip_bytes_layout() {
        let mut export = sample_export("br", Uuid::nil());
        export.processes.push(ProcessExport {
            index: 1,
            execution_id: Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap(),
            executor_type: "ClaudeCode".to_string(),
            started_at: DateTime::<Utc>::from_timestamp(1_700_000_000, 0).unwrap(),
            completed_at: Some(DateTime::<Utc>::from_timestamp(1_700_000_100, 0).unwrap()),
            status: ExecutionProcessStatus::Completed,
            exit_code: Some(0),
            raw_lines: vec!["line-a".to_string(), "line-b".to_string()],
            raw_log_missing: false,
            entries: vec![],
            normalize_status: NormalizeStatus::Ok,
        });
        export.processes.push(ProcessExport {
            index: 2,
            execution_id: Uuid::parse_str("00000000-0000-0000-0000-000000000002").unwrap(),
            executor_type: "ClaudeCode".to_string(),
            started_at: DateTime::<Utc>::from_timestamp(1_700_000_200, 0).unwrap(),
            completed_at: None,
            status: ExecutionProcessStatus::Completed,
            exit_code: None,
            raw_lines: vec![],
            raw_log_missing: true,
            entries: vec![],
            normalize_status: NormalizeStatus::Ok,
        });

        let bytes = build_zip_bytes(&export).expect("zip build should succeed");
        let mut archive =
            zip::ZipArchive::new(std::io::Cursor::new(bytes)).expect("zip should be readable");

        let mut names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();
        names.sort();
        assert!(
            names.contains(&"conversation.html".to_string()),
            "names={:?}",
            names
        );
        assert!(
            names.contains(&"README.txt".to_string()),
            "names={:?}",
            names
        );
        // Process 1 has raw_lines → should produce a raw file. Process 2 is missing → omitted.
        let raw_files: Vec<&String> = names.iter().filter(|n| n.starts_with("raw/")).collect();
        assert_eq!(raw_files.len(), 1, "got: {:?}", raw_files);
        assert!(raw_files[0].starts_with("raw/01-"));
        assert!(raw_files[0].ends_with(".jsonl"));
    }
}
