# E2EE Key Exchange Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken E2EE key exchange (where gateway sees content public key) with an OOB master secret + WebUI-generated DEK protocol that achieves true gateway zero-knowledge.

**Architecture:** Bridge generates master secret, prints to terminal (OOB). User pastes into WebUI. Both sides derive identical content keypairs. WebUI generates random DEK per connection, wraps via sealed-box for bridge. All bridge requests/responses encrypted with DEK.

**Tech Stack:** Rust (tokio, serde, base64), TypeScript (React, WebSocket), XChaCha20-Poly1305, sealed-box (X25519 + BLAKE2b)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `crates/e2ee-core/src/protocol.rs` | Add `DekOk` and `Encrypted` variants to `BridgeResponse` |
| `crates/e2ee-core/src/protocol.rs` (tests) | Serialization tests for new variants |
| `crates/server/src/e2ee_bridge.rs` | DEK state (`Arc<Mutex<Option<[u8; 32]>>>`), DEK exchange handling, encrypted forward/decrypt/proxy/encrypt logic |
| `crates/server/src/main.rs` | Add QR code printing to `cmd_login` |
| `crates/server/Cargo.toml` | Add `qr2term` dependency |
| `frontend/package.json` | **No change for MVP** — jsQR deferred to follow-on QR scanning feature |
| `frontend/src/lib/e2ee/connection.ts` | `initDek()` method, `case 'dek_ok'` handler in `handleResponsePayload` |
| `frontend/src/hooks/useE2ee.ts` | Call `initDek()` after gateway connect |
| `frontend/src/components/dialogs/E2EESettingsDialog.tsx` | Replace auto-generate with OOB text input for bridge master secret |

---

## Task 1: Add `DekOk` and `Encrypted` variants to `BridgeResponse`

**Files:**
- Modify: `crates/e2ee-core/src/protocol.rs:56-100`
- Modify: `crates/e2ee-core/src/protocol.rs:102-149` (tests)

- [ ] **Step 1: Write failing tests**

Add two tests to the existing `#[cfg(test)] mod tests` block in `protocol.rs`:

```rust
#[test]
fn test_bridge_response_dek_ok_serialization() {
    let resp = BridgeResponse::DekOk;
    let json = serde_json::to_string(&resp).unwrap();
    assert!(json.contains("\"type\":\"dek_ok\""));

    let parsed: BridgeResponse = serde_json::from_str(&json).unwrap();
    assert!(matches!(parsed, BridgeResponse::DekOk));
}

#[test]
fn test_bridge_response_encrypted_serialization() {
    use crate::keys::generate_dek;
    use crate::envelope::{encrypt_to_envelope, EncryptedPayload};

    let dek = generate_dek();
    let inner = BridgeResponse::Pong { id: 42 };
    let encrypted = encrypt_to_envelope(
        &serde_json::to_vec(&inner).unwrap(),
        &dek,
    ).unwrap();

    let resp = BridgeResponse::Encrypted(encrypted.clone());
    let json = serde_json::to_string(&resp).unwrap();
    assert!(json.contains("\"type\":\"encrypted\""));

    let parsed: BridgeResponse = serde_json::from_str(&json).unwrap();
    if let BridgeResponse::Encrypted(ep) = parsed {
        assert_eq!(ep.t, "encrypted");
        assert_eq!(ep.c, encrypted.c);
    } else {
        panic!("Expected Encrypted variant");
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p e2ee-core -- test_bridge_response_dek_ok test_bridge_response_encrypted`
Expected: FAIL with "no variant or associated item named `DekOk`"

- [ ] **Step 3: Add variants to `BridgeResponse` enum**

Add after the `Error` variant at line 99:

```rust
/// DEK exchange acknowledgement
#[serde(rename = "dek_ok")]
DekOk,
/// Encrypted response payload
Encrypted(crate::envelope::EncryptedPayload),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p e2ee-core`
Expected: All tests PASS (including new ones)

- [ ] **Step 5: Regenerate shared types**

Run: `pnpm run generate-types`
Expected: `shared/types.ts` updated with new `BridgeResponse` variants

- [ ] **Step 6: Commit**

```bash
git add crates/e2ee-core/src/protocol.rs shared/types.ts
git commit -m "feat(e2ee): add DekOk and Encrypted variants to BridgeResponse"
```

---

## Task 2: DEK state and exchange handling in bridge

**Files:**
- Modify: `crates/server/src/e2ee_bridge.rs:1-14` (imports, add DekState type)
- Modify: `crates/server/src/e2ee_bridge.rs:200-260` (create DekState in connect_and_run, pass to handle_forward)
- Modify: `crates/server/src/e2ee_bridge.rs:288-468` (handle_forward: DEK exchange + decrypt/proxy/encrypt)

- [ ] **Step 1: Add DekState type alias**

At the top of `e2ee_bridge.rs`, after the `WsConnections` type alias (line 14), add:

```rust
/// DEK state for this connection — None until DEK exchange completes
type DekState = Arc<Mutex<Option<[u8; 32]>>>;
```

- [ ] **Step 2: Create DekState in connect_and_run**

In `connect_and_run()`, after line 203 (`let ws_connections: WsConnections = ...`), add:

```rust
let dek_state: DekState = Arc::new(Mutex::new(None));
```

- [ ] **Step 3: Pass DekState to handle_forward**

In the `Forward` arm (lines 237-259), clone `dek_state` and pass it to `handle_forward`:

```rust
GatewayMessage::Forward { payload } => {
    let tx = tx.clone();
    let client = http_client.clone();
    let base = local_base.clone();
    let crypto_content_sk = crypto.content_keypair.secret_key;
    let crypto_content_pk = crypto.content_keypair.public_key;
    let ws_conns = ws_connections.clone();
    let dek = dek_state.clone();

    tokio::spawn(async move {
        if let Err(e) = handle_forward(
            payload,
            &client,
            &base,
            &crypto_content_sk,
            &crypto_content_pk,
            &tx,
            &ws_conns,
            &dek,
        )
        .await
        {
            warn!("Forward handling error: {e}");
        }
    });
}
```

- [ ] **Step 4: Update handle_forward signature**

Change the function signature to accept `dek_state: &DekState` (replacing `_content_pk` and `_content_sk` with actual used params):

```rust
async fn handle_forward(
    payload: serde_json::Value,
    client: &reqwest::Client,
    local_base: &str,
    content_sk: &[u8; 32],
    content_pk: &[u8; 32],
    tx: &mpsc::UnboundedSender<String>,
    ws_connections: &WsConnections,
    dek_state: &DekState,
) -> Result<()> {
```

- [ ] **Step 5: Write failing test for DEK exchange handling**

Add a test to `e2ee_bridge.rs` (or as a separate test module). This tests the DEK exchange logic in isolation:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_handle_dek_exchange() {
        let dek_state: DekState = Arc::new(Mutex::new(None));
        let content_sk = [0u8; 32]; // placeholder
        let content_pk = [0u8; 32]; // placeholder

        // Simulate a dek_exchange payload
        let dek_payload = serde_json::json!({
            "type": "dek_exchange",
            "wrapped_dek": "dGVzdA==" // base64 of "test"
        });

        // This will fail because unwrap_dek needs valid wrapped DEK
        // A proper integration test would use actual keypairs
        // For now, verify the code path exists and rejects invalid data
        let (tx, _rx) = mpsc::unbounded_channel();
        let ws_conns: WsConnections = Arc::new(Mutex::new(HashMap::new()));
        let result = handle_forward(
            dek_payload,
            &reqwest::Client::new(),
            "http://127.0.0.1:3000",
            &content_sk,
            &content_pk,
            &tx,
            &ws_conns,
            &dek_state,
        ).await;
        // Should fail because "test" is not a valid wrapped DEK
        assert!(result.is_err());
        // DEK state should still be None
        assert!(dek_state.lock().await.is_none());
    }
}
```

- [ ] **Step 6: Replace the encrypted stub with DEK exchange + decrypt logic**

Replace lines 297-299 (the encrypted stub) with:

```rust
// Phase 1: Check for DEK exchange (before DEK is established)
if let Some(wrapped_dek_b64) = payload
    .get("type")
    .and_then(|v| v.as_str())
    .filter(|&t| t == "dek_exchange")
    .and_then(|_| payload.get("wrapped_dek"))
    .and_then(|v| v.as_str())
{
    let wrapped_dek = BASE64
        .decode(wrapped_dek_b64)
        .context("Invalid base64 in wrapped_dek")?;
    let dek = e2ee_core::unwrap_dek(&wrapped_dek, content_sk, content_pk)
        .context("Failed to unwrap DEK")?;
    *dek_state.lock().await = Some(dek);
    info!("DEK exchange complete");
    send_response(tx, e2ee_core::BridgeResponse::DekOk);
    return Ok(());
}

// Phase 2: Decrypt if encrypted payload
let request: e2ee_core::BridgeRequest = if e2ee_core::is_encrypted_payload(&payload) {
    let dek_guard = dek_state.lock().await;
    let dek = dek_guard.as_ref().context("No DEK established — cannot decrypt")?;
    let enc_payload: e2ee_core::envelope::EncryptedPayload =
        serde_json::from_value(payload).context("Failed to parse encrypted envelope")?;
    e2ee_core::decrypt_json(&enc_payload, dek).context("Failed to decrypt request")?
} else {
    serde_json::from_value(payload).context("Failed to parse BridgeRequest")?
};
```

- [ ] **Step 7: Add encrypted response sending**

Add a helper function `send_encrypted_response`:

```rust
/// Send a bridge response, encrypting with DEK if available
fn send_encrypted_response(
    tx: &mpsc::UnboundedSender<String>,
    response: e2ee_core::BridgeResponse,
    dek: Option<&[u8; 32]>,
) -> Result<()> {
    let final_response = if let Some(dek) = dek {
        let encrypted = e2ee_core::encrypt_json(&response, dek)?;
        e2ee_core::BridgeResponse::Encrypted(encrypted)
    } else {
        response
    };
    send_response(tx, final_response);
    Ok(())
}
```

Read the DEK state once before the match block, then replace all `send_response(tx, ...)` calls in the match arms with `send_encrypted_response(tx, ..., dek_ref)?`:

```rust
let dek_opt = *dek_state.lock().await;
let dek_ref = dek_opt.as_ref();

// In each match arm, replace:
//   send_response(tx, response);
// with:
//   send_encrypted_response(tx, response, dek_ref)?;
```

**Critical: WS sub-connection spawned tasks (lines 377-408) must also encrypt.** These tasks call `send_response` for `WsData` and `WsClosed` messages. The spawned closures need the DEK value. Capture `dek_opt` (it's `Copy`) before the match, and pass it into the spawned WS task closures:

```rust
BridgeRequest::WsOpen { id, path, query } => {
    // ... existing setup ...
    let dek_for_ws = dek_opt; // Copy the Option<[u8; 32]> into the closure
    tokio::spawn(async move {
        // ... existing ws loop ...
        // Replace send_response(&tx, ...) with:
        send_encrypted_response(&tx, response, dek_for_ws.as_ref())?;
    });
}
```

This applies to all three WS sub-connection response types: `WsOpened`, `WsData`, and `WsClosed`.

- [ ] **Step 8: Run tests**

Run: `cargo test --workspace`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add crates/server/src/e2ee_bridge.rs
git commit -m "feat(e2ee): implement DEK exchange and encrypted forwarding in bridge"
```

---

## Task 3: Add QR code printing to `cmd_login`

The bridge already generates and prints the master secret in `cmd_login` (`crates/server/src/main.rs:293`). This task adds a QR code for easier mobile pairing.

**Files:**
- Modify: `crates/server/Cargo.toml` (add `qr2term` dependency)
- Modify: `crates/server/src/main.rs` (add QR code print after secret text)

- [ ] **Step 1: Add `qr2term` dependency**

Add to `crates/server/Cargo.toml` under `[dependencies]`:

```toml
qr2term = "0.3"
```

- [ ] **Step 2: Add QR code printing to `cmd_login`**

After the existing `println!("  {master_secret_b64}");` line in `cmd_login`, add:

```rust
// Print QR code for mobile pairing
println!();
if let Err(e) = qr2term::print_qr(&master_secret_b64) {
    warn!("Failed to print QR code: {e}");
}
```

- [ ] **Step 3: Build to verify**

Run: `cargo build -p vibe-board-server`
Expected: Build succeeds, `qr2term` compiles

- [ ] **Step 4: Commit**

```bash
git add crates/server/Cargo.toml crates/server/src/main.rs
git commit -m "feat(e2ee): add QR code printing to cmd_login for mobile pairing"
```

---

## Task 4: Add `initDek()` to `E2EEConnection` + `case 'dek_ok'` handler

**Files:**
- Modify: `frontend/src/lib/e2ee/connection.ts:54-66` (class fields)
- Modify: `frontend/src/lib/e2ee/connection.ts:320-378` (handleMessage / handleResponsePayload)

- [ ] **Step 1: Add DEK pending field and `initDek()` method**

Add a field to `E2EEConnection` class (after line 56):

```typescript
private dekResolver: (() => void) | null = null;
```

Add the `initDek()` method after `subscribeMachine()`:

```typescript
/**
 * Perform DEK exchange with the bridge.
 * Generates a random DEK, wraps it with the bridge's content public key,
 * sends it as the first message, and waits for 'dek_ok' acknowledgement.
 */
async initDek(
  manager: import('./manager').E2EEManager,
  machineId: string
): Promise<void> {
  if (!this._connected || !this.options) {
    throw new Error('Not connected');
  }

  // Generate random 32-byte DEK
  const dek = crypto.getRandomValues(new Uint8Array(32));

  // Get content public key from manager
  const contentPk = manager.getContentPublicKey();
  if (!contentPk) {
    throw new Error('No paired secret — cannot derive content public key');
  }

  // Import wrapDek from crypto module
  const { wrapDek } = await import('./crypto');
  const wrappedDek = wrapDek(dek, contentPk);
  const wrappedDekB64 = btoa(String.fromCharCode(...wrappedDek));

  // Register one-shot listener for dek_ok
  const dekOkPromise = new Promise<void>((resolve, reject) => {
    this.dekResolver = resolve;
    setTimeout(() => {
      if (this.dekResolver) {
        this.dekResolver = null;
        reject(new Error('DEK exchange timeout'));
      }
    }, 10000);
  });

  // Send DEK exchange message (unencrypted — DEK not yet established)
  this.send({
    type: 'forward',
    machine_id: machineId,
    payload: {
      type: 'dek_exchange',
      wrapped_dek: wrappedDekB64,
    },
  });

  await dekOkPromise;
  this.dek = dek;
}
```

- [ ] **Step 2: Add `getContentPublicKey()` to E2EEManager**

In `frontend/src/lib/e2ee/manager.ts`, add a method to get the content public key from any paired secret:

```typescript
/** Get the content public key from the first paired secret, or null */
getContentPublicKey(): Uint8Array | null {
  const first = this.contentKeyPairs.values().next().value;
  return first ? first.publicKey : null;
}
```

- [ ] **Step 3: Add `case 'dek_ok'` to `handleResponsePayload`**

In `handleResponsePayload()` (line 387), add a case before the existing logic:

```typescript
// Handle DEK exchange acknowledgement
if (type === 'dek_ok') {
  if (this.dekResolver) {
    this.dekResolver();
    this.dekResolver = null;
  }
  return;
}
```

- [ ] **Step 4: Run frontend type check**

Run: `pnpm run check`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/e2ee/connection.ts frontend/src/lib/e2ee/manager.ts
git commit -m "feat(e2ee): add initDek() method and dek_ok handler to E2EEConnection"
```

---

## Task 5: Update `useE2ee.ts` to call `initDek()` after connect

**Files:**
- Modify: `frontend/src/hooks/useE2ee.ts:68-91` (connectToGateway callback)

- [ ] **Step 1: Add initDek call after subscribeMachine**

In `connectToGateway` callback, after `connection.subscribeMachine(machineId)` (line 81), add:

```typescript
// Establish DEK before marking connection as ready
if (manager.hasPairedSecrets) {
  await connection.initDek(manager, machineId);
}
```

The full updated `connectToGateway`:

```typescript
const connectToGateway = useCallback(
  async (gatewayUrl: string, sessionToken: string, machineId: string) => {
    setConnecting(true);
    setError(null);
    try {
      await connection.connect({
        gatewayUrl,
        sessionToken,
        machineId,
        onConnect: () => setConnected(true),
        onDisconnect: () => setConnected(false),
        onError: (err) => setError(err),
      });
      connection.subscribeMachine(machineId);

      // Establish DEK before marking connection as ready
      if (manager.hasPairedSecrets) {
        await connection.initDek(manager, machineId);
      }

      setConnected(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed');
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  },
  []
);
```

- [ ] **Step 2: Run frontend type check**

Run: `pnpm run check`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useE2ee.ts
git commit -m "feat(e2ee): call initDek() after gateway connect in useE2ee hook"
```

---

## Task 6: Update `E2EESettingsDialog` for OOB secret input

**Files:**
- Modify: `frontend/src/components/dialogs/E2EESettingsDialog.tsx`

**Note:** The design spec mentions QR code scanning via `jsQR` / `BarcodeDetector` API. For MVP, text paste is sufficient. QR scanning is a follow-on feature — the text input approach below works for both desktop (copy-paste from terminal) and mobile (manual typing). Add QR scanning in a future iteration.

- [ ] **Step 1: Replace auto-generate with text input**

The current flow (lines 128-167) auto-generates a master secret after login. This must change to accept a bridge-generated secret via text paste.

Remove the `generateMasterSecretB64()` function (lines 20-23).

Replace the auto-setup effect (lines 128-167) with a manual setup handler. The new Section 2 should be:

```tsx
{/* Section 2: Master Secret (paste from bridge terminal) */}
{isAuthenticated && (
  <div className="space-y-3">
    <Label className="text-sm font-medium">
      {t('settings.general.e2ee.masterSecret.label', 'Master Secret')}
    </Label>

    {setupLoading ? (
      <p className="text-sm text-muted-foreground">
        {t(
          'settings.general.e2ee.masterSecret.settingUp',
          'Registering device and setting up...'
        )}
      </p>
    ) : masterSecret ? (
      <div className="space-y-2">
        <p className="text-sm text-green-600">
          {t(
            'settings.general.e2ee.masterSecret.paired',
            'E2EE paired successfully'
          )}
        </p>
      </div>
    ) : (
      <div className="space-y-2">
        <Input
          placeholder={t(
            'settings.general.e2ee.masterSecret.placeholder',
            'Paste master secret from bridge terminal'
          )}
          value={pastedSecret}
          onChange={(e) => setPastedSecret(e.target.value)}
        />
        {setupError && (
          <p className="text-xs text-red-500">{setupError}</p>
        )}
        <Button
          onClick={handleSetupFromSecret}
          disabled={!pastedSecret.trim() || setupLoading}
          className="w-full"
          size="sm"
        >
          {t(
            'settings.general.e2ee.masterSecret.pair',
            'Pair with Bridge'
          )}
        </Button>
      </div>
    )}

    {/* Connection Status */}
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${
          connected ? 'bg-green-500' : 'bg-gray-400'
        }`}
      />
      <span className="text-sm text-muted-foreground">
        {connected
          ? t(
              'settings.general.e2ee.masterSecret.connected',
              'Connected'
            )
          : t(
              'settings.general.e2ee.masterSecret.notConnected',
              'Not connected'
            )}
      </span>
    </div>
    {e2eeError && <p className="text-xs text-red-500">{e2eeError}</p>}
  </div>
)}
```

- [ ] **Step: Add state and handler for pasted secret**

Replace `const [masterSecret, setMasterSecret]` with:

```typescript
const [pastedSecret, setPastedSecret] = useState('');
const [masterSecret, setMasterSecret] = useState<string | null>(null);
const [setupLoading, setSetupLoading] = useState(false);
const [setupError, setSetupError] = useState<string | null>(null);
```

Add the setup handler (replaces the auto-setup effect):

```typescript
const handleSetupFromSecret = async () => {
  if (!session || !pastedSecret.trim()) return;
  setSetupLoading(true);
  setSetupError(null);
  try {
    const secretB64 = pastedSecret.trim();
    const secretBytes = Uint8Array.from(atob(secretB64), (c) =>
      c.charCodeAt(0)
    );
    const authKp = await deriveAuthKeyPair(secretBytes);
    const pubKeyB64 = btoa(String.fromCharCode(...authKp.publicKey));

    await registerDevice(
      session.gatewayUrl,
      session.sessionToken,
      pubKeyB64
    );

    await notifyBackendCredentials(secretB64, session);

    // Add to E2EE manager
    const { addPairedSecret } = useE2EE();
    addPairedSecret(secretB64);

    setMasterSecret(secretB64);
    setPastedSecret('');
  } catch (e) {
    setSetupError(e instanceof Error ? e.message : 'Setup failed');
  } finally {
    setSetupLoading(false);
  }
};
```

**Note:** Since `addPairedSecret` is from the hook and we're inside the component, we can use it directly (it's already destructured from `useE2EE()` at line 76).

- [ ] **Step 3: Remove `handleCopySecret` and `copied` state**

These are no longer needed since the secret is generated by the bridge, not displayed in the UI. Remove lines 98-101 (`copied` state) and lines 191-196 (`handleCopySecret`).

- [ ] **Step 4: Run frontend type check**

Run: `pnpm run check`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dialogs/E2EESettingsDialog.tsx
git commit -m "feat(e2ee): change settings dialog to OOB master secret input"
```

---

## Task 7: Full workspace verification

**Test coverage note:** The spec's Testing section lists aspirational tests (cross-platform keypair derivation, full bridge integration with mock local server, frontend Vitest suite). This plan focuses on the critical implementation path with inline TDD. Full integration tests should be added as a follow-on after the core implementation is verified working end-to-end.

- [ ] **Step 1: Run Rust tests**

Run: `cargo test --workspace`
Expected: All tests PASS

- [ ] **Step 2: Run frontend checks**

Run: `pnpm run check`
Expected: No type errors

- [ ] **Step 3: Run lint**

Run: `pnpm run lint`
Expected: No lint errors

- [ ] **Step 4: Run build**

Run: `pnpm run build` (or `cargo build --workspace`)
Expected: Build succeeds

- [ ] **Step 5: Manual verification checklist**

1. Start bridge → verify master secret + QR code printed to terminal (existing `cmd_login` behavior)
2. Open WebUI → E2EE Settings → paste master secret from terminal → click "Pair with Bridge"
3. Connect to machine → verify `dek_exchange` succeeds (check bridge logs for "DEK exchange complete")
4. Make an API request → verify bridge decrypts, proxies to local server, encrypts response
5. Open browser DevTools Network tab → verify all `forward` payloads are opaque `{ t: "encrypted", c: "..." }`

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(e2ee): address verification issues"
```
