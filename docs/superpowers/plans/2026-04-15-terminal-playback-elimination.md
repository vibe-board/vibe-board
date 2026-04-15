# Terminal Playback Elimination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the full terminal history replay on reconnection with a single vt100 screen snapshot, eliminating the fast-forward playback animation.

**Architecture:** Add a `vt100::Parser` to each `PtySession` that mirrors all PTY output. On reconnection, `attach_session()` returns a screen snapshot (`contents_formatted()`) instead of the full ring buffer history. The WebSocket handler sends this snapshot as a single `output` message.

**Tech Stack:** Rust, `vt100` crate, existing `portable-pty` / `tokio` / `axum` WebSocket stack.

---

## File Structure

| File | Role |
|---|---|
| `crates/local-deployment/Cargo.toml` | Add `vt100` dependency |
| `crates/local-deployment/src/pty.rs` | Add parser to `PtySession`, feed output, snapshot, resize sync, change `attach_session` return type |
| `crates/server/src/routes/terminal.rs` | Send snapshot instead of history loop on reconnect |

---

### Task 1: Add `vt100` dependency

**Files:**
- Modify: `crates/local-deployment/Cargo.toml:26`

- [ ] **Step 1: Add vt100 to Cargo.toml**

In `crates/local-deployment/Cargo.toml`, add after the `portable-pty = "0.8"` line:

```toml
vt100 = "0.15"
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p local-deployment`
Expected: compiles with no errors (warnings OK).

- [ ] **Step 3: Commit**

```bash
git add crates/local-deployment/Cargo.toml
git commit -m "feat(terminal): add vt100 crate for virtual screen buffer"
```

---

### Task 2: Add `vt100::Parser` to `PtySession` and feed PTY output

**Files:**
- Modify: `crates/local-deployment/src/pty.rs`

- [ ] **Step 1: Add the `vt100_parser` field to `PtySession`**

In `crates/local-deployment/src/pty.rs`, add a new field to the `PtySession` struct (after the `buffer` field on line 93):

```rust
struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    _output_handle: thread::JoinHandle<()>,
    closed: bool,
    buffer: Arc<TerminalBuffer>,
    vt100_parser: Arc<Mutex<vt100::Parser>>,
    attached: AtomicBool,
    last_activity: AtomicI64,
    /// Sender for the exit notification
    exit_tx: Arc<watch::Sender<bool>>,
}
```

- [ ] **Step 2: Create the parser in `create_session` and pass it to the output thread**

In the `create_session` method, after `let buffer_clone = buffer.clone();` (line 175), add:

```rust
let vt100_parser = Arc::new(Mutex::new(vt100::Parser::new(rows, cols, 0)));
let parser_clone = vt100_parser.clone();
```

- [ ] **Step 3: Feed PTY output to the parser in the reader thread**

In the output reader thread (the `thread::spawn` closure starting at line 274), change the `Ok(n)` arm from:

```rust
Ok(n) => {
    buffer_clone.push(buf[..n].to_vec());
}
```

to:

```rust
Ok(n) => {
    let chunk = &buf[..n];
    buffer_clone.push(chunk.to_vec());
    parser_clone.lock().unwrap().process(chunk);
}
```

- [ ] **Step 4: Add `vt100_parser` to the `PtySession` struct construction**

In the `PtySession` construction (around line 296), add the new field:

```rust
let session = PtySession {
    writer,
    master,
    _output_handle: output_handle,
    closed: false,
    buffer,
    vt100_parser,
    attached: AtomicBool::new(true),
    last_activity: AtomicI64::new(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64,
    ),
    exit_tx,
};
```

- [ ] **Step 5: Verify it compiles**

Run: `cargo check -p local-deployment`
Expected: compiles with no errors. There may be a warning about `get_history` being unused — that's fine and will be addressed in Task 3.

- [ ] **Step 6: Commit**

```bash
git add crates/local-deployment/src/pty.rs
git commit -m "feat(terminal): add vt100 parser to PtySession and feed PTY output"
```

---

### Task 3: Change `attach_session` to return a screen snapshot

**Files:**
- Modify: `crates/local-deployment/src/pty.rs`

- [ ] **Step 1: Change the `attach_session` return type and implementation**

Replace the entire `attach_session` method (lines 332–363) with:

```rust
/// Attach to an existing session, returning a screen snapshot and a new receiver.
/// Returns SessionNotFound if the session doesn't exist.
pub async fn attach_session(
    &self,
    session_id: Uuid,
) -> Result<
    (
        Vec<u8>,
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

    let snapshot = session
        .vt100_parser
        .lock()
        .unwrap()
        .screen()
        .contents_formatted();
    let rx = session.buffer.subscribe();
    session.attached.store(true, Ordering::Relaxed);
    session.update_activity();
    let exit_rx = (*session.exit_tx).subscribe();

    Ok((snapshot, rx, exit_rx))
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p local-deployment`
Expected: compiles. The `terminal.rs` caller will now have a type mismatch — that's expected and fixed in Task 5.

Actually, since `terminal.rs` is in a different crate (`server`), this will only fail when checking that crate. Let's verify just `local-deployment` first:

Run: `cargo check -p local-deployment`
Expected: compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add crates/local-deployment/src/pty.rs
git commit -m "feat(terminal): return screen snapshot from attach_session instead of full history"
```

---

### Task 4: Add resize sync for the vt100 parser

**Files:**
- Modify: `crates/local-deployment/src/pty.rs`

- [ ] **Step 1: Add parser resize in the `resize` method**

In `PtyService::resize()` (line 406), add the parser resize call after the `master.resize()` call. Replace the method with:

```rust
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

    session
        .vt100_parser
        .lock()
        .unwrap()
        .set_size(rows, cols);

    Ok(())
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p local-deployment`
Expected: compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add crates/local-deployment/src/pty.rs
git commit -m "feat(terminal): sync vt100 parser size on terminal resize"
```

---

### Task 5: Update WebSocket handler to send snapshot instead of history loop

**Files:**
- Modify: `crates/server/src/routes/terminal.rs`

- [ ] **Step 1: Update the `handle_terminal_ws` function**

In `crates/server/src/routes/terminal.rs`, the `handle_terminal_ws` function needs two changes.

**Change 1:** Update the variable destructuring (line 200) to use `snapshot` instead of `history`, and change the type from `Vec<Vec<u8>>` to `Vec<u8>`.

Replace line 200:
```rust
let (session_id, mut output_rx, history, session_expired, mut exit_rx) =
```
with:
```rust
let (session_id, mut output_rx, snapshot, session_expired, mut exit_rx) =
```

**Change 2:** In the `attach_session` success arm (line 205), rename `history` to `snapshot`:

Replace:
```rust
Ok((history, rx, exit)) => {
    tracing::info!("Reattached to terminal session: {}", existing_id);
    (existing_id, rx, history, false, exit)
}
```
with:
```rust
Ok((snapshot, rx, exit)) => {
    tracing::info!("Reattached to terminal session: {}", existing_id);
    (existing_id, rx, snapshot, false, exit)
}
```

**Change 3:** In the `create_session` fallback (line 219), change `vec![]` to `vec![]` (it stays the same — an empty `Vec<u8>` is already correct for the new type).

**Change 4:** In the other `create_session` branch (line 235), same — `vec![]` stays as-is.

**Change 5:** Replace the history replay loop (lines 263–271):

Replace:
```rust
// Send buffered history first
for data in history {
    let msg = TerminalMessage::Output {
        data: BASE64.encode(&data),
    };
    let json = serde_json::to_string(&msg).unwrap_or_default();
    if ws_sender.send(Message::Text(json.into())).await.is_err() {
        return;
    }
}
```

with:
```rust
// Send screen snapshot for reconnection
if !snapshot.is_empty() {
    let msg = TerminalMessage::Output {
        data: BASE64.encode(&snapshot),
    };
    let json = serde_json::to_string(&msg).unwrap_or_default();
    if ws_sender.send(Message::Text(json.into())).await.is_err() {
        return;
    }
}
```

- [ ] **Step 2: Verify the full workspace compiles**

Run: `cargo check --workspace`
Expected: compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add crates/server/src/routes/terminal.rs
git commit -m "feat(terminal): send screen snapshot on reconnect instead of replaying history"
```

---

### Task 6: Remove unused `get_history` method

**Files:**
- Modify: `crates/local-deployment/src/pty.rs`

- [ ] **Step 1: Check if `get_history` is used anywhere**

Run: `grep -r "get_history" crates/`
Expected: only the definition in `pty.rs` — no callers remain after Task 3.

- [ ] **Step 2: Remove the `get_history` method from `TerminalBuffer`**

In `crates/local-deployment/src/pty.rs`, remove the `get_history` method (lines 79–81):

```rust
fn get_history(&self) -> Vec<Vec<u8>> {
    self.history.read().unwrap().iter().cloned().collect()
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cargo check --workspace`
Expected: compiles with no errors and no warnings about unused methods.

- [ ] **Step 4: Commit**

```bash
git add crates/local-deployment/src/pty.rs
git commit -m "refactor(terminal): remove unused get_history method"
```

---

### Task 7: Run full test suite

**Files:** None (verification only)

- [ ] **Step 1: Run workspace tests**

Run: `cargo test --workspace`
Expected: all tests pass.

- [ ] **Step 2: Run backend check**

Run: `cargo check --workspace`
Expected: no errors.
