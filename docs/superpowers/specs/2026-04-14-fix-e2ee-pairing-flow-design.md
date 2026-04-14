# Fix E2EE Pairing Flow in Home Tab

**Date:** 2026-04-14
**Status:** Draft

## Problem

When a user adds a gateway connection in the Home tab, logs in, and sees machines online, expanding a machine shows "Loading projects..." which then disappears with no data and a "DEK exchange timeout" error. The root cause is that the MachineNodeView's `handlePair` only stores the master secret in localStorage (`E2EEManager.pairMachine`) but skips two critical steps:

1. **Device registration** — `POST /api/auth/device/register` with the derived auth public key
2. **Backend credentials notification** — `PUT /api/e2ee/credentials` to push the secret to the local daemon

Without these steps, the daemon doesn't have the correct secret key to unwrap the DEK, causing the `dek_exchange` to silently fail on the bridge side and the frontend to time out after 10 seconds.

Additionally, the `E2EESettingsDialog` (in settings page) has the complete pairing flow but has never been used — the user is not guided to it from the Home tab.

## Solution

### 1. Complete the pairing flow in MachineNodeView

Replace the current `handlePair` (localStorage-only) with the full 3-step flow from `E2EESettingsDialog.doPairSecret`:

1. Derive auth keypair from secret bytes via `deriveAuthKeyPair(secretBytes)`
2. Call `POST {gatewayUrl}/api/auth/device/register` with the base64-encoded auth public key and `device_name: 'WebUI'`
3. Call `PUT /api/e2ee/credentials` with `{ master_secret, gateway_url, session_token, user_id }`
4. Call `pairMachine(connectionId, machineId, base64Secret)` to store in localStorage

Show a loading spinner during the async operation. Show errors inline below the input.

After successful pairing, the component re-renders with `isPaired = true`, triggering the useEffect to connect and load projects.

### 2. Allow re-pairing on DEK errors

When `loadError` contains "DEK exchange timeout" or "unwrap DEK" or "No content public key", show a "Re-pair" button next to the error message. Clicking it calls `unpairMachine(connectionId, machineId)` which resets `isPaired` to `false`, showing the secret input again.

### 3. Improve pairing UX

- Input placeholder: `"Paste master secret from bridge terminal (base64)"`
- Help text below input: `"Run the bridge on your machine and copy the master secret from its terminal output."`
- Show a loading state ("Registering device...") during the async pairing operation
- Disable the Pair button while pairing is in progress

### 4. Delete E2EESettingsDialog

Remove `frontend/src/components/dialogs/E2EESettingsDialog.tsx` and all references to it:
- Remove from dialog registry / exports in `frontend/src/components/dialogs/index.ts`
- Remove from settings page (`frontend/src/pages/settings/GeneralSettings.tsx`)
- Remove `useE2ee` hook usage that was exclusively for this dialog (keep the hook if used elsewhere)

## Files to Change

| File | Change |
|------|--------|
| `frontend/src/components/tabs/HomeTab.tsx` | Rewrite `handlePair` with full device registration + credentials flow. Add re-pair button on DEK errors. Add help text. |
| `frontend/src/components/dialogs/E2EESettingsDialog.tsx` | Delete |
| `frontend/src/components/dialogs/index.ts` | Remove E2EESettingsDialog export |
| `frontend/src/pages/settings/GeneralSettings.tsx` | Remove E2EESettingsDialog trigger button |
| `frontend/src/i18n/locales/*/settings.json` | Remove E2EE settings translations (optional, low priority) |

## Not Changed

- `GatewayNode`, `GatewayMachineConnection`, `E2EEConnection`, `E2EEManager` — no changes needed
- `GatewayLoginForm` — already works correctly in HomeTab
- Bridge/gateway/daemon Rust code — no changes needed
- `startMachineListWs` — already works correctly

## Error Scenarios

| Scenario | Behavior |
|----------|----------|
| Invalid base64 secret | `pairMachine` throws "Master secret must be 32 bytes" — shown inline |
| Device registration fails (403/500) | Show server error message inline |
| Backend credentials PUT fails | Show error inline; local pair not saved, user can retry |
| DEK exchange timeout after pairing | Show error + "Re-pair" button so user can enter correct secret |
| Bridge not running | DEK exchange timeout — same as above |
