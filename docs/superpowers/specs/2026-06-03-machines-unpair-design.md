# Machines Unpair (Local Reset)

**Date:** 2026-06-03
**Status:** Draft

## Problem

In the Home tab, a gateway connection lists its machines. Each machine is either
**paired** (this device holds the machine's master secret in `machineSecrets`) or
**not paired**. The states behave like this today (`HomeTab.tsx` → `MachineNodeView`):

- **Not paired** → clicking the row expands `MachinePairingForm` to enter the secret.
- **Paired** → clicking the row opens the machine's projects tab. The row has **no
  other control**.

Because a paired row has no trailing control, there is **no way to undo a pairing
from the UI**. If a machine was paired with the wrong secret, or the pairing
otherwise can't load (e.g. DEK exchange fails), the row stays "paired" forever and
clicking it just keeps trying to open projects. The user can never get back to the
pairing form to fix it — a dead end.

The store already has an `unpairMachine(machineId)` action
(`connection-store.ts:154`) that deletes the secret from `machineSecrets`, and it
has a unit test, but **no UI ever calls it**.

## Goal

Give paired machines an **Unpair** action that performs a full local reset, returning
the row to the "Not paired" state so it can be re-paired with a corrected secret.
Unpair affects only *this device's* pairing — it does not remove the machine from the
gateway, and it requires no backend changes.

## Solution

### 1. Make `unpairMachine` perform a full local reset

Change the store action signature from `unpairMachine(machineId)` to
`unpairMachine(connectionId, machineId)` and have it tear down all local state for
that pairing, in this order:

1. **Close open tabs** for `(connectionId, machineId)` — the `machine-projects` tab
   and any `project` tabs. Collect the matching tab ids first, then close each by
   calling the existing `closeTab(tabId)` action, so connection `removeRef` and the
   `activeTabId` fallback to `home` are handled by the one code path that already
   does this correctly.
2. **Destroy the live connection** via `machineRegistry.destroy(connectionId, machineId)`
   — disconnects the E2EE WebSocket and drops the `GatewayMachineConnection` object.
3. **Delete the secret** from `machineSecrets` (the existing behaviour).

Order matters: closing tabs first unmounts their components before the underlying
connection is destroyed, so nothing renders against a torn-down connection.

After this runs, `machine.machine_id` is no longer in `machineSecrets`, so
`MachineNodeView` re-renders with `isPaired = false` and the row shows "Not paired"
again. Clicking it re-opens `MachinePairingForm` — the recovery path.

Keeping a single, well-named action (rather than adding a second one) keeps the store
surface small. The machine remains in `gatewayState.machines`; unpairing does not
remove it from the list.

### 2. Add an Unpair control to paired machine rows (`MachineNodeView`)

When `isPaired`, render a trailing kebab (`⋯`, `MoreHorizontal`) menu button at the
end of the row, matching the existing pattern used by `DirectNodeView` and
`GatewayNodeView` in the same file. The menu contains a single destructive item:

- **Unpair** (with `WifiOff` or `Unlink` icon, `text-destructive` styling) →
  calls `unpairMachine(connectionId, machine.machine_id)`.

The kebab button calls `e.stopPropagation()` so clicking it does not trigger the
row's open-projects `handleClick`. The menu opens/closes via local `showMenu` state,
same as the sibling nodes.

No confirmation dialog — this matches the adjacent "Remove" / "Sign out" items
(which also act immediately), and the action is low-risk and reversible: the user
still holds the secret and can re-pair. Unpaired rows are unchanged (no kebab).

## Files to Change

| File | Change |
|------|--------|
| `frontend/src/stores/connection-store.ts` | Change `unpairMachine` signature to `(connectionId, machineId)`; close matching tabs, call `machineRegistry.destroy`, then delete the secret. Update the `ConnectionStoreActions` interface. |
| `frontend/src/components/tabs/HomeTab.tsx` | In `MachineNodeView`, when `isPaired` render a `⋯` menu with a destructive "Unpair" item calling `unpairMachine(connectionId, machine.machine_id)`. |
| `frontend/src/stores/__tests__/connection-store-gateway.test.ts` | Update the existing `unpairMachine` test for the new signature; add a test that open tabs for the machine are closed on unpair. |

## Not Changed

- **Backend / gateway / daemon** — no API endpoint, no DB change. Unpair is purely
  client-side. The device key registered with the gateway is left in place.
- `MachinePairingForm` — already handles the not-paired → paired transition.
- `pairMachine` — unchanged.
- The machines list and `setMachines` / `upsertMachine` / `removeMachine` — unchanged;
  the machine stays listed after unpair.

## Behaviour / Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Unpair a machine with the projects tab open | Tab(s) closed; if active, `activeTabId` falls back to `home`; connection disconnected; row shows "Not paired". |
| Unpair a machine with no open tabs | Connection (if any) destroyed; secret removed; row shows "Not paired". |
| Re-pair after unpair | Row click expands `MachinePairingForm`; entering a valid secret pairs again and reconnects. |
| Same `machine_id` reachable via two gateway connections | Pairing is keyed by `machine_id` globally in `machineSecrets`; unpair removes that secret. Tabs/connections are torn down per `(connectionId, machineId)`. (Matches existing pairing semantics; not made worse by this change.) |
| Machine goes offline while paired | Unchanged from today — `removeMachine` drops it from the list; the secret persists so it re-appears as paired when it returns. |
