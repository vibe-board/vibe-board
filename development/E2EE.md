# End-to-End Encryption (E2EE) — Remote Access

Vibe Board supports end-to-end encrypted remote access, allowing you to securely use the Web UI from any browser to manage a Kanban board running on a remote machine. The gateway server acts as a zero-knowledge message router — **it never has access to your data**. All content is encrypted between your browser and the machine running `vibe-board`.

## Architecture

```
Browser (holds keys)  ←──HTTPS──→  Gateway (zero-knowledge)  ←──WSS──→  Your Machine (vibe-board)
```

```
┌──────────────┐                              ┌──────────────────────┐
│  Machine A   │◄── Encrypted messages ──────►│                      │
│  (vibe-board│                              │     Gateway          │
│   server)    │                              │     (e2ee-gateway)   │
├──────────────┤                              │                      │
│  Machine B   │◄── Encrypted messages ──────►│  - Serves Web UI     │
│  (vibe-board│                              │  - User accounts     │
│   server)    │                              │  - Message routing   │
└──────────────┘                              └──────────┬───────────┘
                                                         │
┌──────────────┐                                         │
│  Browser     │◄── Encrypted messages ─────────────────►┘
│  (Web UI)    │
└──────────────┘
```

**Key properties:**
- The gateway cannot decrypt any content — it only routes encrypted messages
- The gateway serves the complete vibe-board Web UI — no local installation needed on the client
- Multiple machines can register to the same gateway
- The browser derives the same encryption keys from a shared master secret
- All operations are scoped per-user — users cannot access each other's machines

## Quick Start

### 1. Deploy the Gateway

Deploy the `e2ee-gateway` binary on a server with a public IP or domain. The gateway is a single binary that includes the Web UI.

**Configuration** is done via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_HOST` | `0.0.0.0` | Bind address |
| `GATEWAY_PORT` | `9090` | Listen port |
| `GATEWAY_DATABASE_URL` | `sqlite:gateway.db?mode=rwc` | SQLite database path |
| `GATEWAY_ALLOWED_ORIGINS` | *(none)* | CORS allowed origins (comma-separated) |
| `GATEWAY_SESSION_TTL_HOURS` | `168` (7 days) | Session token lifetime |

Example:

```bash
GATEWAY_PORT=443 ./e2ee-gateway
```

The first user to sign up automatically becomes the admin. After that, registration is closed.

### 2. Connect Your Machine to the Gateway

On the machine running `vibe-board`, first authenticate:

```bash
vibe-board login --gateway https://your-gateway.example.com
```

This will:
1. Prompt for your email and password
2. Authenticate with the gateway
3. Generate a 32-byte master secret
4. Save credentials locally
5. Print the master secret — **save this for later, you'll need it in the browser**

Example output:
```
Logging in to gateway: https://your-gateway.example.com
Email: you@example.com
Password: ****

Login successful!

Your master secret (for pairing):
  K7x2m9QaB3nF8pLw... (base64)
```

Then start the server:

```bash
vibe-board
```

The server connects to the gateway automatically. You should see in the logs:
```
INFO Bridge connected and registered as machine ...
```

### 3. Access from Any Browser

Open `https://your-gateway.example.com` in any browser. You will see the gateway login screen.

1. **Log in** — use the email and password you registered with
2. **Enter your master secret** — paste the base64 string from step 2
3. **Select your machine** — you'll see a list of your online machines
4. **Done** — the full vibe-board interface loads, all data is end-to-end encrypted

All API calls, WebSocket streams, and file uploads are transparently encrypted in your browser. The gateway only sees encrypted data.

### Connection recovery

If the connection drops (network issues, server restart, etc.), the browser will automatically reconnect with exponential backoff. After 5 failed attempts, you'll be returned to the machine selection screen to reconnect manually.

## CLI Commands

| Command | Description |
|---------|-------------|
| `vibe-board server` | Start the server (default if no subcommand given) |
| `vibe-board login --gateway <url>` | Authenticate with a gateway and generate master secret |
| `vibe-board logout` | Delete stored gateway credentials |
| `vibe-board status` | Show gateway connection status |

## Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `e2ee-core` | `crates/e2ee-core/` | Shared cryptography library (Rust) |
| `e2ee-gateway` | `crates/e2ee-gateway/` | Gateway server — serves Web UI + message routing |
| Bridge (in server) | `crates/server/src/e2ee_bridge.rs` | Connects local server to gateway |
| Frontend client | `frontend/src/lib/e2ee/` | Browser-side encryption + gateway connection |

## Cryptography

### Key Hierarchy

```
Master Secret (32 random bytes, generated once at login)
├── KDF(ctx="vkauth__", idx=1) → Ed25519 Auth KeyPair
│   └── Used for: device authentication (signed tokens)
└── KDF(ctx="vkcont__", idx=2) → X25519 Content KeyPair
    └── Used for: per-connection DEK wrapping
         └── DEK (32 random bytes per connection)
              └── Used for: XChaCha20-Poly1305 message encryption
```

### Algorithms

| Purpose | Algorithm | Key Size |
|---------|-----------|----------|
| Key derivation | BLAKE2b-512 | Master → 64-byte subkey |
| Device auth | Ed25519 | 32-byte seed → 64-byte keypair |
| DEK wrapping | X25519 ECDH + XChaCha20-Poly1305 | 32-byte public/secret |
| Message encryption | XChaCha20-Poly1305 | 32-byte DEK + 24-byte nonce |
| Password hashing (gateway) | Argon2id | — |

### Encrypted Payload Format

All encrypted messages use this JSON envelope:

```json
{
  "t": "encrypted",
  "c": "<base64(nonce_24_bytes || ciphertext)>"
}
```

### Auth Token

Daemon authentication uses Ed25519 signed tokens:

```json
{
  "payload": {
    "public_key": "<base64 Ed25519 public key>",
    "timestamp": "2026-03-14T10:30:00Z"
  },
  "signature": "<base64 Ed25519 signature>"
}
```

Tokens expire after 5 minutes. The gateway verifies the signature and looks up the public key in its `device_keys` table to determine the user.

## WebSocket Protocol

The gateway exposes two WebSocket endpoints:

### Daemon endpoint: `GET /ws/daemon`

Used by `vibe-board` servers to connect to the gateway.

**Authentication:** Ed25519 signed token passed as `?token=<base64(json)>` query parameter.

**Messages (Daemon → Gateway):**
```json
{"type": "register", "machine_id": "...", "hostname": "...", "platform": "..."}
{"type": "forward", "payload": {"t": "encrypted", "c": "..."}}
```

**Messages (Gateway → Daemon):**
```json
{"type": "auth_ok", "user_id": "..."}
{"type": "registered", "machine_id": "..."}
{"type": "forward", "payload": {"t": "encrypted", "c": "..."}}
{"type": "client_connected"}
{"type": "client_disconnected"}
```

### WebUI endpoint: `GET /ws/webui`

Used by browsers to connect to the gateway.

**Authentication:** Session token passed as `?token=<session_token>` query parameter.

**Messages (WebUI → Gateway):**
```json
{"type": "subscribe", "machine_id": "..."}
{"type": "unsubscribe", "machine_id": "..."}
{"type": "forward", "machine_id": "...", "payload": {"t": "encrypted", "c": "..."}}
```

**Messages (Gateway → WebUI):**
```json
{"type": "auth_ok", "user_id": "..."}
{"type": "machines", "machines": [{"machine_id": "...", "hostname": "...", "platform": "..."}]}
{"type": "machine_online", "machine_id": "..."}
{"type": "machine_offline", "machine_id": "..."}
{"type": "forward", "machine_id": "...", "payload": {"t": "encrypted", "c": "..."}}
```

## REST API (Gateway)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | None | Health check |
| `GET` | `/api/gateway/info` | None | Gateway mode detection (`{"mode": "gateway"}`) |
| `GET` | `/api/auth/registration-status` | None | Check if signup is open (`{"open": true/false}`) |
| `POST` | `/api/auth/signup` | None | Create first user (admin) |
| `POST` | `/api/auth/login` | None | Login, returns session token |
| `POST` | `/api/auth/device/register` | Bearer token | Register Ed25519 device public key |
| `GET` | `/api/machines` | Bearer token | List user's machines with online status |

## Database Schema (Gateway)

The gateway uses SQLite for easy self-hosting:

```sql
-- User accounts (first user = admin)
users (id, email, password_hash, name, role, created_at)

-- Registered device public keys (Ed25519)
device_keys (id, user_id, public_key, device_name, created_at)

-- Known machines
machines (id, user_id, hostname, platform, last_seen_at, created_at)

-- Session tokens (auto-cleaned hourly)
sessions (token, user_id, created_at, expires_at)
```

## Security Properties

| Threat | Mitigation |
|--------|-----------|
| Gateway compromise | All content encrypted with per-connection DEK; gateway only sees encrypted blobs |
| Gateway DB leak | Only stores: email, password hash, device public keys. No session content. |
| Network eavesdropping | WSS (TLS) + E2EE double encryption |
| Replay attack | Ed25519 auth tokens expire in 5 min; message nonces are random 24-byte |
| Cross-user access | All gateway operations are scoped by `(resource_id, user_id)` |
| Wrong master secret | DEK unwrap fails → no decryption possible |

## Credential Storage

Credentials are stored at `~/.vibe-board/credentials.json` with `0600` permissions (owner read/write only):

```json
{
  "master_secret": "<base64 32-byte secret>",
  "gateway_url": "https://your-gateway.example.com",
  "session_token": "<session token>",
  "user_id": "<uuid>"
}
```

Delete with `vibe-board logout`.

## Frontend Integration (Developer Reference)

The frontend detects gateway mode at runtime by calling `/api/gateway/info`. When running on the gateway, it shows a login → pair → machine select flow before loading the main app.

### Gateway mode detection

The module `frontend/src/lib/gateway-mode.ts` provides:
- `detectGatewayMode()` — calls `/api/gateway/info`, returns `true` if on gateway
- `getGatewayConnection()` — returns the active `E2EEConnection` (used by `makeRequest` and WebSocket hooks)

### How requests are routed in gateway mode

- **REST API**: `makeRequest()` in `api.ts` checks `getGatewayConnection()` and routes through `E2EEConnection.remoteFetch()` instead of direct `fetch()`
- **File uploads**: `uploadFormData()` does the same for `FormData` bodies (image uploads)
- **WebSocket streams**: `useJsonPatchWsStream`, `useLogStream`, and `streamJsonPatchEntries` use `conn.openWsStream()` to create a `RemoteWs` (WebSocket-compatible interface over E2EE) instead of `new WebSocket()`

### E2EE client files

| File | Purpose |
|------|---------|
| `lib/e2ee/crypto.ts` | XChaCha20-Poly1305, X25519 DEK wrapping |
| `lib/e2ee/keys.ts` | BLAKE2b KDF — derive content keypair from master secret |
| `lib/e2ee/envelope.ts` | JSON encryption envelope format |
| `lib/e2ee/manager.ts` | Singleton managing paired secrets + DEKs |
| `lib/e2ee/connection.ts` | WebSocket connection to gateway + `remoteFetch()` + `openWsStream()` |
| `lib/e2ee/remoteWs.ts` | WebSocket-compatible interface for remote streams |
| `lib/gateway-mode.ts` | Runtime gateway detection + connection singleton |
| `contexts/GatewayContext.tsx` | Gateway lifecycle state machine (React) |
| `components/gateway/*.tsx` | Login, pairing, and machine selection UI |

**Dependencies:** `tweetnacl`, `@noble/hashes`, `@noble/ciphers` (pure JS, no WASM).

## Troubleshooting

**"No gateway credentials found"**
Run `vibe-board login --gateway <url>` to authenticate and generate a master secret.

**"Credentials are for a different gateway"**
Run `vibe-board login --gateway <url>` again with the correct gateway URL.

**No machines appear after logging in to the gateway**
Check that the `vibe-board` server is running and credentials are configured (`vibe-board status`). Look at the server logs for connection messages.

**Pairing fails / "Invalid master secret"**
Ensure you're pasting the complete base64 master secret (exactly 44 characters for a 32-byte secret).

**Request timeout**
Check that the remote `vibe-board` server is running and connected to the gateway. The default timeout is 30s for normal requests and 120s for file uploads.

**Connection keeps dropping**
The browser automatically reconnects up to 5 times with exponential backoff. If it keeps failing, check the gateway server logs and network connectivity between the gateway and the machine.
