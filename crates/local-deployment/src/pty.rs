use std::{
    collections::{HashMap, VecDeque},
    io::{Read, Write},
    path::PathBuf,
    sync::{
        Arc, Mutex, RwLock,
        atomic::{AtomicBool, AtomicI64, AtomicUsize, Ordering},
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use thiserror::Error;
use tokio::sync::{broadcast, watch};
use utils::shell::get_interactive_shell;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum PtyError {
    #[error("Failed to create PTY: {0}")]
    CreateFailed(String),
    #[error("Session not found: {0}")]
    SessionNotFound(Uuid),
    #[error("Failed to write to PTY: {0}")]
    WriteFailed(String),
    #[error("Failed to resize PTY: {0}")]
    ResizeFailed(String),
    #[error("Session already closed")]
    SessionClosed,
    #[error("Session attach failed: {0}")]
    AttachFailed(String),
}

/// Ring buffer for terminal output history with broadcast for live delivery.
/// Similar to MsgStore but for raw bytes instead of LogMsg.
struct TerminalBuffer {
    sender: broadcast::Sender<Vec<u8>>,
    history: RwLock<VecDeque<Vec<u8>>>,
    total_bytes: std::sync::atomic::AtomicUsize,
}

const MAX_TERMINAL_BUFFER_BYTES: usize = 1024 * 1024; // 1 MB

impl TerminalBuffer {
    fn new() -> Self {
        let (sender, _) = broadcast::channel(10000);
        Self {
            sender,
            history: RwLock::new(VecDeque::with_capacity(128)),
            total_bytes: AtomicUsize::new(0),
        }
    }

    fn push(&self, data: Vec<u8>) {
        let _ = self.sender.send(data.clone()); // live listeners

        let bytes = data.len();
        let mut history = self.history.write().unwrap();

        // Evict old entries if we'd exceed the limit
        while self
            .total_bytes
            .load(Ordering::Relaxed)
            .saturating_add(bytes)
            > MAX_TERMINAL_BUFFER_BYTES
        {
            if let Some(front) = history.pop_front() {
                self.total_bytes.fetch_sub(front.len(), Ordering::Relaxed);
            } else {
                break;
            }
        }

        self.total_bytes.fetch_add(bytes, Ordering::Relaxed);
        history.push_back(data);
    }

    fn get_history(&self) -> Vec<Vec<u8>> {
        self.history.read().unwrap().iter().cloned().collect()
    }

    fn subscribe(&self) -> broadcast::Receiver<Vec<u8>> {
        self.sender.subscribe()
    }
}

struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    _output_handle: thread::JoinHandle<()>,
    closed: bool,
    buffer: Arc<TerminalBuffer>,
    attached: AtomicBool,
    last_activity: AtomicI64,
    /// Sender for the exit notification
    exit_tx: Arc<watch::Sender<bool>>,
}

impl PtySession {
    fn update_activity(&self) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        self.last_activity.store(now, Ordering::Relaxed);
    }

    fn seconds_since_activity(&self) -> i64 {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        now.saturating_sub(self.last_activity.load(Ordering::Relaxed))
    }
}

#[derive(Clone)]
pub struct PtyService {
    sessions: Arc<Mutex<HashMap<Uuid, PtySession>>>,
}

impl PtyService {
    pub fn new() -> Self {
        let service = Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        };

        // Spawn background cleanup task for detached sessions
        let sessions = service.sessions.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(300)); // 5 minutes
            loop {
                interval.tick().await;
                Self::cleanup_detached_sessions(&sessions);
            }
        });

        service
    }

    fn cleanup_detached_sessions(sessions: &Arc<Mutex<HashMap<Uuid, PtySession>>>) {
        let mut to_remove = Vec::new();
        if let Ok(sessions) = sessions.lock() {
            for (id, session) in sessions.iter() {
                // Remove sessions detached for > 30 minutes
                if !session.attached.load(Ordering::Relaxed)
                    && session.seconds_since_activity() > 1800
                {
                    to_remove.push(*id);
                }
            }
        }

        if !to_remove.is_empty()
            && let Ok(mut sessions) = sessions.lock()
        {
            for id in to_remove {
                if let Some(mut session) = sessions.remove(&id) {
                    session.closed = true;
                    tracing::info!("Cleaned up detached terminal session: {}", id);
                }
            }
        }
    }

    pub async fn create_session(
        &self,
        working_dir: PathBuf,
        cols: u16,
        rows: u16,
    ) -> Result<(Uuid, broadcast::Receiver<Vec<u8>>, watch::Receiver<bool>), PtyError> {
        let session_id = Uuid::new_v4();
        let buffer = Arc::new(TerminalBuffer::new());
        let buffer_clone = buffer.clone();
        let (exit_tx, exit_rx) = watch::channel(false);
        let exit_tx = Arc::new(exit_tx);
        let exit_tx_clone = exit_tx.clone();
        let shell = get_interactive_shell().await;

        let result = tokio::task::spawn_blocking(move || {
            let pty_system = NativePtySystem::default();

            let pty_pair = pty_system
                .openpty(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| PtyError::CreateFailed(e.to_string()))?;

            let mut cmd = CommandBuilder::new(&shell);
            cmd.cwd(&working_dir);

            // Configure shell-specific options
            let shell_name = shell.file_name().and_then(|n| n.to_str()).unwrap_or("");

            if shell_name == "powershell.exe" || shell_name == "pwsh.exe" {
                // PowerShell: use -NoLogo for cleaner startup
                cmd.arg("-NoLogo");
            } else if shell_name == "cmd.exe" {
                // cmd.exe: no special args needed
            } else {
                // Unix shells: -i makes the shell interactive (loads .bashrc/.zshrc, shows prompt)
                cmd.arg("-i");
                cmd.env("VIBE_BOARD_TERMINAL", "1");

                if shell_name == "bash" {
                    cmd.env("PROMPT_COMMAND", r#"PS1='$ '; unset PROMPT_COMMAND"#);
                } else if shell_name == "zsh" {
                    // PROMPT is set after spawning
                } else {
                    cmd.env("PS1", "$ ");
                }
            }

            cmd.env("TERM", "xterm-256color");
            cmd.env("COLORTERM", "truecolor");

            // Remove vibe-board port env vars to prevent conflicts
            // when the shell starts its own servers (same as dev server / agent executor)
            cmd.env_remove("PORT");
            cmd.env_remove("BACKEND_PORT");
            cmd.env_remove("FRONTEND_PORT");
            cmd.env_remove("HOST");

            // Share Cargo build cache across worktrees for Rust projects.
            if working_dir.join("Cargo.toml").exists() {
                if let Some(sccache_path) =
                    utils::shell::resolve_executable_path_blocking("sccache")
                {
                    cmd.env("RUSTC_WRAPPER", sccache_path.display().to_string());
                    let mut basedirs = Vec::new();
                    if let Some(parent) = working_dir.parent() {
                        basedirs.push(parent.display().to_string());
                    }
                    basedirs.push(
                        services::services::worktree_manager::WorktreeManager::get_worktree_base_dir()
                            .display()
                            .to_string(),
                    );
                    cmd.env("SCCACHE_BASEDIRS", basedirs.join(":"));
                } else {
                    cmd.env(
                        "CARGO_TARGET_DIR",
                        working_dir.join("target").display().to_string(),
                    );
                }
            }

            let child = pty_pair
                .slave
                .spawn_command(cmd)
                .map_err(|e| PtyError::CreateFailed(e.to_string()))?;

            let mut writer = pty_pair
                .master
                .take_writer()
                .map_err(|e| PtyError::CreateFailed(e.to_string()))?;

            if shell_name == "zsh" {
                let _ = writer.write_all(b" PROMPT='$ '; RPROMPT=''\n");
                let _ = writer.flush();
                let _ = writer.write_all(b"\x0c");
                let _ = writer.flush();
            }

            let mut reader = pty_pair
                .master
                .try_clone_reader()
                .map_err(|e| PtyError::CreateFailed(e.to_string()))?;

            let output_handle = thread::spawn(move || {
                let mut buf = [0u8; 4096];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            buffer_clone.push(buf[..n].to_vec());
                        }
                        Err(_) => break,
                    }
                }
                let _ = exit_tx_clone.send(true);
                drop(child);
            });

            Ok::<_, PtyError>((pty_pair.master, writer, output_handle))
        })
        .await
        .map_err(|e| PtyError::CreateFailed(e.to_string()))??;

        let (master, writer, output_handle) = result;

        let session = PtySession {
            writer,
            master,
            _output_handle: output_handle,
            closed: false,
            buffer,
            attached: AtomicBool::new(true),
            last_activity: AtomicI64::new(
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64,
            ),
            exit_tx,
        };

        self.sessions
            .lock()
            .map_err(|e| PtyError::CreateFailed(e.to_string()))?
            .insert(session_id, session);

        // Return a new receiver for live output
        let rx = self
            .sessions
            .lock()
            .map_err(|e| PtyError::CreateFailed(e.to_string()))?
            .get(&session_id)
            .ok_or(PtyError::SessionNotFound(session_id))?
            .buffer
            .subscribe();

        Ok((session_id, rx, exit_rx))
    }

    /// Attach to an existing session, returning buffered history and a new receiver.
    /// Returns SessionNotFound if the session doesn't exist.
    pub async fn attach_session(
        &self,
        session_id: Uuid,
    ) -> Result<
        (
            Vec<Vec<u8>>,
            broadcast::Receiver<Vec<u8>>,
            watch::Receiver<bool>,
        ),
        PtyError,
    > {
        let sessions = self
            .sessions
            .lock()
            .map_err(|e| PtyError::AttachFailed(e.to_string()))?;

        let session = sessions
            .get(&session_id)
            .ok_or(PtyError::SessionNotFound(session_id))?;

        if session.closed {
            return Err(PtyError::SessionClosed);
        }

        let history = session.buffer.get_history();
        let rx = session.buffer.subscribe();
        session.attached.store(true, Ordering::Relaxed);
        session.update_activity();
        let exit_rx = (*session.exit_tx).subscribe();

        Ok((history, rx, exit_rx))
    }

    /// Detach from a session without closing it. Session keeps running in background.
    pub async fn detach_session(&self, session_id: Uuid) -> Result<(), PtyError> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|e| PtyError::AttachFailed(e.to_string()))?;

        if let Some(session) = sessions.get(&session_id) {
            session.attached.store(false, Ordering::Relaxed);
            session.update_activity();
        }

        Ok(())
    }

    pub async fn write(&self, session_id: Uuid, data: &[u8]) -> Result<(), PtyError> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|e| PtyError::WriteFailed(e.to_string()))?;
        let session = sessions
            .get_mut(&session_id)
            .ok_or(PtyError::SessionNotFound(session_id))?;

        if session.closed {
            return Err(PtyError::SessionClosed);
        }

        session
            .writer
            .write_all(data)
            .map_err(|e| PtyError::WriteFailed(e.to_string()))?;

        session
            .writer
            .flush()
            .map_err(|e| PtyError::WriteFailed(e.to_string()))?;

        Ok(())
    }

    pub async fn resize(&self, session_id: Uuid, cols: u16, rows: u16) -> Result<(), PtyError> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|e| PtyError::ResizeFailed(e.to_string()))?;
        let session = sessions
            .get(&session_id)
            .ok_or(PtyError::SessionNotFound(session_id))?;

        if session.closed {
            return Err(PtyError::SessionClosed);
        }

        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| PtyError::ResizeFailed(e.to_string()))?;

        Ok(())
    }

    pub async fn close_session(&self, session_id: Uuid) -> Result<(), PtyError> {
        if let Some(mut session) = self
            .sessions
            .lock()
            .map_err(|_| PtyError::SessionClosed)?
            .remove(&session_id)
        {
            session.closed = true;
        }
        Ok(())
    }

    pub fn session_exists(&self, session_id: &Uuid) -> bool {
        self.sessions
            .lock()
            .map(|s| s.contains_key(session_id))
            .unwrap_or(false)
    }
}

impl Default for PtyService {
    fn default() -> Self {
        Self::new()
    }
}
