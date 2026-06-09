# Gateway Home — Unpair Machine (browser gateway mode)

**Date:** 2026-06-10
**Status:** Draft

## Problem

In **browser gateway mode** (`appMode === 'gateway'`), the app renders
`main.tsx → TabShell → GatewayShell → GatewayHomeTab → MachineRow`. The machine
list (header "Machines") is `GatewayHomeTab.tsx`.

Looking at the live `MachineRow` (`GatewayHomeTab.tsx:64-120`):

- **Paired** machine (this device holds the machine's master secret in
  `machineSecrets`) → clicking the row opens the machine's projects tab. The row
  has **no other control** — no menu, no unpair.
- **Not paired** machine → clicking the row expands `MachinePairingForm` to enter
  the secret.

`MachinePairingForm` only renders while **not paired**. So once a machine has a
stored secret (shows as "paired"), there is **no UI path to remove or replace that
secret**. If the machine was paired with a wrong/stale secret, the content keypair
derived from it is wrong, the DEK exchange is rejected by the bridge and times out
after 10s (`connection.ts:205`), and the connection never establishes. The row
still shows "paired", clicking it just retries opening projects, and the user can
never get back to the pairing form. This is the reported symptom: the machine is
**visible and reachable from other devices, but one browser can't connect and the
bad local data can't be cleared.**

### Why the existing Unpair didn't help

A prior change (`89bfa982f feat(machines): add Unpair action with full local
reset`, spec `2026-06-03-machines-unpair-design.md`) added an Unpair kebab menu —
but only to **`HomeTab.tsx → MachineNodeView`**, which is the *multi-connection
desktop shell* (`MultiConnectionShell`), **not** `GatewayHomeTab`. Browser gateway
mode renders `GatewayHomeTab`, which was left untouched. So the button exists in
the codebase but never renders for browser users. The two are parallel machine-row
implementations backed by the same store.

The store already exposes `unpairMachine(connectionId, machineId)`
(`connection-store.ts:155`), which is thorough: it closes the machine's tabs,
calls `machineRegistry.destroy` (disconnects the E2EE WebSocket, drops the
per-machine `GatewayMachineConnection` and its `QueryClient`), and deletes the
secret from `machineSecrets`. **The only thing missing in browser gateway mode is a
control that calls it.**

## Goal

Give paired machine rows in `GatewayHomeTab` an **Unpair** action that performs a
full local reset and returns the row to "Not paired", so it can be re-paired with a
corrected secret. Offer an **optional** "also clear cached conversation data"
checkbox for users who suspect stale cached content. Purely client-side — no
backend, gateway, daemon, or DB changes. The machine remains registered on the
gateway and listed for other devices.

## Solution

### 1. Add an Unpair control to paired rows in `GatewayHomeTab`

In `MachineRow` (`GatewayHomeTab.tsx`), when `isPaired`, render a trailing kebab
(`⋯`, `MoreHorizontal`) menu button, matching the existing pattern used by
`DirectNodeView` / `GatewayNodeView` in `HomeTab.tsx` and `MachineNodeView` (the
desktop sibling): absolute-positioned dropdown, `showMenu` local state, a single
destructive item.

- Menu item: **Unpair** (`WifiOff` icon, `text-destructive` styling).
- The kebab button calls `e.stopPropagation()` so it does not trigger the row's
  open-projects `handleClick`.
- **Only paired rows** get the kebab. Not-paired rows are unchanged (clicking still
  expands `MachinePairingForm`). This is sufficient because the broken-machine case
  *is* a stored secret, so the machine shows as paired and the menu appears.
- Text is hardcoded English (no i18n), consistent with the rest of the
  `GatewayHomeTab` subtree ("Machines", "Sign out", "Not paired", "No machines
  online").

### 2. Confirmation dialog with optional cache clear

Clicking **Unpair** opens a confirmation dialog before acting. The shared
`ConfirmDialog` has no checkbox support, so add a small dedicated modal
`UnpairMachineDialog.tsx` following the same NiceModal `defineModal` pattern and
visual structure as `ConfirmDialog` (destructive variant, `AlertTriangle` icon,
Cancel / Unpair buttons).

Contents:
- Title: **"Unpair machine"**.
- Message: explains this removes this device's pairing with the machine
  (`{hostname}`), after which it can be paired again with a fresh secret; it does
  not affect the machine or other devices.
- Checkbox (default **unchecked**): **"Also clear cached conversation data on this
  device"**, with a sub-note that this clears cached conversations for **all**
  machines on this device (the cache is keyed by attempt/process, not by machine).
  Use the existing `Checkbox` primitive (`@/components/ui/checkbox`) + `Label`
  (`@/components/ui/label`); local `useState` holds the checked value.
- Resolves `{ confirmed: boolean; clearCache: boolean }`.

### 3. Execute on confirm

In `MachineRow`'s handler:

1. `await UnpairMachineDialog.show({ hostname })` (or equivalent NiceModal call).
2. If not confirmed → do nothing.
3. `unpairMachine(connectionId, machine.machine_id)` (existing store action — full
   local reset).
4. If `clearCache` → `await clearAllCachedEntries()` from
   `@/utils/conversationCache`.

After step 3 the secret is gone, so `MachineRow` re-renders with `isPaired = false`
→ shows "Not paired" → clicking expands `MachinePairingForm` → paste the correct
secret → re-pair → connect. Recovery path restored.

## Files to Change

| File | Change |
|------|--------|
| `frontend/src/components/tabs/GatewayHomeTab.tsx` | In `MachineRow`, when `isPaired` render a `⋯` menu with a destructive "Unpair" item; on click show `UnpairMachineDialog`, then call `unpairMachine(connectionId, machine.machine_id)` and optionally `clearAllCachedEntries()`. Add `showMenu` state and `e.stopPropagation()` on the kebab. |
| `frontend/src/components/dialogs/UnpairMachineDialog.tsx` (new) | NiceModal dialog (`defineModal`) modelled on `ConfirmDialog`, destructive variant, with a "clear cached conversation data" checkbox. Resolves `{ confirmed, clearCache }`. Takes `{ hostname }` props for the message. Invoked via `UnpairMachineDialog.show({ hostname })` — `defineModal` (`lib/modals.ts`) passes the component object directly to `NiceModal.show`, so **no string-key registration in `types/modals.ts` is required** (that file only types modals invoked by string id). |

## Not Changed

- **Backend / gateway / daemon** — no API endpoint, no DB change. The device key
  registered with the gateway is left in place; the machine stays listed for this
  and other devices.
- **`connection-store.unpairMachine`** — already performs the full local reset
  (close tabs → `machineRegistry.destroy` → delete secret). Reused as-is.
- **`HomeTab.tsx` / `MachineNodeView`** — the desktop shell already has its own
  Unpair from the prior change; not touched here. (Behaviour diverges slightly:
  desktop has no confirm dialog / cache option. Acceptable — browser is the
  reported environment. A future pass could unify them.)
- **`MachinePairingForm`**, **`pairMachine`**, the machines list
  (`setMachines`/`upsertMachine`/`removeMachine`) — unchanged.
- **`keyPairCache`** in `pairing.ts` — keyed by base64 secret; once the secret is
  removed it is simply never looked up again. Harmless, not cleared.
- **Per-machine IndexedDB scoping** — `conversationCache` is keyed by
  `attemptId + processId`, not by machine, so it cannot be cleared per-machine;
  the optional checkbox clears all of it via `clearAllCachedEntries()`, with a note
  in the dialog. Default off so good machines aren't disturbed.

## Behaviour / Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Unpair a machine with its projects tab open | `unpairMachine` closes the tab(s); if active, `activeTabId` falls back to `home`; connection disconnected; row shows "Not paired". |
| Unpair a machine with no open tabs | Connection (if any) destroyed; secret removed; row shows "Not paired". |
| Re-pair after unpair | Row click expands `MachinePairingForm`; entering a valid secret pairs again and reconnects. This is the fix for the wrong-secret machine. |
| Confirm with "clear cache" checked | After unpair, `clearAllCachedEntries()` wipes the IndexedDB conversation cache for all machines on this device. |
| Cancel the dialog | No state changes; row stays paired. |
| Machine offline while paired | Unchanged — `removeMachine` drops it from the list when it goes offline; the secret persists so it reappears as paired when back. Note: the kebab is only reachable while the machine is listed (online). Matches the reported case (machine *is* visible). |

## Verification

- `pnpm run check` (frontend type check) and `pnpm run lint` pass.
- Manual: in browser gateway mode, a paired machine row shows a `⋯` menu; Unpair
  opens the confirm dialog; confirming returns the row to "Not paired" and re-pairing
  with a correct secret connects successfully.
- Existing `connection-store-gateway.test.ts` `unpairMachine` tests still pass
  (action signature/behaviour unchanged).
