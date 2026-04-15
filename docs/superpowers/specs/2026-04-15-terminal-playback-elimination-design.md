# Terminal Playback Elimination Design

## Problem

When a user navigates away from a terminal tab and returns later, the terminal replays all buffered output history at high speed before showing the current state. This "fast-forward" animation is disorienting and unnecessary — the user only needs to see the current screen.

## Root Cause

`PtySession` stores all PTY output in a `TerminalBuffer` ring buffer (up to 1 MB). On reconnection, `attach_session()` returns the entire history, and `handle_terminal_ws()` sends every chunk as individual WebSocket messages. xterm.js processes them sequentially, producing the visible playback effect.

## Solution

Add a `vt100::Parser` to each `PtySession` that maintains a virtual screen buffer. On reconnection, send a single screen snapshot instead of the full output history.

## Design

### New dependency

Add `vt100` crate to `crates/local-deployment/Cargo.toml`. The `vt100` crate provides:
- `Parser::new(rows, cols, scrollback)` — creates a virtual terminal with given dimensions
- `parser.process(&bytes)` — feeds raw PTY output into the virtual screen
- `screen().contents_formatted() -> Vec<u8>` — returns ANSI escape sequences that reproduce the current visible screen (colors, attributes, cursor position)
- `parser.set_size(rows, cols)` — resizes the virtual screen

### Changes to `PtySession` (pty.rs)

1. **Add `vt100_parser` field** to `PtySession`:
   ```rust
   vt100_parser: Arc<Mutex<vt100::Parser>>,
   ```
   Created with `vt100::Parser::new(rows, cols, 0)` — scrollback is 0 because we only need the current visible screen.

2. **Feed PTY output to parser** in the output reader thread. After `buffer_clone.push(buf[..n].to_vec())`, also call:
   ```rust
   parser.lock().unwrap().process(&buf[..n]);
   ```

3. **Add `get_screen_snapshot()` method** to `PtySession` (or expose via `PtyService`):
   ```rust
   fn get_screen_snapshot(&self) -> Vec<u8> {
       self.vt100_parser.lock().unwrap().screen().contents_formatted()
   }
   ```

4. **Resize sync** — add parser resize in `PtyService::resize()`:
   ```rust
   session.vt100_parser.lock().unwrap().set_size(rows, cols);
   ```

5. **Change `attach_session()` return type** from `Vec<Vec<u8>>` (full history chunks) to `Vec<u8>` (single screen snapshot):
   ```rust
   pub async fn attach_session(&self, session_id: Uuid)
       -> Result<(Vec<u8>, broadcast::Receiver<Vec<u8>>, watch::Receiver<bool>), PtyError>
   ```
   Implementation calls `get_screen_snapshot()` instead of `get_history()`.

### Changes to WebSocket handler (terminal.rs)

Replace the history replay loop:
```rust
// Before (sends N messages):
for data in history {
    let msg = TerminalMessage::Output { data: BASE64.encode(&data) };
    // ...send...
}

// After (sends 1 message):
if !snapshot.is_empty() {
    let msg = TerminalMessage::Output { data: BASE64.encode(&snapshot) };
    // ...send...
}
```

### What stays the same

- **`TerminalBuffer` broadcast channel** — live streaming to connected clients is unchanged.
- **`TerminalBuffer` ring buffer** — can be kept for broadcast lagged-receiver recovery. Its role shifts from "reconnection history source" to "broadcast overflow buffer only."
- **Frontend `XTermInstance.tsx`** — receives the same `output` message type, just with snapshot content instead of history chunks. No code changes needed.
- **WebSocket protocol** — no new message types. The `output` message carries the snapshot transparently.

### Thread safety

The `vt100::Parser` is behind `Arc<Mutex<>>`. Two access paths:
1. **Output reader thread** — calls `parser.process()` on every PTY read (high frequency, short hold)
2. **Attach/reconnect** — calls `parser.screen().contents_formatted()` (rare, short hold)
3. **Resize** — calls `parser.set_size()` (rare, short hold)

Contention is minimal since `process()` and `contents_formatted()` are both fast operations.

### Memory overhead

`vt100::Parser` with 0 scrollback for an 80x24 terminal: ~few KB per session. Negligible compared to the existing 1 MB ring buffer.

## Files changed

| File | Change |
|---|---|
| `crates/local-deployment/Cargo.toml` | Add `vt100` dependency |
| `crates/local-deployment/src/pty.rs` | Add parser to `PtySession`, feed output, snapshot method, resize sync, change `attach_session` return type |
| `crates/server/src/routes/terminal.rs` | Send snapshot instead of history loop on reconnect |

## Out of scope

- Removing `TerminalBuffer` entirely — it still serves live broadcast and lagged-receiver recovery.
- Frontend changes — the snapshot is transparent to the existing `output` message handling.
- Alternate screen detection or special handling — `vt100` handles this internally.
