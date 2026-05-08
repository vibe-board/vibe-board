# Terminal Tab Close: Kill Process & Stop Data Immediately

## Problem

Closing a terminal tab today keeps the PTY process alive in the background. The user expects the tab's X button to terminate the underlying process and stop data transfer immediately.

### Current flow

1. User clicks the X on a terminal tab.
2. `TerminalPanel.onTabClose` dispatches `closeTab(workspaceId, tabId)` (`frontend/src/components/panels/TerminalPanel.tsx:53-56`).
3. `TerminalContext` removes the tab from state. React unmounts `<XTermInstance>`.
4. `XTermInstance` cleanup effect (`frontend/src/components/panels/XTermInstance.tsx:325-337`) calls `ws.close()`.
5. Backend `handle_terminal_ws` (`crates/server/src/routes/terminal.rs:341-371`) sees the WS close, aborts the output task, then:
   ```rust
   if *exit_rx.borrow() {
       let _ = deployment.pty().close_session(session_id).await;
   } else {
       let _ = deployment.pty().detach_session(session_id).await;
   }
   ```
6. Because the PTY child is still running, the backend chooses `detach_session`. The session lingers for up to 30 minutes (cleanup in `crates/local-deployment/src/pty.rs:139-162`). Long‑running commands such as `npm run dev` keep consuming resources (and holding ports) invisibly.

### Why this design exists today

`detach_session` is deliberate. It allows reconnection after a page reload or a network hiccup, paired with `vt100`‑based screen snapshots (`docs/superpowers/specs/2026-04-15-terminal-playback-elimination-design.md`) and a frontend `sessionId` that survives in localStorage.

### Requirement

Distinguish two user intents that currently look identical to the backend:

| Intent | Expected behavior |
| --- | --- |
| User clicks the X on a tab | Kill the child process, drop the session, stop all data transfer immediately. |
| Page reload / network drop / tab re-render | Keep the session for reconnection (unchanged). |

## Solution

Add an explicit, in‑band "close" signal on the existing terminal WebSocket. The frontend sends it **before** closing the socket when (and only when) the user closes the tab. The backend treats this signal as permission to terminate the PTY.

### 1. Frontend: imperative `closeIntentionally()` on `XTermInstance`

React state removal and component unmount happen synchronously once `CLOSE_TAB` is dispatched. There is no chance to send a WS message from a `useEffect` cleanup reliably (the WS may still be connecting, or the message may race the socket close). The unmount path is also shared with non‑intentional teardown (route changes, workspace clears) that must remain detach‑only.

Solution: expose an imperative handle.

**`XTermInstance.tsx`**

- Convert the component to `forwardRef`.
- Expose via `useImperativeHandle`:
  ```ts
  closeIntentionally(): void;
  ```
  Behavior:
  1. If `wsRef.current.readyState === WebSocket.OPEN`, send `{"type":"close"}`.
  2. Call `wsRef.current.close()`.
  3. Null out `wsRef.current` so the unmount cleanup effect does not call `close()` again.
- The existing unmount cleanup effect keeps its current behavior for all other paths: `ws.close()` with no prior message, i.e., a plain disconnect that the backend treats as a detach.

### 2. Frontend: wire the handle into the tab close button

**`TerminalPanel.tsx`**

- Keep an instance refs map: `const instanceRefs = useRef<Map<string, XTermInstanceHandle>>(new Map())`.
- Pass `ref={(h) => { if (h) instanceRefs.current.set(tab.id, h); else instanceRefs.current.delete(tab.id); }}` to each `<XTermInstance>`.
- In the `onTabClose` handler of `<TerminalTabBar>`:
  ```ts
  onTabClose={(tabId) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    instanceRefs.current.get(tabId)?.closeIntentionally();
    closeTab(tab.workspaceId, tabId);
  }}
  ```
- The `onClose` callback passed into `XTermInstance` (fired on a backend `exit` message) keeps calling `closeTab` only — the backend process is already gone, no kill signal needed.

### 3. Backend: new `TerminalCommand::Close` variant

**`crates/server/src/routes/terminal.rs`**

- Add the variant:
  ```rust
  #[derive(Debug, Deserialize)]
  #[serde(tag = "type", rename_all = "snake_case")]
  enum TerminalCommand {
      Input { data: String },
      Resize { cols: u16, rows: u16 },
      Close,
  }
  ```
- In `handle_terminal_ws`, track an `intentional_close` flag local to the handler:
  ```rust
  let mut intentional_close = false;
  while let Some(Ok(msg)) = ws_receiver.next().await {
      match msg {
          Message::Text(text) => {
              if let Ok(cmd) = serde_json::from_str::<TerminalCommand>(&text) {
                  match cmd {
                      TerminalCommand::Input { data } => { /* unchanged */ }
                      TerminalCommand::Resize { cols, rows } => { /* unchanged */ }
                      TerminalCommand::Close => {
                          intentional_close = true;
                          break;
                      }
                  }
              }
          }
          Message::Close(_) => break,
          _ => {}
      }
  }

  output_task.abort();

  if intentional_close || *exit_rx.borrow() {
      let _ = deployment.pty().close_session(session_id).await;
  } else {
      let _ = deployment.pty().detach_session(session_id).await;
  }
  ```

`break` stops accepting further input the moment the Close command arrives. `output_task.abort()` stops forwarding PTY output to the WS. `close_session` kills the child (see §4) and removes the session from the map.

### 4. Backend: `close_session` must actually kill the child

Today, `close_session` in `crates/local-deployment/src/pty.rs:434-444` only removes the session from the `HashMap`:

```rust
pub async fn close_session(&self, session_id: Uuid) -> Result<(), PtyError> {
    if let Some(mut session) = self.sessions.lock()?.remove(&session_id) {
        session.closed = true;
    }
    Ok(())
}
```

That is not sufficient. The child (`Box<dyn portable_pty::Child + Send>`) is owned by the closure captured by the output reader thread (`pty.rs:273-288`) and dropped there — with no external reference. Dropping the `MasterPty` closes the master fd, which makes the reader's next `read()` return EOF, which ends the reader thread, which then drops the child. But **dropping `Child` does not kill the process** in portable_pty. Interactive shells exit on SIGHUP when the master is closed; long‑running children (for example, `npm run dev` and its child processes) will not.

#### Refactor

Share the child handle between the reader thread and `close_session`:

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
    exit_tx: Arc<watch::Sender<bool>>,
    child: Arc<Mutex<Option<Box<dyn portable_pty::Child + Send>>>>,  // new
}
```

`std::sync::Mutex<T>` is `Sync` whenever `T: Send`, so `Arc<Mutex<Option<Box<dyn Child + Send>>>>` is `Send + Sync` without needing `Child: Sync`. Both the reader thread (`std::thread`) and the async `close_session` path can lock it.

- `create_session` stores the child in the `Arc<Mutex<Option<…>>>` and hands a clone to the reader thread. The reader thread no longer owns the child outright; on EOF it takes the child out of the `Option` and drops it (same final effect as today).
- `close_session` locks the `Option`, `take()`s the child, and calls `child.kill()` before dropping the session from the map:
  ```rust
  pub async fn close_session(&self, session_id: Uuid) -> Result<(), PtyError> {
      let session = {
          let mut sessions = self.sessions.lock().map_err(|_| PtyError::SessionClosed)?;
          sessions.remove(&session_id)
      };
      if let Some(session) = session {
          if let Ok(mut guard) = session.child.lock() {
              if let Some(mut child) = guard.take() {
                  let _ = child.kill();
              }
          }
          // Session drops at end of scope: master fd closes; reader thread sees EOF and exits.
      }
      Ok(())
  }
  ```

After `child.kill()` returns, the reader's `read()` returns (EOF or error), the reader thread signals `exit_tx.send(true)`, and the output task — still running for a moment inside the WS handler — is aborted by `output_task.abort()` so the client receives no further output.

If the child self-exits (user types `exit`) before `close_session` is called, the reader thread takes the child out of the `Option` first. `close_session` then finds `None` and skips the kill — correct behavior, since there is nothing to kill.

### 5. Stop data transmission immediately

The three layers combine so no stale data reaches the client after close:

1. Frontend: `ws.close()` runs on the same tick as the `{"type":"close"}` send. The client's `onmessage` handler stops receiving.
2. Backend WS handler: `TerminalCommand::Close` → `break` → `output_task.abort()`. Any in‑flight `Output` message is dropped before send.
3. Backend PTY: `child.kill()` ends the source of new output.

No grace period, no lingering send, no detached session.

### 6. Behaviors left unchanged

- **Page reload / network drop / tab unmount for other reasons**: `XTermInstance` cleanup effect still runs, still calls `ws.close()` with **no prior `{"type":"close"}`**. Backend takes the `detach_session` branch. `sessionId` in localStorage lets the user reconnect within 30 minutes.
- **Process self-exits** (shell `exit`, crash): `exit_rx` flips to `true` as today; backend hits the `close_session` branch (already current behavior). No child kill needed — it already exited.
- **Detached session cleanup timer**: unchanged (30 minutes, `pty.rs:139-162`).
- **`session_info` / `session_expired` messages and the vt100 snapshot on reconnect**: unchanged.
- **`clearWorkspaceTabs`** (the "navigate away from project" path that already removes tabs): currently drops tabs via the same unmount route. Intentional termination here would be a policy change; leave as detach for now, matching current expectations. (If desired later, call `closeIntentionally()` per tab before clearing.)

## Files Changed

### Frontend
- `frontend/src/components/panels/XTermInstance.tsx` — convert to `forwardRef`, add `useImperativeHandle` exposing `closeIntentionally()`, update unmount cleanup to avoid double-close when `wsRef.current` was already nulled.
- `frontend/src/components/panels/TerminalPanel.tsx` — track instance refs keyed by `tab.id`; call `closeIntentionally()` in `onTabClose` before `closeTab()`.

### Backend
- `crates/server/src/routes/terminal.rs` — add `TerminalCommand::Close`, `intentional_close` flag, branch on it when deciding `close_session` vs `detach_session`.
- `crates/local-deployment/src/pty.rs` — add `child: Arc<Mutex<Option<Box<dyn Child + Send + Sync>>>>` to `PtySession`; share with reader thread; have `close_session` call `child.kill()` before dropping the session.

### Tests
- Rust unit test in `crates/local-deployment/src/pty.rs`: create a session running a long-lived command (for example `sleep 60`), call `close_session`, assert `exit_rx` flips within a short timeout and the session is gone from the map.
- Manual verification: run `sleep 1000` or a dev server in a terminal tab, click X, confirm via `ps` that the child PID no longer exists and any bound port is released.

## Edge Cases

- **`sessionId` is still null** (WebSocket hasn't returned `session_info` yet): `closeIntentionally()` still sends `{"type":"close"}` over the open WS. Backend finds the session by its in‑memory id and kills it. If the WS was never opened, nothing to send — the session never existed on the backend either.
- **WS already closed before user clicks X** (rare: backend crashed or network lost): `readyState !== OPEN`, send is skipped, `ws.close()` is a no-op. The session, if it still exists, will be reaped by the 30‑minute sweeper. Acceptable.
- **Rapid close of multiple tabs**: each tab independently sends its own `{"type":"close"}`. No cross-tab coordination needed.
- **User reloads the page immediately after closing a tab**: the reloaded client has no memory of the closed tab's `sessionId` (localStorage was updated synchronously on CLOSE_TAB), so it does not attempt to reconnect. Backend has already killed it.
- **portable_pty `Child::kill()` returns an error** (process already dead, platform quirk): logged and ignored. Session is still removed from the map; reader thread will converge via EOF.

## Out of Scope

- A confirmation dialog before closing a tab that has a running process.
- Reducing the 30‑minute detached-session timeout.
- An API to kill a session by id from elsewhere (for example, the UI) without a WS.
- Changing the behavior of `clearWorkspaceTabs` or route-change unmounts.
