# Multi-Tab Machine Selection Isolation

## Problem

When a user opens multiple browser tabs to the same gateway, each selecting a different machine, the pages abnormally refresh in a loop and other tabs' machine parameters can get overwritten.

### Root Cause

`vk_gateway_selected_machine` is stored in `localStorage`, which is **shared across all tabs** on the same origin. When Tab A selects Machine-1 and Tab B selects Machine-2, they overwrite each other's selection in the same key.

The auto-connect logic on startup (`GatewayContext.tsx:142-169`) reads `loadSelectedMachine()` from localStorage. When a tab reconnects (after visibility change, network blip, or sync error retry), it reads the now-wrong machine ID written by another tab. This triggers:
1. Phase transitions (`machine_select` -> `connecting`)
2. New WebSocket connections and DEK exchanges
3. State cascade causing re-renders
4. The other tab's reconnect logic then reads the overwritten value again
5. Resulting in a refresh loop between tabs

## Solution: Hybrid sessionStorage + localStorage

### Storage Layout

| Key | Storage Type | Purpose |
|-----|-------------|---------|
| `vk_gateway_session` | localStorage | Login credentials, shared across tabs (correct, unchanged) |
| `vk_gateway_selected_machine` | **sessionStorage** | Current tab's active machine selection, fully isolated per tab |
| `vk_gateway_last_machine` | localStorage | Hint for new tabs: last machine any tab connected to |

### Lifecycle

1. **User selects a machine** in any tab:
   - Write machine ID to `sessionStorage` (current tab only)
   - Write machine ID to `localStorage` as `vk_gateway_last_machine` (shared hint)

2. **Tab refresh** (same tab):
   - `sessionStorage` persists across refresh within the same tab
   - Reads own `sessionStorage` -> finds the machine -> auto-connects
   - Other tabs' selections are untouched

3. **New tab opened**:
   - `sessionStorage` is empty (new tab = new session storage)
   - Falls back to reading `localStorage` `vk_gateway_last_machine` as auto-connect candidate
   - Writes the chosen machine into its own `sessionStorage`
   - Does not affect any other tab

4. **Other tab switches machine**:
   - Only updates `localStorage` `vk_gateway_last_machine`
   - Existing tabs only read `sessionStorage`, so they are unaffected

### Code Changes

All changes are in `frontend/src/contexts/GatewayContext.tsx`:

1. **`saveSelectedMachine(machineId)`**: Write to `sessionStorage` + update `localStorage` last-machine hint
2. **`loadSelectedMachine()`**: Read from `sessionStorage` first; if empty (new tab), fall back to `localStorage` last-machine hint and copy into `sessionStorage`
3. **`clearSelectedMachine()`**: Clear `sessionStorage` key (do not clear the shared hint)

No backend changes required. No changes to E2EE connection, DEK exchange, or WebSocket handling.

## Testing

- Open Tab A, select Machine-1 -> confirm connected
- Open Tab B, select Machine-2 -> confirm connected, Tab A still on Machine-1
- Refresh Tab A -> auto-connects to Machine-1 (not Machine-2)
- Refresh Tab B -> auto-connects to Machine-2 (not Machine-1)
- Open Tab C (fresh) -> auto-selects whichever machine was last selected by any tab
- Tab B disconnects Machine-2, selects Machine-3 -> Tab A still on Machine-1
