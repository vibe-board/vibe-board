# Terminal Tab Close: Kill Process & Stop Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user clicks the X on a terminal tab, kill the backend PTY process and stop all data transfer immediately, while preserving today's session-keep-alive behavior for page reloads / network drops.

**Architecture:** Introduce an in-band `{"type":"close"}` WebSocket command the frontend sends *before* closing the socket on intentional tab close. Backend distinguishes this from a bare WS close and takes the `close_session` branch (which now truly kills the child via `portable_pty::ChildKiller`) instead of `detach_session`. All other teardown paths remain detach-only.

**Tech Stack:** Rust (axum WS handler, portable-pty, tokio::sync::watch / broadcast, std::sync::Mutex), React + TypeScript (forwardRef / useImperativeHandle, xterm.js).

Spec: `docs/superpowers/specs/2026-05-08-terminal-close-design.md`

---

## File Structure

| File | Responsibility | Change type |
| --- | --- | --- |
| `crates/local-deployment/src/pty.rs` | PTY session lifecycle; owns child process; provides kill handle | Modify |
| `crates/server/src/routes/terminal.rs` | Terminal WS handler; translates client commands to PTY ops; decides close vs detach on disconnect | Modify |
| `frontend/src/components/panels/XTermInstance.tsx` | xterm.js instance; owns the WebSocket for one terminal tab | Modify |
| `frontend/src/components/panels/TerminalPanel.tsx` | Renders all tabs; handles tab-close button wiring | Modify |

No new files. No new crates or npm packages.

---

## Task 1: Backend — Store a `ChildKiller` in `PtySession`

**Goal:** Keep a handle to the child process outside the reader thread, so `close_session` can signal it. This task is pure refactor — no behavior change yet, just plumbing.

**Context:** Today the child is moved into the reader thread at `crates/local-deployment/src/pty.rs:273-288` and only dropped there. `portable_pty::Child` extends `ChildKiller`, and `clone_killer()` returns `Box<dyn ChildKiller + Send + Sync>` designed exactly for this use — signaling the child from a separate thread. We call it *before* moving the child into the reader thread.

**Files:**
- Modify: `crates/local-deployment/src/pty.rs`

- [ ] **Step 1.1: Add `child_killer` field to `PtySession`**

Locate the `PtySession` struct (`crates/local-deployment/src/pty.rs:84-95`). Add the new field after `exit_tx`:

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
    /// Killer handle cloned from the child before it moved into the reader
    /// thread. Allows `close_session` to signal the child from outside.
    child_killer: Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>,
}
```

The comment is the only comment you add in this file — it records the non-obvious reason (child is owned by the reader thread, so we need a separate signaling path).

- [ ] **Step 1.2: Populate `child_killer` in `create_session`**

Find the block that spawns the child inside `tokio::task::spawn_blocking` (`crates/local-deployment/src/pty.rs:251-254`):

```rust
let child = pty_pair
    .slave
    .spawn_command(cmd)
    .map_err(|e| PtyError::CreateFailed(e.to_string()))?;
```

Immediately after it (before any code that consumes `child`), clone the killer:

```rust
let child = pty_pair
    .slave
    .spawn_command(cmd)
    .map_err(|e| PtyError::CreateFailed(e.to_string()))?;

let child_killer = child.clone_killer();
```

Find where the blocking task returns its tuple (`crates/local-deployment/src/pty.rs:290`, currently `Ok::<_, PtyError>((pty_pair.master, writer, output_handle))`) and extend it to carry `child_killer`:

```rust
Ok::<_, PtyError>((pty_pair.master, writer, output_handle, child_killer))
```

Update the destructuring right after `.await??` (`crates/local-deployment/src/pty.rs:295`):

```rust
let (master, writer, output_handle, child_killer) = result;
```

And add the field to the `PtySession { ... }` literal (`crates/local-deployment/src/pty.rs:297-312`):

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
    child_killer: Mutex::new(child_killer),
};
```

- [ ] **Step 1.3: Compile**

Run: `cargo check -p local-deployment`
Expected: clean build, no warnings about the new field (it is used as a field of an instance that gets inserted into the map; Rust will not warn about unused struct fields when the struct is constructed and moved into a collection).

- [ ] **Step 1.4: Run full test suite to confirm no regression**

Run: `cargo test --workspace`
Expected: all existing tests pass. There are no existing tests in `pty.rs`, so the surface area is limited to compile-level checks.

- [ ] **Step 1.5: Commit**

```bash
git add crates/local-deployment/src/pty.rs
git commit -m "refactor(pty): store ChildKiller handle alongside session"
```

---

## Task 2: Backend — Failing test that `close_session` kills the child

**Goal:** Write a test that asserts calling `close_session` on a live session causes the child process to terminate (observable via `exit_rx` flipping). Current code does not kill the child, so this test must FAIL.

**Context:** Tests in the codebase live in `#[cfg(test)] mod tests` blocks at the bottom of the relevant file (see `crates/local-deployment/src/copy.rs:117` for precedent). The PTY runs a real interactive shell via `get_interactive_shell()`; that shell is a long-running process that will not exit on its own within the test timeout. Thus `close_session` is the only thing that can cause the reader thread to see EOF and flip `exit_tx`. The test is `#[cfg(unix)]` because Windows PTY semantics differ and the project's PTY tests can reasonably focus on Unix.

**Files:**
- Modify: `crates/local-deployment/src/pty.rs`

- [ ] **Step 2.1: Append a test module to `pty.rs`**

Add to the very end of `crates/local-deployment/src/pty.rs`, after the existing `impl Default for PtyService` block:

```rust
#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::time::Duration;

    /// Calling `close_session` on a live session must cause the child process
    /// to exit within a short deadline — observable via `exit_rx` flipping
    /// from false to true.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn close_session_kills_child() {
        let service = PtyService::new();
        let tmp = tempfile::tempdir().expect("tempdir");
        let (session_id, _rx, mut exit_rx) = service
            .create_session(tmp.path().to_path_buf(), 80, 24)
            .await
            .expect("create_session");

        // Give the interactive shell a moment to finish starting up so the
        // reader thread is actually parked on a read by the time we close.
        tokio::time::sleep(Duration::from_millis(200)).await;

        // Sanity: the process has not exited yet.
        assert!(!*exit_rx.borrow(), "shell should still be running before close");

        service
            .close_session(session_id)
            .await
            .expect("close_session");

        // After closing, exit_rx must flip to true within 2 seconds.
        tokio::time::timeout(Duration::from_secs(2), exit_rx.changed())
            .await
            .expect("exit_rx should fire within 2s after close_session")
            .expect("exit_tx sender should not be dropped prematurely");
        assert!(*exit_rx.borrow(), "process should be marked exited");

        // Session should be gone from the map.
        assert!(
            !service.session_exists(&session_id),
            "session should be removed after close"
        );
    }
}
```

- [ ] **Step 2.2: Run the test to confirm it FAILS**

Run: `cargo test -p local-deployment close_session_kills_child -- --nocapture`
Expected: FAIL. The timeout on `exit_rx.changed()` fires because dropping the master fd with a cloned reader still open does not reliably cause the shell to exit within 2s. Error message will be something like `exit_rx should fire within 2s after close_session: Elapsed(())`.

If the test unexpectedly passes on your machine (possible: some shells respond quickly to master close), proceed to Task 3 anyway — the production fix is still correct and makes the test deterministic.

- [ ] **Step 2.3: Commit**

```bash
git add crates/local-deployment/src/pty.rs
git commit -m "test(pty): add failing test for close_session killing child"
```

---

## Task 3: Backend — Make `close_session` kill the child

**Goal:** Update `close_session` to call `ChildKiller::kill()` via the stored handle before removing the session, turning the Task 2 test green.

**Context:** `close_session` today only removes the session from the map (`crates/local-deployment/src/pty.rs:434-444`). The new behavior: take the session out of the map, lock `child_killer`, call `kill()`, drop the session (which drops the master fd and consequently the reader-thread holding the cloned reader will see EOF once the child exits).

**Files:**
- Modify: `crates/local-deployment/src/pty.rs`

- [ ] **Step 3.1: Replace `close_session` body**

Find `pub async fn close_session` (`crates/local-deployment/src/pty.rs:434-444`). Replace the whole function with:

```rust
pub async fn close_session(&self, session_id: Uuid) -> Result<(), PtyError> {
    let removed = {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| PtyError::SessionClosed)?;
        sessions.remove(&session_id)
    };

    if let Some(mut session) = removed {
        // Signal the child to terminate. `ChildKiller::kill` is best-effort:
        // the child may already be gone (race with natural exit), in which
        // case the error is swallowed. The reader thread will then observe
        // EOF and flip `exit_tx` regardless.
        if let Ok(mut killer) = session.child_killer.lock() {
            let _ = killer.kill();
        }
        session.closed = true;
    }

    Ok(())
}
```

- [ ] **Step 3.2: Run the test to confirm it PASSES**

Run: `cargo test -p local-deployment close_session_kills_child -- --nocapture`
Expected: PASS. The shell dies from the kill signal; the reader's `read()` returns EOF; the reader thread calls `exit_tx.send(true)`; the test's `exit_rx.changed()` wakes and the assertions hold.

- [ ] **Step 3.3: Run the full workspace to catch regressions**

Run: `cargo test --workspace`
Expected: all tests pass.

- [ ] **Step 3.4: Commit**

```bash
git add crates/local-deployment/src/pty.rs
git commit -m "fix(pty): kill child process on close_session"
```

---

## Task 4: Backend — Add `TerminalCommand::Close` and `intentional_close` branching

**Goal:** Teach the terminal WebSocket handler to accept a `{"type":"close"}` client command, mark the disconnect as intentional, and call `close_session` instead of `detach_session`.

**Context:** The protocol enum is `TerminalCommand` (`crates/server/src/routes/terminal.rs:43-48`). Serde is configured with `#[serde(tag = "type", rename_all = "snake_case")]`, so a new unit variant `Close` will serialize and deserialize as `{"type":"close"}`. The disconnect branch lives at `crates/server/src/routes/terminal.rs:362-370`.

**Files:**
- Modify: `crates/server/src/routes/terminal.rs`

- [ ] **Step 4.1: Add the `Close` variant**

Find the `TerminalCommand` enum (`crates/server/src/routes/terminal.rs:43-48`). Change it from:

```rust
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum TerminalCommand {
    Input { data: String },
    Resize { cols: u16, rows: u16 },
}
```

to:

```rust
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum TerminalCommand {
    Input { data: String },
    Resize { cols: u16, rows: u16 },
    Close,
}
```

- [ ] **Step 4.2: Track `intentional_close` in the WS input loop**

Find `handle_terminal_ws` (`crates/server/src/routes/terminal.rs:191`). Locate the input loop (`crates/server/src/routes/terminal.rs:341-360`):

```rust
while let Some(Ok(msg)) = ws_receiver.next().await {
    match msg {
        Message::Text(text) => {
            if let Ok(cmd) = serde_json::from_str::<TerminalCommand>(&text) {
                match cmd {
                    TerminalCommand::Input { data } => {
                        if let Ok(bytes) = BASE64.decode(&data) {
                            let _ = pty_service.write(session_id_for_input, &bytes).await;
                        }
                    }
                    TerminalCommand::Resize { cols, rows } => {
                        let _ = pty_service.resize(session_id_for_input, cols, rows).await;
                    }
                }
            }
        }
        Message::Close(_) => break,
        _ => {}
    }
}
```

Replace it with:

```rust
let mut intentional_close = false;
while let Some(Ok(msg)) = ws_receiver.next().await {
    match msg {
        Message::Text(text) => {
            if let Ok(cmd) = serde_json::from_str::<TerminalCommand>(&text) {
                match cmd {
                    TerminalCommand::Input { data } => {
                        if let Ok(bytes) = BASE64.decode(&data) {
                            let _ = pty_service.write(session_id_for_input, &bytes).await;
                        }
                    }
                    TerminalCommand::Resize { cols, rows } => {
                        let _ = pty_service.resize(session_id_for_input, cols, rows).await;
                    }
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
```

- [ ] **Step 4.3: Change the close-vs-detach decision**

Still in `handle_terminal_ws`, locate the cleanup at the end (`crates/server/src/routes/terminal.rs:362-370`):

```rust
output_task.abort();

// Detach session instead of closing - session persists in background
// unless the process already exited
if *exit_rx.borrow() {
    let _ = deployment.pty().close_session(session_id).await;
} else {
    let _ = deployment.pty().detach_session(session_id).await;
}
```

Replace it with:

```rust
output_task.abort();

// Three outcomes, in priority:
//   1. Client sent `{"type":"close"}` -> user intentionally closed the tab; kill.
//   2. The PTY process already exited on its own -> clean up the session.
//   3. Bare WS disconnect (reload, network drop) -> detach for reconnection.
if intentional_close || *exit_rx.borrow() {
    let _ = deployment.pty().close_session(session_id).await;
} else {
    let _ = deployment.pty().detach_session(session_id).await;
}
```

- [ ] **Step 4.4: Compile and run tests**

Run: `cargo check -p server && cargo test --workspace`
Expected: clean build, all tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add crates/server/src/routes/terminal.rs
git commit -m "feat(terminal): honor intentional close from client, kill session"
```

---

## Task 5: Frontend — Expose `closeIntentionally()` on `XTermInstance`

**Goal:** Convert `XTermInstance` to `forwardRef` and expose a single imperative method `closeIntentionally()` that sends `{"type":"close"}` on the live WebSocket, closes it, and nulls the ref so the unmount cleanup does not double-close.

**Context:** `XTermInstance` is a function component at `frontend/src/components/panels/XTermInstance.tsx:83-387`. It holds `wsRef: MutableRefObject<WebSocketLike | null>` and disposes the socket in an unmount cleanup effect (`XTermInstance.tsx:325-337`). The existing cleanup path must remain unchanged for all other callers (route changes, workspace clears) — those still send no `{"type":"close"}` and the backend treats them as detach.

**Files:**
- Modify: `frontend/src/components/panels/XTermInstance.tsx`

- [ ] **Step 5.1: Add the handle type and switch to `forwardRef`**

At the top of `XTermInstance.tsx`, alongside the existing `useEffect, useRef, useMemo, useCallback` import from `'react'`, add `forwardRef` and `useImperativeHandle`:

```tsx
import {
  useEffect,
  useRef,
  useMemo,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
```

Below the `TerminalMessage` interface (around `XTermInstance.tsx:28`), add an exported handle interface:

```tsx
export interface XTermInstanceHandle {
  /**
   * User-initiated close: signal the backend to terminate the PTY, then
   * close the WebSocket. Must be called BEFORE the tab is removed from state
   * (which unmounts this component) — after unmount, the component is gone
   * and the cleanup effect runs as a plain disconnect (detach).
   */
  closeIntentionally: () => void;
}
```

Change the component declaration from:

```tsx
export function XTermInstance({
  endpointUrl,
  isActive,
  onClose,
  sessionId,
  onSessionId,
}: XTermInstanceProps) {
```

to a `forwardRef` wrapper:

```tsx
export const XTermInstance = forwardRef<XTermInstanceHandle, XTermInstanceProps>(
  function XTermInstance(
    { endpointUrl, isActive, onClose, sessionId, onSessionId },
    ref
  ) {
```

Then at the very end of the component body, change the trailing `}` that closes the function into `});` to close the `forwardRef` call. Concretely, find the final two lines of the file:

```tsx
  );
}
```

Replace them with:

```tsx
  );
});
```

- [ ] **Step 5.2: Wire the imperative handle**

Immediately after the existing `const { theme } = useTheme();` and `const conn = useConnection();` lines (around `XTermInstance.tsx:95-96`), add:

```tsx
useImperativeHandle(
  ref,
  () => ({
    closeIntentionally: () => {
      const ws = wsRef.current;
      if (!ws) return;
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'close' }));
        } catch {
          // Best-effort; if send throws, close still runs below.
        }
      }
      try {
        ws.close();
      } catch {
        // Ignore: any failure still results in the WS being torn down by
        // the upcoming unmount cleanup.
      }
      wsRef.current = null;
    },
  }),
  []
);
```

The empty dependency array is correct: the method only accesses `wsRef.current`, which is mutable and always reads the current value. Re-creating the handle on every render would cause the parent's ref callback to churn.

- [ ] **Step 5.3: Guard the unmount cleanup against a nulled ref**

Find the unmount cleanup effect (`XTermInstance.tsx:325-337`):

```tsx
// Cleanup on unmount or when endpoint changes
useEffect(() => {
  return () => {
    if (terminalRef.current) {
      terminalRef.current.dispose();
      terminalRef.current = null;
    }
    fitAddonRef.current = null;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };
}, [endpoint]);
```

This already guards `wsRef.current` with `if (wsRef.current)`, so nulling it in `closeIntentionally()` is sufficient. No changes needed in this step — verify by reading the block and confirming the `if (wsRef.current)` guard is present. If `closeIntentionally()` ran, `wsRef.current` is `null` and the cleanup effect skips the `close()`; nothing else changes.

- [ ] **Step 5.4: Type-check**

Run: `pnpm run check`
Expected: clean. If there are any TypeScript errors about the forwardRef signature, verify the imports and the handle interface name match exactly.

- [ ] **Step 5.5: Commit**

```bash
git add frontend/src/components/panels/XTermInstance.tsx
git commit -m "feat(terminal): expose closeIntentionally() on XTermInstance"
```

---

## Task 6: Frontend — `TerminalPanel` calls `closeIntentionally()` on tab close

**Goal:** Collect `XTermInstance` refs keyed by tab id and call `closeIntentionally()` in the tab-close handler *before* dispatching `closeTab()`.

**Context:** `TerminalPanel` renders `<XTermInstance>` in a `tabs.map(...)` (`frontend/src/components/panels/TerminalPanel.tsx:61-77`). The tab-close handler is at `TerminalPanel.tsx:53-56` inside the `<TerminalTabBar>` props. The `onClose` prop passed to each `<XTermInstance>` (fired on a backend `exit` message, `XTermInstance.tsx:210-213`) must keep its current semantics — the process is already gone, so no kill signal is needed; it just closes the tab state.

**Files:**
- Modify: `frontend/src/components/panels/TerminalPanel.tsx`

- [ ] **Step 6.1: Add imports and an instance refs map**

Update the imports at the top of `TerminalPanel.tsx`:

```tsx
import { useRef } from 'react';
import { useTerminal } from '@/contexts/TerminalContext';
import type { TerminalTabContext } from '@/contexts/TerminalContext';
import { TerminalTabBar } from './TerminalTabBar';
import { XTermInstance, type XTermInstanceHandle } from './XTermInstance';
```

(The current file has no `useRef` import because the component is props-only today; add it.)

Inside `TerminalPanel`, right after `const tabs = getAllTabs();` and `const activeTab = getActiveGlobalTab();` (around `TerminalPanel.tsx:40-41`), add:

```tsx
const instanceRefs = useRef<Map<string, XTermInstanceHandle>>(new Map());
```

- [ ] **Step 6.2: Wire the tab-close handler**

Replace the existing `onTabClose` prop on `<TerminalTabBar>` (`TerminalPanel.tsx:53-56`):

```tsx
onTabClose={(tabId) => {
  const tab = tabs.find((t) => t.id === tabId);
  if (tab) closeTab(tab.workspaceId, tabId);
}}
```

with:

```tsx
onTabClose={(tabId) => {
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return;
  instanceRefs.current.get(tabId)?.closeIntentionally();
  instanceRefs.current.delete(tabId);
  closeTab(tab.workspaceId, tabId);
}}
```

- [ ] **Step 6.3: Register each instance into the refs map**

Replace the `<XTermInstance>` element inside `tabs.map(...)` (`TerminalPanel.tsx:67-76`):

```tsx
return (
  <XTermInstance
    key={tab.id}
    endpointUrl={endpointUrl}
    isActive={tab.id === activeTab?.id}
    onClose={() => closeTab(tab.workspaceId, tab.id)}
    sessionId={tab.sessionId}
    onSessionId={(sid) => setSessionId(tab.workspaceId, tab.id, sid)}
  />
);
```

with:

```tsx
return (
  <XTermInstance
    key={tab.id}
    ref={(handle) => {
      if (handle) {
        instanceRefs.current.set(tab.id, handle);
      } else {
        instanceRefs.current.delete(tab.id);
      }
    }}
    endpointUrl={endpointUrl}
    isActive={tab.id === activeTab?.id}
    onClose={() => closeTab(tab.workspaceId, tab.id)}
    sessionId={tab.sessionId}
    onSessionId={(sid) => setSessionId(tab.workspaceId, tab.id, sid)}
  />
);
```

The `ref` callback fires with the handle on mount and with `null` on unmount, so the map stays in sync without an explicit cleanup effect.

- [ ] **Step 6.4: Type-check and lint**

Run: `pnpm run check && pnpm run lint`
Expected: clean.

- [ ] **Step 6.5: Commit**

```bash
git add frontend/src/components/panels/TerminalPanel.tsx
git commit -m "feat(terminal): kill PTY process when user closes a tab"
```

---

## Task 7: Manual end-to-end verification

**Goal:** Prove on a running system that (a) closing a tab kills a long-running process, and (b) reloading the page preserves the session.

**Files:** none (verification only).

- [ ] **Step 7.1: Start the dev stack**

Run: `pnpm run dev`
Expected: backend and frontend come up; console shows the assigned ports. Open the URL printed for the frontend in a browser.

- [ ] **Step 7.2: Verify tab close kills the child**

1. Open the terminal drawer and create a Home Directory or Project terminal tab.
2. In that tab, run `sleep 600 &`. Note the PID the shell prints.
3. In a separate OS terminal: `ps -p <PID>` — confirm the process is alive.
4. In the browser, click the X on the terminal tab.
5. Wait ~1 second. Re-run `ps -p <PID>`.
Expected: the process is gone. The `ps` command prints no entry (exit code 1). If the process is still alive, the kill path is not wired — go back and check Tasks 3, 4, and 6.

- [ ] **Step 7.3: Verify reload preserves the session**

1. Open a new terminal tab.
2. Run `echo hello; PS1='$ '` (leaves a visible prompt).
3. Reload the browser page (Cmd/Ctrl+R).
4. After reload, open the terminal drawer.
Expected: the tab is still present. Clicking it reconnects to the same shell session; the screen snapshot shows the `hello` output and the prompt. Backend logs should mention `Reattached to terminal session: <uuid>`.

- [ ] **Step 7.4: Verify port release for a dev-server-like case**

1. Open a terminal tab at a project root that has a web dev server.
2. Run `python3 -m http.server 4321` (any simple server on a known port).
3. In a separate OS terminal: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4321/` — expect `200` (or similar).
4. Close the terminal tab by clicking X.
5. Re-run the curl. Expected: connection refused (port is free), confirming the python process was killed and released the port.

- [ ] **Step 7.5: If all three pass, no commit needed for this task.**

---

## Self-Review

### Spec coverage
- Spec §1 (imperative `closeIntentionally`) → Task 5.
- Spec §2 (`TerminalPanel` wiring) → Task 6.
- Spec §3 (`TerminalCommand::Close` + `intentional_close`) → Task 4.
- Spec §4 (`close_session` kills child) → Tasks 1–3.
- Spec §5 (data transmission stops immediately) → combined effect of Tasks 3, 4, 5, 6 — verified in Task 7.
- Spec §6 (unchanged behaviors) → preserved by design: only the tab-close button path sends `{"type":"close"}`; unmount cleanup (reload, workspace clear) is untouched in Task 5.3.
- Spec Files Changed → matches File Structure table above.
- Spec Tests → Task 2 (unit test) + Task 7 (manual).
- Spec Edge Cases:
  - `sessionId` still null → handled in Task 5.2 (send proceeds regardless of `sessionId`; backend knows its own session by handler context).
  - WS already closed → handled in Task 5.2 (`readyState !== OPEN` skips send; close is try/catch).
  - Rapid close of multiple tabs → independent refs in Task 6.1; no coordination needed.
  - Reload immediately after tab close → localStorage is updated synchronously by CLOSE_TAB; spec's guarantee holds.
  - `ChildKiller::kill()` error → swallowed in Task 3.1 with comment.

### Placeholder scan
No TBD/TODO/"implement later"/"handle edge cases" markers. Every code block is complete. All file paths and line numbers are concrete.

### Type consistency
- Rust: `Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>` used consistently in Task 1.1 (struct), Task 1.2 (construction), Task 3.1 (locking).
- TypeScript: `XTermInstanceHandle` interface name is identical in Task 5.1 (export) and Task 6.1 (import/use).
- `closeIntentionally` is the method name in both Task 5.1 (declaration) and Task 6.2 (call).
- Message shape `{ type: 'close' }` on the client side (Task 5.2) matches `TerminalCommand::Close` with serde `rename_all = "snake_case"` on the server (Task 4.1) — serializes/deserializes as `{"type":"close"}`.
