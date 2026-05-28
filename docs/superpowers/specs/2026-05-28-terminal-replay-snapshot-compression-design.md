# Terminal Reconnect Snapshot: gzip Compression

## Problem

When a user reconnects to an existing terminal session, the backend sends `vt100::Parser::screen().contents_formatted()` as a base64-wrapped JSON `Output` message. For a colorful 80×24 screen this snapshot can be 30–150 KB of ANSI sequences (cursor positioning + per-cell SGR + characters). On the user's end this manifests as:

- Bandwidth spike on every reconnect (worst on gateway-mode connections, where the snapshot is also encrypted via E2EE).
- Visible "history scrolling" effect as xterm.js renders the snapshot top-to-bottom.
- Same heavy payload paid for every component remount (route change, panel show/hide, tab switch).

Reconnect happens often in this app: `XTermInstance` has no WS-level reconnect logic; reconnection is driven by component remount, which is frequent during normal navigation.

The user's stated requirement: on reconnect, show the current visible screen exactly as it was — but make it cheap.

### Current implementation

- `crates/local-deployment/src/pty.rs:340-368` — `attach_session()` returns `vt100_parser.lock().screen().contents_formatted()` as the snapshot payload.
- `crates/server/src/routes/terminal.rs:264-272` — the snapshot is base64-encoded and sent as a JSON `Output` message over a text WS frame.
- `frontend/src/components/panels/XTermInstance.tsx:238-271` — `ws.onmessage` decodes the base64 and calls `terminal.write()`.

### Confirmed dead code

`crates/local-deployment/src/pty.rs:37-82` defines a `TerminalBuffer` with a 1 MB `VecDeque<Vec<u8>>` ring (`history`) and an `AtomicUsize` (`total_bytes`). Verified by grep: these fields are written in `TerminalBuffer::push` but never read anywhere in the codebase. Since commit `725b1c2b5 feat(terminal): eliminate playback animation on reconnection by sending screen snapshot`, the reconnect path uses the vt100 emulator state instead of replaying buffered history.

## Solution

Compress the reconnect snapshot with gzip before sending. Live PTY chunks remain uncompressed — they are too small (≤ 4 KB each) for gzip to be worthwhile.

The compression must happen **before** the gateway-mode E2EE layer encrypts the payload, because encrypted bytes don't compress.

### 1. Wire protocol — new `OutputCompressed` message type

`crates/server/src/routes/terminal.rs`, `TerminalMessage` enum:

```rust
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum TerminalMessage {
    Output { data: String },                          // unchanged: base64(raw_bytes), used for live chunks
    OutputCompressed { data: String, encoding: String }, // new: base64(gzip(raw_bytes)), used only for snapshots
    Error { message: String },
    Exit {},
    SessionInfo { session_id: Uuid },
    SessionExpired {},
}
```

Decisions:

- The transport stays as text WS frame + JSON + base64. This keeps `LocalConnection` (native WebSocket) and `GatewayMachineConnection` (E2EE through `RemoteWs`) on the same path. The 1.33× base64 overhead is negligible compared to the 5–10× gzip win for ANSI content.
- The `encoding` field is forward-compatible (future `"brotli"` / `"zstd"`) but only `"gzip"` is supported in this change.
- No schema version bump and no support for "old frontend + new backend" runtime mix. Frontend and backend ship together.

### 2. Backend implementation

#### 2.1 Remove the dead `TerminalBuffer` history ring

In `crates/local-deployment/src/pty.rs`, simplify `TerminalBuffer` to a thin wrapper around the live broadcast sender, or inline the sender into `PtySession` directly. Specifically:

- Drop fields: `history: RwLock<VecDeque<Vec<u8>>>` and `total_bytes: AtomicUsize`.
- Drop constant: `MAX_TERMINAL_BUFFER_BYTES`.
- `TerminalBuffer::push` reduces to `let _ = self.sender.send(data);`. At that point `TerminalBuffer` adds no value over `broadcast::Sender<Vec<u8>>`; replace `Arc<TerminalBuffer>` with `Arc<broadcast::Sender<Vec<u8>>>` in `PtySession`. The struct definition disappears.

This is a cleanup orthogonal to the snapshot change but required by the user's intent ("historical data stream doesn't need to be saved"). It saves up to 1 MB heap per session and removes a clone + write-lock + VecDeque eviction from the PTY reader hot path.

#### 2.2 gzip the snapshot

Add `flate2` as a direct dependency in `crates/server/Cargo.toml` (already present transitively as `1.1.9`).

Add a private helper in `terminal.rs`:

```rust
fn gzip_encode(data: &[u8]) -> std::io::Result<Vec<u8>> {
    use flate2::{Compression, write::GzEncoder};
    use std::io::Write;
    let mut enc = GzEncoder::new(Vec::with_capacity(data.len() / 4), Compression::default());
    enc.write_all(data)?;
    enc.finish()
}
```

`Compression::default()` is level 6 — the standard CPU/ratio tradeoff. For a 100 KB snapshot this completes in well under 5 ms on a modern CPU and is invoked only once per reconnect, off the PTY reader path.

Modify the snapshot send path at `terminal.rs:264-272`:

```rust
const SNAPSHOT_COMPRESS_THRESHOLD: usize = 256;

if !snapshot.is_empty() {
    let msg = if snapshot.len() >= SNAPSHOT_COMPRESS_THRESHOLD {
        match gzip_encode(&snapshot) {
            Ok(compressed) => TerminalMessage::OutputCompressed {
                data: BASE64.encode(&compressed),
                encoding: "gzip".to_string(),
            },
            Err(_) => TerminalMessage::Output { data: BASE64.encode(&snapshot) },
        }
    } else {
        TerminalMessage::Output { data: BASE64.encode(&snapshot) }
    };
    let json = serde_json::to_string(&msg).unwrap_or_default();
    if ws_sender.send(Message::Text(json.into())).await.is_err() {
        return;
    }
}
```

The 256-byte threshold avoids the gzip header inflating very small snapshots (just a prompt line). The compression-error fallback path keeps reconnect working even if `flate2` somehow fails, though for in-memory writes this is effectively unreachable.

Live output forwarding in `output_task` is unchanged — every live chunk continues to use `TerminalMessage::Output`.

### 3. Frontend implementation

In `frontend/src/components/panels/XTermInstance.tsx`:

#### 3.1 Decompression helper

Add next to `decodeBase64`:

```typescript
async function decodeBase64Gzip(base64: string): Promise<string> {
  const binString = atob(base64);
  const bytes = Uint8Array.from(binString, (c) => c.codePointAt(0)!);
  const stream = new Blob([bytes]).stream().pipeThrough(
    new DecompressionStream('gzip')
  );
  const decompressed = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(decompressed);
}
```

`DecompressionStream` is a native browser API supported in Chrome 80+, Firefox 113+, Safari 16.4+, and the Tauri Chromium webview. No npm dependency added.

#### 3.2 Message type

Extend the `TerminalMessage` interface (line 29-35):

```typescript
interface TerminalMessage {
  type: 'output' | 'output_compressed' | 'error' | 'exit'
      | 'session_info' | 'session_expired';
  data?: string;
  encoding?: string;
  message?: string;
  code?: number;
  session_id?: string;
}
```

#### 3.3 Ordered async write chain

`output_compressed` decoding is async. To preserve WS-arrival order across sync `output` and async `output_compressed`, serialize all writes through a promise chain. Define it inside the existing `startConnection` closure (line 175), next to `writeOrBuffer`, so it shares the same lifetime as the WebSocket and is recreated on each connection:

```typescript
let writeChain: Promise<void> = Promise.resolve();

const enqueueWrite = (producer: () => string | Promise<string>) => {
  writeChain = writeChain
    .then(producer)
    .then(text => writeOrBuffer(text))
    .catch(err => console.error('Terminal write failed:', err));
};
```

Update `ws.onmessage`:

```typescript
case 'output':
  if (msg.data) enqueueWrite(() => decodeBase64(msg.data!));
  break;
case 'output_compressed':
  if (msg.data && msg.encoding === 'gzip') {
    enqueueWrite(() => decodeBase64Gzip(msg.data!));
  } else if (msg.data) {
    console.warn('output_compressed: unsupported encoding', msg.encoding);
  }
  break;
```

The chain adds one microtask per message, which is negligible compared to xterm.js render cost. Errors from decompression are logged and swallowed to avoid breaking the live stream that follows.

### 4. Testing

#### 4.1 Backend unit tests (in `terminal.rs`)

- `gzip_encode` round-trip: random bytes → encode → decode with `flate2::read::GzDecoder` → assert equal.
- Empty bytes round-trip: encode → decode → assert empty.
- Compression ratio sanity: feed a known multi-color ANSI fixture (git-diff-style output) into a 24×80 `vt100::Parser`, take `screen().contents_formatted()`, assert `gzip_encode(snapshot).len() < snapshot.len() / 2`. The threshold is conservative; typical real-world ratios are higher.

End-to-end WebSocket + PTY tests are out of scope; manual verification covers them.

#### 4.2 Frontend unit tests

`frontend/src/components/panels/__tests__/decodeBase64Gzip.test.ts` (new, Vitest):

- Encode a known ASCII string with Node's `zlib.gzipSync` in the test fixture, hardcode the resulting base64, feed to `decodeBase64Gzip`, assert equal. Node `zlib` and `flate2` both produce RFC 1952-compliant gzip; their outputs interoperate.
- Mixed ASCII + ANSI escape content: validate UTF-8 decoding does not corrupt the byte sequence.
- Order preservation: stub `decodeBase64Gzip` to resolve on a delayed microtask and `decodeBase64` to be sync; dispatch `output_compressed` then `output` back-to-back; assert a mock `writeOrBuffer` receives them in arrival order.

#### 4.3 Manual verification before merging

| Scenario | Steps | Expected |
| --- | --- | --- |
| Direct-mode reconnect | Run `cat large.log` → switch tabs → switch back | DevTools shows `output_compressed` frame ≤ 1/3 the previous `output` frame size; no visible lag |
| Gateway-mode reconnect | Same as above on a gateway connection | Same; E2EE encrypts the already-compressed payload |
| Empty-screen reconnect | Open terminal → switch tabs immediately → switch back | No errors; either no snapshot or a small `output_compressed` frame |
| Color fidelity | Run `ls --color`, `git diff` → reconnect | All colors preserved on the visible screen |
| High-volume live output | `yes \| head -10000` | Live chunks remain `output` (uncompressed); no regression |

Record before/after WS frame sizes for one representative scenario in the PR description.

## Out of scope (YAGNI)

- WebSocket auto-reconnect: `XTermInstance` currently has no WS-level reconnect logic; reconnection is driven by component remount. Adding auto-reconnect is a separate concern not raised by the user.
- Compressing live PTY chunks: typical chunk size is well below 4 KB; per-chunk gzip header overhead exceeds the gain.
- brotli or zstd: the `encoding` field is left open for future addition, not implemented now.
- Scrollback persistence (disk / SQLite): explicitly contrary to user intent.
- Bandwidth metrics or telemetry: PR-description numbers are sufficient.

## Decision ledger

1. New `OutputCompressed` message type used only for the reconnect snapshot; live data uses unchanged `Output`.
2. Compression happens before E2EE so gateway connections benefit.
3. Backend uses `flate2` gzip level 6, with a 256-byte minimum threshold; smaller snapshots fall back to `Output`.
4. Frontend uses native `DecompressionStream('gzip')`; no JS gzip library added.
5. All writes pass through a promise chain to preserve WS-arrival order across sync and async paths.
6. The unused 1 MB `TerminalBuffer` history ring is removed; `TerminalBuffer` is collapsed into a `broadcast::Sender<Vec<u8>>`.
7. No schema version field; frontend and backend ship together.

## Files touched

- `crates/server/Cargo.toml` — add `flate2` direct dependency.
- `crates/server/src/routes/terminal.rs` — new message variant, `gzip_encode` helper, snapshot send path, unit tests.
- `crates/local-deployment/src/pty.rs` — remove `TerminalBuffer` ring buffer; collapse to broadcast sender.
- `frontend/src/components/panels/XTermInstance.tsx` — `decodeBase64Gzip`, `output_compressed` handling, write chain.
- `frontend/src/components/panels/__tests__/decodeBase64Gzip.test.ts` — new test file.
