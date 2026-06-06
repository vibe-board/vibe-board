# [S1] Network Optimization Design

## [S1] Problem

The e2ee gateway server has only **3 Mbps** of bandwidth. Under this constraint, the current architecture wastes bandwidth through multiple compounding inefficiencies, causing slow initial loads, frequent WebSocket disconnects, high real-time data latency, large data transfer stuttering, and slow terminal response.

Root causes identified:
1. No HTTP response compression — JSON payloads sent raw (compressible 60-80%)
2. PTY terminal output: each chunk sent individually, no batching
3. JSON Patch messages: every task/workspace update sends the **full object** (1-5 KB each)
4. Gateway double Base64: `RemoteWs.send()` encodes UTF-8→Base64, then `e2ee_bridge.rs` encodes again — all WS data inflated ~33% twice
5. No message batching or throttling anywhere in the pipeline — high-frequency small messages saturate the 3 Mbps link
6. `unbounded_channel` in e2ee bridge — no backpressure, memory grows unbounded under load

## [S2] Solution Overview

**Phase 1 (high-gain, low-risk):**
- Add `tower_http::CompressionLayer` to axum for all HTTP responses (gzip/brotli)
- PTY output: batch chunks within a 16 ms window before sending
- JSON Patch: batch multiple patches within a 10 ms window, deduplicate by path
- Fix Gateway double Base64: e2ee bridge should not re-encode already-encoded WS messages

**Phase 2 (deeper stabilization):**
- Replace `UnboundedSender` with bounded channel in e2ee bridge for backpressure
- Add WebSocket permessage-deflate compression on the local axum WS connections (compresses before the e2ee encryption layer picks it up)

## [S3] Phase 1 — HTTP Compression

**File:** `crates/server/src/routes/mod.rs`

Add `tower_http::compression::CompressionLayer` to the axum router. This compresses all HTTP JSON responses when the client sends `Accept-Encoding: gzip` or `br`.

Expected impact: REST responses (task lists, session history, diff content) shrink 60-80%.

No changes to frontend required — browsers handle `Content-Encoding` transparently.

## [S4] Phase 1 — PTY Output Batching

**File:** `crates/server/src/routes/terminal.rs`

Current behavior: each PTY output chunk (often a few bytes) is individually JSON-serialized, Base64-encoded, and sent as a WebSocket frame.

New behavior: accumulate PTY output chunks in a buffer with a **16 ms flush timer**. When the timer fires (or the buffer exceeds 8 KB), combine all accumulated bytes into a single `{"type":"output","data":"<base64>"}` message.

This reduces the number of WebSocket frames by 10-50x during active AI execution, while adding at most 16 ms of latency — imperceptible for terminal use.

No changes to frontend required — the message format stays the same, just one frame instead of many.

## [S5] Phase 1 — JSON Patch Batching

**File:** `crates/services/src/services/events/streams.rs` (or a new `batch_sender.rs` utility)

Current behavior: every Task/Workspace/Project update immediately broadcasts a JSON Patch.

New behavior: a `PatchBatcher` accumulates patches in a 10 ms window. On flush:
1. Merge all patches for the same path, keeping only the last `replace` (same as frontend `dedupeOps`)
2. Send a single `{"JsonPatch": [...merged ops...]}` message

This eliminates duplicate patches during rapid state transitions (e.g., task status cycling through multiple states during AI execution).

## [S6] Phase 1 — Fix Gateway Double Base64

**Files:** `frontend/src/lib/e2ee/remoteWs.ts`, `crates/server/src/e2ee_bridge.rs`

Current behavior:
1. `remoteWs.ts`: `btoa(unescape(encodeURIComponent(data)))` — encodes WS text to Base64
2. `e2ee_bridge.rs`: `BASE64.encode(text.as_bytes())` — encodes again

This means every WS message is Base64-encoded twice: first by the frontend WS abstraction layer, then again by the bridge. The final payload on the wire is Base64-of-Base64, inflating data ~78% over the original.

Fix: In `e2ee_bridge.rs`, when sending `Text` WS messages back to the browser, send the text directly as the `data` field without re-encoding. The frontend `remoteWs.ts` already handles the decoding symmetrically — verify the decode path and remove the redundant encode on the bridge side.

Careful validation required: check `remoteWs.ts` `onmessage` handler to confirm it Base64-decodes incoming data, then remove the corresponding encode in the bridge.

## [S7] Phase 2 — Bounded Channel + Backpressure

**File:** `crates/server/src/e2ee_bridge.rs`

Replace `mpsc::unbounded_channel::<String>()` (line ~434) with `mpsc::channel::<String>(capacity)` where capacity = 256 messages. When the channel is full, apply backpressure by dropping the sender or logging a warning rather than silently buffering unlimited messages.

This prevents memory exhaustion under sustained high-throughput scenarios (e.g., long AI runs with verbose output).

## [S8] Phase 2 — WebSocket permessage-deflate

**File:** `crates/server/src/routes/mod.rs` or each WS handler

Enable `permessage-deflate` compression on axum WebSocket upgrades. Since compression happens at the TCP/WS layer — before the e2ee bridge reads the bytes — the encrypted payload seen by the gateway is already compressed.

Note: verify that the e2ee bridge forwards WS frames as opaque binary blobs (not inspecting content), which it does — so this is safe.

Expected impact: JSON Patch and log entry streams compress 50-70%.

## [S9] Success Criteria

- Phase 1: REST responses show `Content-Encoding: gzip` in browser DevTools
- Phase 1: Terminal frame count during AI execution drops ≥10x (measure via WS inspector)
- Phase 1: JSON Patch message count drops ≥5x during rapid task state changes
- Phase 1: Double Base64 fix verified by comparing wire payload size before/after
- Phase 2: e2ee bridge no longer uses unbounded channel (code review)
- Phase 2: WebSocket frames for log streams show reduced byte counts in DevTools Network tab

## [S10] Out of Scope

- Field-level incremental diff for Task/Workspace objects (Protocol Layer — Phase C)
- Lazy loading of initial snapshot (Phase C)
- Replacing diff polling with SSE push (Phase C)
- Changes to the e2ee encryption protocol itself
