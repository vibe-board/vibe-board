# gateway web homepage + pairing cleanup

## Problem

Opening the e2ee-gateway in a browser today shows the Tauri desktop home: a
"Connections" list with a `+ Add` button and the empty state
"No connections configured. Click \"+ Add\" to get started."

That UI belongs to the Tauri desktop build, where the user manages many
direct/gateway connections. In the gateway-web build there is exactly **one**
connection (this gateway, same-origin), so the connection-management UX is
wrong — it asks the user to add what's already implicit.

A related cleanup falls out at the same time: the `MachineNodeView` pair flow
issues `PUT /api/e2ee/credentials` against the same origin. That endpoint only
exists on the local-direct `crates/server` backend. In gateway-web mode it
404s; in tauri it has nothing to hit. The endpoint itself is redundant with
the `vibe-board login` CLI command, which writes the credentials file and
relies on `BridgeManager`'s file watcher. The whole HTTP route is dead.

## Goals

1. Gateway-web (`VITE_APP_MODE=gateway`) renders a gateway-specific shell:
   - Not signed in → full-screen login card. No tab bar.
   - Signed in → tab bar + machine list (no `+ Add`, no Direct connections,
     no per-connection management). Click a machine to open it as a tab.
2. Multi-tab navigation between machines preserved (consistent with Tauri
   shell ergonomics; Ctrl+1..9 / Ctrl+W still work).
3. Tauri (default) and local-direct unchanged in appearance.
4. Frontend pairing flow stops calling `PUT /api/e2ee/credentials`. The HTTP
   endpoint and its sibling routes are removed. CLI `login` / `logout` /
   `status` remain the canonical credential surface.

## Non-goals

- Removing `gateway_credentials` from `ImportConfigDialog` /
  `ExportConfigDialog`. Those import/export routes write the credentials file
  directly (no HTTP route involved) and serve a backup/restore use case.
- Removing `ConnectionSetupDialog.tsx` (legacy, orthogonal).
- Logout-time clearing of `vb_e2ee_machine_secrets` (potential leak across
  user sessions on shared browsers — listed as follow-up).
- Vite dev proxy for gateway development. Listed as a known dev caveat.

## Context

### Three frontend modes

| mode (`VITE_APP_MODE`) | served by | local backend? | current shell |
|---|---|---|---|
| `local-direct` (web) | `crates/server` (same origin) | ✅ same origin | `LocalDirectShell` ✅ |
| `gateway` (web) | `crates/e2ee-gateway` (same origin) | ❌ none | falls through to `MultiConnectionShell` ❌ |
| (unset, tauri) | bundled in tauri (no server) | ❌ none | `MultiConnectionShell` ✅ |

Mode detection lives in `frontend/src/lib/isLocalDirect.ts:1`, which only
handles `local-direct`. Gateway falls through, hence the bug.

### Browser-side E2EE

`frontend/src/lib/e2ee/manager.ts` is the singleton `E2EEManager`. It stores
`machineId → base64 master secret` in `localStorage` under
`vb_e2ee_machine_secrets`, derives content keypairs on demand, and unwraps
DEKs entirely in the browser. Any frontend mode that wants to talk to a
remote machine through a gateway needs the secret in `localStorage` for that
machine.

### `/api/e2ee/credentials` is local-server-only

`crates/server/src/routes/e2ee.rs` exposes:

- `PUT /e2ee/{credentials,gateways}` → `put_gateway` → `e2ee_config::add_or_update_gateway` + `BridgeManager::start_gateway`
- `DELETE /e2ee/gateways` → `delete_gateway`
- `DELETE /e2ee/credentials` → `delete_all_credentials`
- `GET /e2ee/status` → `get_status`

These call into helpers that **also** back the CLI:

- `crates/server/src/main.rs:99-101` `cmd_login` writes via
  `e2ee_config::add_or_update_gateway`.
- `crates/server/src/main.rs:385-396` `cmd_logout` removes via
  `e2ee_config::remove_gateway` / `delete_credentials`.
- `crates/server/src/main.rs:359-...` `cmd_status` reads
  `e2ee_config::load_credentials` directly.
- `crates/server/src/main.rs:221-224` `BridgeManager::start_credentials_watcher`
  reacts to file changes regardless of who wrote them (CLI or HTTP).

So the HTTP endpoint is a redundant convenience layer over the file +
watcher path. Removing it leaves `cmd_login` / `cmd_logout` / `cmd_status` as
the single supported surface, which is what the comment at
`crates/server/src/main.rs:221` already implies as the intended workflow
("e.g., from CLI login while server is running").

The only frontend caller of the endpoint is one block in
`HomeTab.tsx:373-388`, inside the inline pair flow.

## Design

### §1 — Mode detection layer (`frontend/src/lib/appMode.ts`, new)

```ts
type AppMode = 'local-direct' | 'gateway' | 'tauri';

export const appMode: AppMode = (() => {
  const m = import.meta.env.VITE_APP_MODE;
  if (m === 'local-direct') return 'local-direct';
  if (m === 'gateway') return 'gateway';
  return 'tauri';
})();

export const isLocalDirect = appMode === 'local-direct';
export const isGateway = appMode === 'gateway';
export const isTauri = appMode === 'tauri';
```

Keep `frontend/src/lib/isLocalDirect.ts` as a thin re-export to avoid mass
rename:

```ts
export { isLocalDirect } from './appMode';
```

Existing callers (`TabShell.tsx`, `ActiveConnectionBridge.tsx`) keep their
`isLocalDirect` import unchanged.

### §2 — `TabShell` three-way dispatch (`frontend/src/components/tabs/TabShell.tsx`)

```tsx
import { isLocalDirect, isGateway } from '@/lib/appMode';
import { LocalDirectShell } from './LocalDirectShell';
import { GatewayShell } from './GatewayShell';
import { MultiConnectionShell } from './MultiConnectionShell';

export function TabShell() {
  if (isLocalDirect) return <LocalDirectShell />;
  if (isGateway) return <GatewayShell />;
  return <MultiConnectionShell />;
}
```

### §3 — `GatewayShell` (`frontend/src/components/tabs/GatewayShell.tsx`, new)

Owns auto-bootstrap of the same-origin gateway connection and the
login-vs-tabs split.

```tsx
export function GatewayShell() {
  const { initialized, init, tabs, activeTabId, closeTab, setActiveTab } =
    useConnectionStore();

  useEffect(() => { init(); }, [init]);

  // Same Ctrl+1..9 / Ctrl+W key handler as MultiConnectionShell.
  // (Lift the handler out into a shared hook `useTabHotkeys()` if convenient;
  // duplication is also acceptable — these two shells diverge from here on.)

  // Subscribe to the seeded gateway-self GatewayNode.
  const gwNode = useConnectionStore((s) =>
    s.nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)?.gatewayNode
  );
  const [, force] = useState(0);
  useEffect(() => {
    if (!gwNode) return;
    return gwNode.onChange(() => force((t) => t + 1));
  }, [gwNode]);

  if (!initialized || !gwNode) return <LoadingScreen />;

  if (!gwNode.session) {
    return <GatewayLoginScreen gwNode={gwNode} />;
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <TabBar />
      <div className="flex-1 overflow-hidden">
        <div className={`h-full overflow-auto ${activeTabId === 'home' ? '' : 'hidden'}`}>
          <GatewayHomeTab gwNode={gwNode} />
        </div>
        {tabs.map((tab) => (
          <div key={tab.id} className={`h-full overflow-hidden ${activeTabId === tab.id ? '' : 'hidden'}`}>
            {tab.type === 'machine-projects' ? <MachineProjectsTab tab={tab} /> : <ProjectTab tab={tab} />}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### §4 — `GatewayLoginScreen` (`frontend/src/components/tabs/GatewayLoginScreen.tsx`, new)

Full-screen centered card. Email/password, optional "Sign up" toggle gated by
`gwNode.registrationOpen`. Submits via existing
`connection-store.loginConnection / signupConnection`. Reads
`gwNode.authError` / `gwNode.authLoading` for state. No tab bar — the login
screen is the entire shell while not signed in.

Width `max-w-sm`. Heading: "Vibe Board" + "Sign in to continue" /
"Create an account". Gateway URL not displayed (same-origin is implicit).

### §5 — Connection-store seeding (`frontend/src/stores/connection-store.ts`)

Add a constant + `init()` enhancement + `removeConnection` guard.

```ts
import { isGateway } from '@/lib/appMode';

export const GATEWAY_SELF_ID = 'gateway-self';

init() {
  if (get().initialized) return;
  runMigrationIfNeeded();

  let entries = loadConnections();

  if (isGateway) {
    const sameOrigin = window.location.origin;
    const existing = entries.find((e) => e.id === GATEWAY_SELF_ID);
    if (!existing) {
      // Seed in memory. Do NOT saveConnections — leaving localStorage alone
      // means switching back to tauri mode preserves the user's other entries.
      entries = [
        { id: GATEWAY_SELF_ID, type: 'gateway', url: sameOrigin, label: 'Gateway' },
      ];
    } else {
      // Same-origin URL may have shifted (port/scheme change). Rewrite in memory.
      entries = entries
        .filter((e) => e.id === GATEWAY_SELF_ID)
        .map((e) => ({ ...e, url: sameOrigin }));
    }
  }

  // ...rest of init unchanged: build nodes, load tabs, set initialized.
}

removeConnection(id) {
  if (isGateway && id === GATEWAY_SELF_ID) return; // cannot remove the seeded gateway
  // ...rest unchanged
}

logoutConnection(id) {
  // existing logic
  if (isGateway && id === GATEWAY_SELF_ID) {
    // close all machine tabs to avoid stale views
    const tabs = get().tabs.filter((t) => t.connectionId !== id);
    saveTabs(tabs);
    set({ tabs, activeTabId: 'home' });
  }
}
```

The deliberate non-write to `vb_connections` in gateway mode is documented
inline. Switching back to tauri mode shows the user's previous connections
intact.

### §6 — `GatewayHomeTab` + extracted `MachinePairingForm`

`frontend/src/components/tabs/GatewayHomeTab.tsx` (new) renders:

- Header: `Machines` title + `Sign out` button on the right (calls
  `logoutConnection(GATEWAY_SELF_ID)`).
- Body: `gwNode.machines` mapped to `MachineRow`. Each row shows
  `Wifi`/`WifiOff` icon, hostname (or short id), `port`, "Not paired" tag.
- Click paired → `openMachineProjectsTab(GATEWAY_SELF_ID, machine_id, label)`.
- Click unpaired → expand inline `<MachinePairingForm>`.
- Empty state: centered "No machines online" hint.
- No `+ Add`. No Direct/Gateway distinction. No `Remove`.

`frontend/src/components/tabs/MachinePairingForm.tsx` (new) — extracted from
the existing `MachineNodeView` in `HomeTab.tsx:315-447`. Logic:

```tsx
const handlePair = async () => {
  // 1. Browser-derive auth keypair from base64 master secret
  const secretBytes = Uint8Array.from(atob(trimmed), (c) => c.charCodeAt(0));
  const authKp = await deriveAuthKeyPair(secretBytes);
  const pubKeyB64 = btoa(String.fromCharCode(...authKp.publicKey));

  // 2. Register this WebUI as a device under the user's account on the gateway
  const regResp = await fetch(`${gwNode.gatewayUrl}/api/auth/device/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.sessionToken}`,
    },
    body: JSON.stringify({ public_key: pubKeyB64, device_name: 'WebUI' }),
  });
  if (!regResp.ok && regResp.status !== 409) {
    throw new Error(`Device registration failed (${regResp.status}): ${await regResp.text()}`);
  }

  // 3. Persist secret in browser localStorage so E2EEManager can derive
  //    content keypairs and unwrap DEKs for this machine.
  pairMachine(gwNode.connectionId, machineId, trimmed);
};
```

Notes:
- No `fetch('/api/e2ee/credentials')`. Three-mode pairing is identical and
  symmetric: device-register on gateway + localStorage write.
- `HomeTab.tsx` (Tauri) replaces its inline pairing block with
  `<MachinePairingForm>`, deleting `HomeTab.tsx:373-388`.

### §7 — Backend route deletion

Delete `crates/server/src/routes/e2ee.rs` (the file).

Update `crates/server/src/routes/mod.rs`:

- Remove line 15: `pub mod e2ee;`
- Remove line 60: `.merge(e2ee::router())`

Delete `BridgeManager::is_gateway_running` at
`crates/server/src/e2ee_manager.rs:99-104` — its only caller was the deleted
`get_status` route.

Verify nothing else references the deleted symbols (`cargo check
--workspace`, `cargo clippy --workspace --all-targets --features qa-mode --
-D warnings`).

What stays:

- `crates/server/src/e2ee_config.rs` — used by `cmd_login` /
  `cmd_logout` / `cmd_status`.
- `crates/server/src/e2ee_manager.rs::BridgeManager` — `start_gateway`,
  `stop_gateway`, `stop_all`, `start_credentials_watcher`,
  `seed_file_hash`. All used by `cmd_server` startup + the credentials file
  watcher.
- `crates/server/src/routes/config_transfer.rs` — `gateway_credentials`
  import/export path writes the credentials file directly and triggers the
  watcher; orthogonal to the deleted HTTP routes.

## Edge cases

- **Cross-mode `localStorage` hygiene** — gateway mode reads existing
  `vb_connections` but does not write back. Switching back to tauri restores
  the user's previous connections.
- **`vb_gateway_session_gateway-self`** — preserved across page reloads;
  re-bound to whatever the current `window.location.origin` is. Origin
  changes (HTTP↔HTTPS, port changes) keep the session, since gateway-web
  is conceptually a single-instance app pinned to that origin.
- **Sign out tab cleanup** — closes all machine tabs to avoid `MachineProjectsTab`
  rendering "Connection not found" against a still-mounted but now-stale
  gateway node.
- **Tauri tab residue** — switching from gateway to tauri may surface tabs
  whose `connectionId === 'gateway-self'`. `MachineProjectsTab`'s existing
  fallback ("Connection not found") handles this gracefully; the user can
  close the tab.
- **Old frontend hitting deleted routes** — any pre-update build calling
  `PUT /api/e2ee/credentials` gets a 404 from the local server. This is a
  breaking change with no in-tree caller after this PR. Documented.

## Testing matrix

| scenario | local-direct | gateway web | tauri | how to verify |
|---|---|---|---|---|
| First load (cold) | auto-connect, App | full-screen LoginScreen | MultiConnectionShell empty | DOM assertion |
| Reload while signed in | App | tab bar + GatewayHomeTab | restored connections | localStorage persistence |
| Sign out | n/a | LoginScreen + tabs cleared | per-connection sign out | `logoutConnection` unit test |
| Pair a machine | localStorage write only | localStorage write only | localStorage write only | unit test + manual |
| Stale `vb_connections` from another mode | n/a | seeded entry only, others ignored | unaffected | manual localStorage seed |

Rust:
- `cargo check --workspace` — must pass
- `cargo test --workspace` — must pass
- `cargo clippy --workspace --all-targets --features qa-mode -- -D warnings` —
  must pass after `is_gateway_running` removal

Frontend:
- `pnpm run frontend:check` — TypeScript clean
- `pnpm run frontend:lint` — ESLint clean
- Optional: a Vitest test for connection-store seeding under
  `isGateway = true`

Manual end-to-end:
- `pnpm run gateway:build` then `cargo run --bin e2ee-gateway` and visit the
  gateway URL. Verify login screen appears, sign in, machine list renders,
  pair a machine via the inline form, open the machine, projects load.
- On a separate machine: `vibe-board login --gateway <URL>` still works
  end-to-end; bridge starts; the just-logged-in machine appears in the
  gateway-web machine list.

## Migration notes

- Users who happened to add the same-origin gateway as a `gateway`-type
  connection in a prior build: their old connection ID won't match
  `gateway-self`. `init()` ignores it; the seeded entry takes over. They
  re-login (one-time).
- `MachinePairingForm` is extracted from the existing pair flow with no
  behavior change for already-paired machines.

## Dev caveats (not addressed in this design)

- `pnpm run gateway:dev` does not start the Vite dev server, so there is
  no HMR for gateway-mode UI changes during development. Workaround: run
  `VITE_APP_MODE=gateway pnpm run frontend:dev` separately and proxy `/api`,
  `/ws` to the gateway port via `vite.config.ts`. A proper dev script can
  land in a follow-up PR.

## Follow-ups

- Remove `gateway_credentials` import/export from frontend dialogs and
  backend `config_transfer` if/when the team decides credential transfer
  must go through CLI only. Independent of this work.
- On `logoutConnection`, consider purging entries from
  `vb_e2ee_machine_secrets` that belong to the logged-out user, to reduce
  cross-account leak risk on shared browsers.
- Vite dev proxy script for gateway mode (see Dev caveats).
