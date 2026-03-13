# End-to-End Encryption (E2EE) — Remote Access

Vibe Kanban supports end-to-end encrypted remote access, allowing you to securely use the WebUI from any browser to manage a Kanban board running on a remote machine. The gateway server acts as a message router but **never** has access to your data — all content is encrypted between your browser and the machine running `vibe-kanban`.

## Architecture

```
┌──────────────┐                              ┌──────────────────────┐
│  Machine A   │◄── Encrypted messages ──────►│                      │
│  (vibe-kanban│                              │     Gateway          │
│   server)    │                              │     (e2ee-gateway)   │
├──────────────┤                              │                      │
│  Machine B   │◄── Encrypted messages ──────►│  - User accounts     │
│  (vibe-kanban│                              │  - Device keys       │
│   server)    │                              │  - Message routing   │
└──────────────┘                              └──────────┬───────────┘
                                                         │
┌──────────────┐                                         │
│  Browser     │◄── Encrypted messages ─────────────────►┘
│  (WebUI)     │
└──────────────┘
```

**Key properties:**
- The gateway cannot decrypt any content — it only routes encrypted messages
- Multiple machines can register to the same gateway
- The browser derives the same encryption keys from a shared master secret
- All operations are scoped per-user — users cannot access each other's machines

## Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `e2ee-core` | `crates/e2ee-core/` | Shared cryptography library (Rust) |
| `e2ee-gateway` | `crates/e2ee-gateway/` | Gateway server — user auth + message routing |
| Bridge (in server) | `crates/server/src/e2ee_bridge.rs` | Connects local server to gateway |
| Frontend client | `frontend/src/lib/e2ee/` | Browser-side encryption + gateway connection |

## Quick Start

### 1. Deploy the Gateway

Build and run the gateway server:

```bash
# Build
pnpm run gateway:build

# Run (development)
pnpm run gateway:dev

# Or directly:
GATEWAY_PORT=9090 cargo run --bin e2ee-gateway
```

The first user to sign up automatically becomes the admin. Subsequent registrations are disabled.

**Gateway environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_HOST` | `0.0.0.0` | Bind address |
| `GATEWAY_PORT` | `9090` | Listen port |
| `GATEWAY_DATABASE_URL` | `sqlite:gateway.db?mode=rwc` | SQLite database path |
| `GATEWAY_ALLOWED_ORIGINS` | *(none)* | CORS allowed origins (comma-separated) |
| `GATEWAY_SESSION_TTL_HOURS` | `168` (7 days) | Session token lifetime |

### 2. Register Your Account on the Gateway

The first user to sign up becomes the admin. You can do this from the WebUI's E2EE settings dialog or via any HTTP client:

```bash
curl -X POST https://your-gateway.example.com/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email": "you@example.com", "password": "your-password"}'
```

### 3. Login the Local Machine

On the machine running `vibe-kanban`:

```bash
vibe-kanban login --gateway https://your-gateway.example.com
```

This will:
1. Prompt for your email and password
2. Authenticate with the gateway
3. Generate a 32-byte master secret
4. Derive a device key and register it on the gateway
5. Save credentials to `~/.vibe-kanban/credentials.json`
6. Print the master secret — **copy this for pairing the WebUI**

Example output:
```
Logging in to gateway: https://your-gateway.example.com
Email: you@example.com
Password: ****

Login successful!

Your master secret (for pairing WebUI):
  K7x2m9QaB3nF8pLw... (base64)

Enter this in WebUI Settings > E2EE > Pair Device
```

### 4. Start the Server with Gateway Connection

Set the `VK_GATEWAY_URL` environment variable when starting the server:

```bash
VK_GATEWAY_URL=https://your-gateway.example.com vibe-kanban
```

The server will automatically connect to the gateway in the background. You can verify with the logs:

```
INFO Starting E2EE bridge to gateway: https://your-gateway.example.com
INFO Bridge connected and registered as machine ...
```

### 5. Pair the WebUI

Open the WebUI (either locally or served through the gateway), then:

1. Go to **Settings > E2EE**
2. Enter the **gateway URL** and log in with your email/password
3. In the **Pair Device** section, paste the master secret from step 3
4. Your paired machines will appear in the **Online Machines** section
5. Click **Connect** on the machine you want to access

Once connected, all API calls from the WebUI are transparently encrypted and forwarded to the remote machine.

## CLI Commands

| Command | Description |
|---------|-------------|
| `vibe-kanban server` | Start the server (default if no subcommand given) |
| `vibe-kanban login --gateway <url>` | Authenticate with a gateway and generate master secret |
| `vibe-kanban logout` | Delete stored gateway credentials |
| `vibe-kanban status` | Show gateway connection status |

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

Used by `vibe-kanban` servers to connect to the gateway.

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

Credentials are stored at `~/.vibe-kanban/credentials.json` with `0600` permissions (owner read/write only):

```json
{
  "master_secret": "<base64 32-byte secret>",
  "gateway_url": "https://your-gateway.example.com",
  "session_token": "<session token>",
  "user_id": "<uuid>"
}
```

Delete with `vibe-kanban logout`.

## Frontend Integration

The frontend E2EE client is in `frontend/src/lib/e2ee/`:

| File | Purpose |
|------|---------|
| `crypto.ts` | XChaCha20-Poly1305, X25519 DEK wrapping |
| `keys.ts` | BLAKE2b KDF — derive content keypair from master secret |
| `envelope.ts` | JSON encryption envelope format |
| `manager.ts` | Singleton managing paired secrets + DEKs |
| `connection.ts` | WebSocket connection to gateway + `remoteFetch()` |

**React hooks:**

| Hook | File | Purpose |
|------|------|---------|
| `useE2EE()` | `hooks/use-e2ee.ts` | Secrets management, machine list, gateway connection |
| `useGatewayAuth()` | `hooks/use-gateway-auth.ts` | Gateway signup/login/logout |

**Dependencies:** `tweetnacl`, `@noble/hashes`, `@noble/ciphers` (pure JS, no WASM).

### Using `remoteFetch()`

When connected to a remote machine, `E2EEConnection.remoteFetch()` replaces direct `fetch()` calls. It transparently encrypts the request, sends it through the gateway to the daemon, and returns a standard `Response` object:

```typescript
const { connection, connected } = useE2EE();

if (connected) {
  // This goes through the E2EE gateway to the remote machine
  const response = await connection.remoteFetch('/api/tasks', {
    method: 'GET',
  });
  const tasks = await response.json();
}
```

## Troubleshooting

**"VK_GATEWAY_URL is set but no credentials found"**
Run `vibe-kanban login --gateway <url>` to authenticate and generate a master secret.

**"VK_GATEWAY_URL is set but credentials are for a different gateway"**
Run `vibe-kanban login --gateway <url>` again with the correct gateway URL.

**WebUI shows no online machines**
Verify the server is running with `VK_GATEWAY_URL` set and check server logs for bridge connection messages.

**Pairing fails / "Failed to add secret"**
Ensure you're pasting the complete base64 master secret (exactly 44 characters for a 32-byte secret).

**Request timeout (30s)**
Check that the remote `vibe-kanban` server is running and the bridge is connected. Look at server logs for errors.
