# Terminal Reconnect Snapshot Compression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut bandwidth and visible "history scrolling" on terminal reconnect by gzip-compressing the vt100 screen snapshot before it crosses the WebSocket.

**Architecture:** Backend gzip-encodes only the reconnect snapshot (not live PTY chunks) and delivers it as a new `OutputCompressed` message; live `Output` messages are unchanged. Frontend decompresses with native `DecompressionStream('gzip')` and serializes all writes through a promise chain so async decompression keeps WS-arrival order. The unused 1 MB `TerminalBuffer` history ring is removed as a prerequisite cleanup.

**Tech Stack:** Rust (axum, tokio broadcast/watch, `flate2 = "1.1"`, `vt100`, `portable-pty`), TypeScript (xterm.js, native `DecompressionStream`), Vitest + jsdom for frontend unit tests, `cargo test` for backend.

**Spec:** `docs/superpowers/specs/2026-05-28-terminal-replay-snapshot-compression-design.md`

---

## File Structure

**Backend (Rust):**
- `crates/server/Cargo.toml` — add `flate2` direct dep
- `crates/server/src/routes/terminal.rs` — new `OutputCompressed` variant, `gzip_encode` helper, threshold logic in snapshot send path, unit tests
- `crates/local-deployment/src/pty.rs` — collapse `TerminalBuffer` (1 MB history ring) into a plain `broadcast::Sender<Vec<u8>>`; touches `PtySession`, `create_session`, `attach_session`

**Frontend (TypeScript):**
- `frontend/src/components/panels/terminalCompression.ts` *(new)* — `decodeBase64Gzip` and `createWriteChain` exports. Small file so tests don't import the xterm-heavy `XTermInstance.tsx`.
- `frontend/src/components/panels/__tests__/terminalCompression.test.ts` *(new)* — Vitest unit tests for both helpers.
- `frontend/src/components/panels/XTermInstance.tsx` — extend `TerminalMessage` interface, route all writes through the new chain, handle `output_compressed`.

Each Rust file has one responsibility (PTY lifecycle vs. WS routing). Splitting `decodeBase64Gzip` + `createWriteChain` into a companion module keeps the test suite light and the helpers reusable if another component ever needs them.

---

## Task 1: Remove dead `TerminalBuffer` history ring

The 1 MB `VecDeque<Vec<u8>>` history is written on every PTY chunk and never read. Removing it before the snapshot work keeps the diff in pty.rs focused on broadcast plumbing.

**Files:**
- Modify: `crates/local-deployment/src/pty.rs:1-101, 175-336`

- [ ] **Step 1.1: Run baseline backend tests**

```bash
cargo test -p local-deployment --lib
```

Expected: existing PTY tests pass (`close_session_kills_child` on Unix; on non-Unix the cfg-gated test is skipped). Record any unrelated failures so you can recognize them as pre-existing.

- [ ] **Step 1.2: Replace `TerminalBuffer` with a plain broadcast sender in `PtySession`**

In `crates/local-deployment/src/pty.rs`:

1. Delete the `TerminalBuffer` struct and its `impl` block (lines 35-82).
2. Remove the `MAX_TERMINAL_BUFFER_BYTES` constant (line 43).
3. Remove `VecDeque` and `RwLock` from the top-level `use` block (line 2, line 6) if no longer referenced — verify via `grep -n 'VecDeque\|RwLock' crates/local-deployment/src/pty.rs` after the edit.
4. Replace the `buffer: Arc<TerminalBuffer>` field in `PtySession` with `output: Arc<broadcast::Sender<Vec<u8>>>`.
5. Update `create_session` to construct the sender directly:

   Replace:
   ```rust
   let buffer = Arc::new(TerminalBuffer::new());
   let buffer_clone = buffer.clone();
   ```
   with:
   ```rust
   let (output_tx, _output_rx) = broadcast::channel::<Vec<u8>>(10000);
   let output_tx = Arc::new(output_tx);
   let output_tx_clone = output_tx.clone();
   ```

6. Update the reader thread (around line 286) — replace `buffer_clone.push(chunk.to_vec());` with `let _ = output_tx_clone.send(chunk.to_vec());`.
7. Update `PtySession` instantiation (around line 302) — replace `buffer,` with `output: output_tx,`.
8. Update the receiver subscription at the end of `create_session` (around line 326-333) — replace `.buffer.subscribe()` with `.output.subscribe()`.
9. Update `attach_session` (around line 363) — replace `let rx = session.buffer.subscribe();` with `let rx = session.output.subscribe();`.

- [ ] **Step 1.3: Add a regression test that verifies live broadcast still flows**

Append to the existing `#[cfg(all(test, unix))] mod tests` block at the bottom of `pty.rs`:

```rust
/// After the TerminalBuffer cleanup, live PTY output must still reach a
/// subscriber via the broadcast channel. The shell prints a prompt at startup,
/// which we use as the proof-of-life.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn live_output_reaches_subscriber() {
    let service = PtyService::new();
    let tmp = tempfile::tempdir().expect("tempdir");
    let (session_id, mut rx, _exit_rx) = service
        .create_session(tmp.path().to_path_buf(), 80, 24)
        .await
        .expect("create_session");

    // Trigger a guaranteed write so we don't depend on shell startup chatter.
    service
        .write(session_id, b"echo ready\n")
        .await
        .expect("write");

    let mut got_bytes = Vec::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
    while tokio::time::Instant::now() < deadline {
        match tokio::time::timeout(Duration::from_millis(500), rx.recv()).await {
            Ok(Ok(chunk)) => {
                got_bytes.extend_from_slice(&chunk);
                if got_bytes.windows(5).any(|w| w == b"ready") {
                    break;
                }
            }
            Ok(Err(_)) | Err(_) => continue,
        }
    }

    service.close_session(session_id).await.expect("close");

    assert!(
        got_bytes.windows(5).any(|w| w == b"ready"),
        "subscriber should observe `ready` echoed by the shell, got bytes: {:?}",
        String::from_utf8_lossy(&got_bytes)
    );
}
```

- [ ] **Step 1.4: Run all backend tests**

```bash
cargo test -p local-deployment --lib
cargo test -p server --lib
```

Expected: both `close_session_kills_child` and the new `live_output_reaches_subscriber` pass on Unix; server tests unchanged.

- [ ] **Step 1.5: cargo check the workspace**

```bash
cargo check --workspace
```

Expected: no warnings about unused imports (you should have removed `VecDeque` / `RwLock` if they're no longer used elsewhere in `pty.rs`). No errors.

- [ ] **Step 1.6: Commit**

```bash
git add crates/local-deployment/src/pty.rs
git commit -m "refactor(pty): remove unused TerminalBuffer history ring

The 1 MB VecDeque history was written on every PTY chunk but never
read. Replace TerminalBuffer with a plain broadcast::Sender so the
PTY reader thread does one less allocation/lock per chunk."
```

---

## Task 2: Add `flate2` direct dep + `gzip_encode` helper (TDD)

**Files:**
- Modify: `crates/server/Cargo.toml`
- Modify: `crates/server/src/routes/terminal.rs`

- [ ] **Step 2.1: Add `flate2` to server crate dependencies**

In `crates/server/Cargo.toml`, add to the `[dependencies]` section (alphabetical position is fine; right after `dirs = "5.0"` works):

```toml
flate2 = "1.1"
```

- [ ] **Step 2.2: Run cargo check to verify resolution**

```bash
cargo check -p server
```

Expected: builds successfully. `flate2` is already in the lockfile as a transitive dep, so this should be near-instant.

- [ ] **Step 2.3: Write failing test for `gzip_encode` round-trip**

At the bottom of `crates/server/src/routes/terminal.rs`, add a `#[cfg(test)]` module:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use flate2::read::GzDecoder;
    use std::io::Read;

    fn gunzip(data: &[u8]) -> Vec<u8> {
        let mut decoder = GzDecoder::new(data);
        let mut out = Vec::new();
        decoder.read_to_end(&mut out).expect("gunzip");
        out
    }

    #[test]
    fn gzip_encode_roundtrip_basic() {
        let input = b"hello terminal world".to_vec();
        let compressed = gzip_encode(&input).expect("gzip_encode");
        let decoded = gunzip(&compressed);
        assert_eq!(decoded, input);
    }

    #[test]
    fn gzip_encode_roundtrip_empty() {
        let compressed = gzip_encode(&[]).expect("gzip_encode");
        let decoded = gunzip(&compressed);
        assert!(decoded.is_empty());
    }
}
```

- [ ] **Step 2.4: Run tests — expect compile failure**

```bash
cargo test -p server gzip_encode 2>&1 | tail -20
```

Expected: compile error `cannot find function 'gzip_encode' in this scope`.

- [ ] **Step 2.5: Implement `gzip_encode`**

In `crates/server/src/routes/terminal.rs`, add this private helper above `handle_terminal_ws` (around line 191, just before `async fn handle_terminal_ws`):

```rust
fn gzip_encode(data: &[u8]) -> std::io::Result<Vec<u8>> {
    use flate2::{Compression, write::GzEncoder};
    use std::io::Write;
    let mut enc = GzEncoder::new(
        Vec::with_capacity(data.len() / 4),
        Compression::default(),
    );
    enc.write_all(data)?;
    enc.finish()
}
```

- [ ] **Step 2.6: Run tests — expect pass**

```bash
cargo test -p server gzip_encode -- --nocapture
```

Expected: both `gzip_encode_roundtrip_basic` and `gzip_encode_roundtrip_empty` pass.

- [ ] **Step 2.7: Commit**

```bash
git add crates/server/Cargo.toml crates/server/src/routes/terminal.rs
git commit -m "feat(terminal): add gzip_encode helper for snapshot compression

Adds flate2 as a direct dependency of the server crate and a private
gzip_encode helper with round-trip unit tests."
```

---

## Task 3: Add `OutputCompressed` variant + wire into snapshot send path

This combines the protocol change and the route logic. Also adds the compression-ratio sanity test.

**Files:**
- Modify: `crates/server/src/routes/terminal.rs`

- [ ] **Step 3.1: Write failing test for `OutputCompressed` JSON shape**

In the existing `#[cfg(test)] mod tests` block (added in Task 2), append:

```rust
    #[test]
    fn output_compressed_serializes_with_encoding_field() {
        let msg = TerminalMessage::OutputCompressed {
            data: "abc".to_string(),
            encoding: "gzip".to_string(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert_eq!(
            json,
            r#"{"type":"output_compressed","data":"abc","encoding":"gzip"}"#
        );
    }
```

- [ ] **Step 3.2: Run test — expect compile failure**

```bash
cargo test -p server output_compressed_serializes 2>&1 | tail -20
```

Expected: compile error — `no variant named 'OutputCompressed' found for enum 'TerminalMessage'`.

- [ ] **Step 3.3: Add the `OutputCompressed` variant**

In `crates/server/src/routes/terminal.rs`, modify the `TerminalMessage` enum (lines 51-68) to add the new variant. The full updated enum:

```rust
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum TerminalMessage {
    Output {
        data: String,
    },
    /// Same as `Output` but `data` is base64(gzip(raw_bytes)).
    /// Used for the reconnect snapshot only; live chunks stay as `Output`.
    OutputCompressed {
        data: String,
        encoding: String,
    },
    Error {
        message: String,
    },
    /// Sent when the PTY process exits
    Exit {},
    /// Sent on connect with the session_id for future reconnection
    SessionInfo {
        session_id: Uuid,
    },
    /// Sent when trying to reconnect to an expired/unknown session
    SessionExpired {},
}
```

- [ ] **Step 3.4: Run test — expect pass**

```bash
cargo test -p server output_compressed_serializes
```

Expected: pass.

- [ ] **Step 3.5: Wire compression into the snapshot send path**

In `crates/server/src/routes/terminal.rs`, find the snapshot-send block at lines 263-272. Add a constant just above `async fn handle_terminal_ws` and replace the block.

Add the constant near the top of the file (next to `default_cols`/`default_rows`, after line 41):

```rust
/// Snapshots smaller than this skip gzip — the gzip header + base64
/// inflation makes them larger than just sending raw.
const SNAPSHOT_COMPRESS_THRESHOLD: usize = 256;
```

Replace lines 263-272 (the `if !snapshot.is_empty()` block) with:

```rust
    // Send screen snapshot for reconnection
    if !snapshot.is_empty() {
        let msg = if snapshot.len() >= SNAPSHOT_COMPRESS_THRESHOLD {
            match gzip_encode(&snapshot) {
                Ok(compressed) => TerminalMessage::OutputCompressed {
                    data: BASE64.encode(&compressed),
                    encoding: "gzip".to_string(),
                },
                Err(e) => {
                    tracing::warn!("Snapshot gzip failed, sending uncompressed: {}", e);
                    TerminalMessage::Output {
                        data: BASE64.encode(&snapshot),
                    }
                }
            }
        } else {
            TerminalMessage::Output {
                data: BASE64.encode(&snapshot),
            }
        };
        let json = serde_json::to_string(&msg).unwrap_or_default();
        if ws_sender.send(Message::Text(json.into())).await.is_err() {
            return;
        }
    }
```

- [ ] **Step 3.6: Add the compression-ratio sanity test**

`vt100` is already a workspace dependency (used in `local-deployment`); to test it from the `server` crate we need it in `[dev-dependencies]`. Check first:

```bash
grep -n 'vt100' crates/server/Cargo.toml
```

If absent, add to `crates/server/Cargo.toml`:

```toml
[dev-dependencies]
vt100 = "0.15"
```

(If `[dev-dependencies]` already exists, append `vt100 = "0.15"` to it.)

Append to the `#[cfg(test)] mod tests` block in `terminal.rs`:

```rust
    #[test]
    fn typical_ansi_snapshot_compresses_at_least_2x() {
        // Build a vt100 emulator and feed it a colorful, repetitive screen —
        // representative of `git diff` / `cargo build` output. ANSI SGR sequences
        // and repeated whitespace gzip very well.
        let mut parser = vt100::Parser::new(24, 80, 0);
        let red = b"\x1b[31m";
        let green = b"\x1b[32m";
        let reset = b"\x1b[0m";
        for _ in 0..12 {
            parser.process(red);
            parser.process(b"-  removed line of code with some content here\r\n");
            parser.process(reset);
            parser.process(green);
            parser.process(b"+  added line of code with some content here\r\n");
            parser.process(reset);
        }
        let snapshot = parser.screen().contents_formatted();
        assert!(
            !snapshot.is_empty(),
            "vt100 snapshot should not be empty after writes"
        );

        let compressed = gzip_encode(&snapshot).expect("gzip_encode");
        assert!(
            compressed.len() * 2 < snapshot.len(),
            "expected gzip to halve the snapshot at least; got {} -> {} bytes",
            snapshot.len(),
            compressed.len()
        );
    }
```

- [ ] **Step 3.7: Run all server tests**

```bash
cargo test -p server
```

Expected: all four new tests pass (`gzip_encode_roundtrip_basic`, `gzip_encode_roundtrip_empty`, `output_compressed_serializes_with_encoding_field`, `typical_ansi_snapshot_compresses_at_least_2x`); existing tests unchanged.

- [ ] **Step 3.8: Commit**

```bash
git add crates/server/Cargo.toml crates/server/src/routes/terminal.rs
git commit -m "feat(terminal): gzip the reconnect snapshot before sending

Adds OutputCompressed wire-format variant and routes the screen snapshot
through gzip when its size meets the SNAPSHOT_COMPRESS_THRESHOLD (256 B).
Live PTY chunks remain uncompressed Output messages.

Compression error falls back to a plain Output message so reconnect
never fails on encoder hiccups."
```

---

## Task 4: Frontend `decodeBase64Gzip` helper (TDD)

**Files:**
- Create: `frontend/src/components/panels/terminalCompression.ts`
- Create: `frontend/src/components/panels/__tests__/terminalCompression.test.ts`

- [ ] **Step 4.1: Write failing test**

Create `frontend/src/components/panels/__tests__/terminalCompression.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { gzipSync } from 'zlib';

import { decodeBase64Gzip } from '../terminalCompression';

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

describe('decodeBase64Gzip', () => {
  it('round-trips an ASCII string', async () => {
    const original = 'hello terminal world';
    const compressed = gzipSync(Buffer.from(original, 'utf-8'));
    const base64 = bytesToBase64(new Uint8Array(compressed));

    const decoded = await decodeBase64Gzip(base64);

    expect(decoded).toBe(original);
  });

  it('round-trips a string with ANSI escape sequences', async () => {
    const original = '\x1b[31mred\x1b[0m \x1b[1;32mbold-green\x1b[0m';
    const compressed = gzipSync(Buffer.from(original, 'utf-8'));
    const base64 = bytesToBase64(new Uint8Array(compressed));

    const decoded = await decodeBase64Gzip(base64);

    expect(decoded).toBe(original);
  });

  it('round-trips multibyte UTF-8 content', async () => {
    const original = '终端 reconnect 测试 — 日本語 🚀';
    const compressed = gzipSync(Buffer.from(original, 'utf-8'));
    const base64 = bytesToBase64(new Uint8Array(compressed));

    const decoded = await decodeBase64Gzip(base64);

    expect(decoded).toBe(original);
  });
});
```

- [ ] **Step 4.2: Run test — expect failure**

```bash
cd frontend && pnpm exec vitest run src/components/panels/__tests__/terminalCompression.test.ts
```

Expected: module resolution error — `Failed to resolve import "../terminalCompression"`.

- [ ] **Step 4.3: Implement `decodeBase64Gzip`**

Create `frontend/src/components/panels/terminalCompression.ts`:

```typescript
/**
 * decodeBase64Gzip — decompress a base64-encoded gzip blob into a UTF-8 string.
 *
 * Used by the terminal WebSocket reader to expand the reconnect snapshot
 * (`output_compressed` message) sent by the backend.
 *
 * Relies on the native DecompressionStream API — supported in Chrome 80+,
 * Firefox 113+, Safari 16.4+, and the Tauri Chromium webview.
 */
export async function decodeBase64Gzip(base64: string): Promise<string> {
  const binString = atob(base64);
  const bytes = Uint8Array.from(binString, (c) => c.codePointAt(0)!);
  const stream = new Blob([bytes]).stream().pipeThrough(
    new DecompressionStream('gzip')
  );
  const decompressed = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(decompressed);
}
```

- [ ] **Step 4.4: Run test — expect pass**

```bash
cd frontend && pnpm exec vitest run src/components/panels/__tests__/terminalCompression.test.ts
```

Expected: all three tests pass.

> **Troubleshooting:** if the test fails with `DecompressionStream is not defined`, jsdom doesn't expose the Streams API natively. Modern Vitest with jsdom 22+ does. If you hit this, check `frontend/package.json` for the jsdom version (need ≥ 22) and bump if necessary, but try without first — Vitest 3.2 ships with new-enough jsdom.

- [ ] **Step 4.5: Commit**

```bash
git add frontend/src/components/panels/terminalCompression.ts \
        frontend/src/components/panels/__tests__/terminalCompression.test.ts
git commit -m "feat(terminal): add decodeBase64Gzip helper for snapshot decompression"
```

---

## Task 5: Frontend `createWriteChain` helper (TDD)

Async snapshot decode must not race sync live writes. A simple promise chain serializes both.

**Files:**
- Modify: `frontend/src/components/panels/terminalCompression.ts`
- Modify: `frontend/src/components/panels/__tests__/terminalCompression.test.ts`

- [ ] **Step 5.1: Write failing tests for `createWriteChain`**

Append to `frontend/src/components/panels/__tests__/terminalCompression.test.ts`:

```typescript
import { createWriteChain } from '../terminalCompression';

describe('createWriteChain', () => {
  it('writes synchronous producers in arrival order', async () => {
    const writes: string[] = [];
    const enqueue = createWriteChain((s) => {
      writes.push(s);
    });

    enqueue(() => 'a');
    enqueue(() => 'b');
    enqueue(() => 'c');

    // Drain the microtask queue.
    await new Promise((r) => setTimeout(r, 0));

    expect(writes).toEqual(['a', 'b', 'c']);
  });

  it('preserves arrival order across mixed sync/async producers', async () => {
    const writes: string[] = [];
    const enqueue = createWriteChain((s) => {
      writes.push(s);
    });

    enqueue(
      () =>
        new Promise<string>((resolve) =>
          setTimeout(() => resolve('slow-async'), 30)
        )
    );
    enqueue(() => 'fast-sync-1');
    enqueue(
      () =>
        new Promise<string>((resolve) =>
          setTimeout(() => resolve('medium-async'), 10)
        )
    );
    enqueue(() => 'fast-sync-2');

    await new Promise((r) => setTimeout(r, 100));

    expect(writes).toEqual([
      'slow-async',
      'fast-sync-1',
      'medium-async',
      'fast-sync-2',
    ]);
  });

  it('continues processing after a producer rejects', async () => {
    const writes: string[] = [];
    const errors: unknown[] = [];
    const enqueue = createWriteChain(
      (s) => {
        writes.push(s);
      },
      (err) => {
        errors.push(err);
      }
    );

    enqueue(() => 'before');
    enqueue(() => Promise.reject(new Error('boom')));
    enqueue(() => 'after');

    await new Promise((r) => setTimeout(r, 0));

    expect(writes).toEqual(['before', 'after']);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('boom');
  });
});
```

- [ ] **Step 5.2: Run tests — expect failure**

```bash
cd frontend && pnpm exec vitest run src/components/panels/__tests__/terminalCompression.test.ts
```

Expected: import error — `createWriteChain` is not exported from `../terminalCompression`.

- [ ] **Step 5.3: Implement `createWriteChain`**

Append to `frontend/src/components/panels/terminalCompression.ts`:

```typescript
/**
 * createWriteChain — serialize calls to a write callback through a promise
 * chain so async producers (e.g. gzip decompression) cannot reorder ahead of
 * sync ones (e.g. base64 decode).
 *
 * Returns an `enqueue(producer)` function. Each `producer` runs only after the
 * previous one has been consumed; rejections are routed to `onError` (or
 * console by default) without breaking the chain.
 */
export function createWriteChain(
  write: (text: string) => void,
  onError?: (err: unknown) => void
): (producer: () => string | Promise<string>) => void {
  let chain: Promise<void> = Promise.resolve();
  return (producer) => {
    chain = chain
      .then(producer)
      .then(write)
      .catch((err) => {
        if (onError) onError(err);
        else console.error('Terminal write failed:', err);
      });
  };
}
```

- [ ] **Step 5.4: Run all tests in this file — expect pass**

```bash
cd frontend && pnpm exec vitest run src/components/panels/__tests__/terminalCompression.test.ts
```

Expected: all six tests pass (3 from Task 4 + 3 from Task 5).

- [ ] **Step 5.5: Commit**

```bash
git add frontend/src/components/panels/terminalCompression.ts \
        frontend/src/components/panels/__tests__/terminalCompression.test.ts
git commit -m "feat(terminal): add createWriteChain to serialize async writes

Promise-chain helper that preserves arrival order when writes mix sync
and async producers. Used next to feed both 'output' (sync base64) and
'output_compressed' (async gzip) into xterm.js without reordering."
```

---

## Task 6: Wire `output_compressed` into `XTermInstance`

Glue task: extend the message type, route every write through `createWriteChain`, handle the new message variant.

**Files:**
- Modify: `frontend/src/components/panels/XTermInstance.tsx:29-35, 175-271`

- [ ] **Step 6.1: Add the import**

In `frontend/src/components/panels/XTermInstance.tsx`, add an import next to the other local imports (top of file, around line 15):

```typescript
import { decodeBase64Gzip, createWriteChain } from './terminalCompression';
```

- [ ] **Step 6.2: Extend the `TerminalMessage` interface**

Replace lines 29-35 of `XTermInstance.tsx`:

```typescript
interface TerminalMessage {
  type:
    | 'output'
    | 'output_compressed'
    | 'error'
    | 'exit'
    | 'session_info'
    | 'session_expired';
  data?: string;
  encoding?: string;
  message?: string;
  code?: number;
  session_id?: string;
}
```

- [ ] **Step 6.3: Build the write chain inside `startConnection`**

Inside `startConnection` (around line 175), immediately after the existing `writeOrBuffer` definition (line 228), add:

```typescript
      const enqueueWrite = createWriteChain(
        (text) => writeOrBuffer(text),
        (err) => console.error('Terminal write failed:', err)
      );
```

`createWriteChain` captures `writeOrBuffer` by reference, so the chain reuses the existing buffering-during-init logic without modification.

- [ ] **Step 6.4: Route both message types through the chain**

Replace the `case 'output':` block in `ws.onmessage` (lines 242-246) and add the new `case 'output_compressed':` immediately after:

```typescript
            case 'output':
              if (msg.data) {
                const data = msg.data;
                enqueueWrite(() => decodeBase64(data));
              }
              break;
            case 'output_compressed':
              if (msg.data && msg.encoding === 'gzip') {
                const data = msg.data;
                enqueueWrite(() => decodeBase64Gzip(data));
              } else if (msg.data) {
                console.warn(
                  'Unsupported output_compressed encoding:',
                  msg.encoding
                );
              }
              break;
```

(The `const data = msg.data;` capture is needed so the closure binds to the narrowed value, not the optional-typed property.)

- [ ] **Step 6.5: Type-check the frontend**

```bash
cd frontend && pnpm run check
```

Expected: no errors. If `tsc` complains about `MessageEvent` typing of `event.data`, you may need to adjust — but the existing code already does `JSON.parse(event.data)`, so the import wrapping should be unaffected.

- [ ] **Step 6.6: Run the new helper tests once more to confirm nothing broke them**

```bash
cd frontend && pnpm exec vitest run src/components/panels/__tests__/terminalCompression.test.ts
```

Expected: all six pass.

- [ ] **Step 6.7: Run the full frontend test suite**

```bash
cd frontend && pnpm test
```

Expected: green. If unrelated tests fail, capture the output and confirm they were already failing on the parent commit before deciding whether to fix.

- [ ] **Step 6.8: Commit**

```bash
git add frontend/src/components/panels/XTermInstance.tsx
git commit -m "feat(terminal): handle output_compressed snapshot in xterm

Routes all incoming output through createWriteChain so async gzip
decode of the reconnect snapshot stays in WS-arrival order with sync
live data. The new output_compressed message decompresses via
DecompressionStream and is otherwise treated like a regular write."
```

---

## Task 7: Manual verification + record baseline numbers

The compression must work end-to-end for both connection paths and produce visible bandwidth savings.

**Files:** none (verification + PR description)

- [ ] **Step 7.1: Start dev servers**

```bash
pnpm run dev
```

Wait for both backend and frontend to report ready.

- [ ] **Step 7.2: Direct-mode reconnect — measure**

1. Open the app in a Chromium browser. Open DevTools → Network → filter by WS.
2. Open a terminal tab in any project.
3. In the terminal, run something that fills the screen with colorful output:
   ```
   git log --oneline --decorate=short --all --color=always | head -30
   ```
4. Switch to a different tab/route, then switch back. This triggers `XTermInstance` remount → reconnect.
5. In DevTools, click the `terminal/ws` connection → Messages. Find the message right after `session_info`. It should now have `"type":"output_compressed"`. Note its size.
6. Verify visually: the screen is restored with the same colors, no missing characters.

- [ ] **Step 7.3: Direct-mode reconnect — baseline comparison**

For the PR description, capture the size delta:

1. Stash your working tree (or checkout main): see the size of the equivalent `output` message before this change. (If you don't want to context-switch, you can estimate: the uncompressed snapshot is `BASE64.encode(contents_formatted).length` ≈ 1.33× the raw byte count visible in the post-change DevTools view by decoding the gzip locally.)
2. Record both numbers.

A representative target: ≥ 3× reduction for a colorful screenful. If you see less than 1.5×, something is wrong — investigate.

- [ ] **Step 7.4: Gateway-mode reconnect (if available)**

If you have a gateway connection configured:
1. Switch to a gateway tab.
2. Repeat steps 7.2.1–7.2.6 against the gateway terminal.
3. Confirm the message size in DevTools is comparable to direct mode — the E2EE layer encrypts the *compressed* payload, so savings should be similar.

If no gateway is set up locally, skip this and note it in the PR ("verified direct-mode only").

- [ ] **Step 7.5: Color-fidelity check**

In a terminal:
```
ls --color=always
git diff --color=always | head -40
```

Switch tabs and back. Confirm all colors render correctly on reconnect — no missing SGR codes, no garbled cells.

- [ ] **Step 7.6: Empty-screen reconnect**

Open a fresh terminal tab, immediately switch tabs, switch back. The snapshot should either be absent (size 0 → no message sent) or fall below the 256-byte threshold and arrive as plain `output`. No console errors.

- [ ] **Step 7.7: Live output regression check**

```
yes | head -10000
```

While the output is streaming, watch DevTools. Live messages should still be `"type":"output"` (NOT `output_compressed`). The terminal should keep up without visible stalling.

- [ ] **Step 7.8: Backend tests + frontend tests sanity-check before PR**

```bash
cargo test --workspace
cd frontend && pnpm test && pnpm run check && cd -
```

Expected: green.

- [ ] **Step 7.9: Open the PR**

In the PR description, include:

- Spec link: `docs/superpowers/specs/2026-05-28-terminal-replay-snapshot-compression-design.md`
- A "Before / After" table with the two byte counts captured in steps 7.2 / 7.3 (and gateway numbers if step 7.4 was done).
- Note that the `TerminalBuffer` history ring removal is included as a prerequisite cleanup.

---

## Self-Review

I checked the plan against the spec.

**Spec coverage:**
- §1 Wire protocol (`OutputCompressed { data, encoding }`) → Task 3.3
- §2.1 Remove `TerminalBuffer` history ring → Task 1
- §2.2 `gzip_encode` + threshold + send path → Tasks 2 & 3 (steps 3.5–3.6)
- §3.1 `decodeBase64Gzip` helper → Task 4
- §3.2 `TerminalMessage` interface extension → Task 6.2
- §3.3 Promise-chain serializer → Task 5 (helper) + Task 6.3–6.4 (wire-up)
- §4.1 Backend unit tests (gzip round-trip + ratio sanity) → Tasks 2 & 3
- §4.2 Frontend unit tests (decode round-trip + ANSI/UTF-8 + ordering) → Tasks 4 & 5
- §4.3 Manual verification table → Task 7
- Decision ledger #5 (chain serializes ALL writes) → Task 6.4 routes both `output` and `output_compressed` through `enqueueWrite`

**Type/method consistency:**
- Backend: `gzip_encode` (Tasks 2 & 3) and `SNAPSHOT_COMPRESS_THRESHOLD` (Task 3.5) — names consistent
- Frontend: `decodeBase64Gzip` (Tasks 4 & 6) and `createWriteChain`/`enqueueWrite` (Tasks 5 & 6) — names consistent
- `TerminalMessage` enum/interface — Rust serde tag and TypeScript union members match (`"output_compressed"`)

**Placeholder scan:** no TBDs, no "handle errors appropriately" — every step shows the code or command.

**Plan saved.**
