# Gateway Home — Unpair Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reachable "Unpair" action to paired machine rows in browser gateway mode (`GatewayHomeTab`), with a confirmation dialog that optionally clears the device's cached conversation data, so a machine paired with a wrong/stale secret can be reset and re-paired.

**Architecture:** Pure frontend. The store action `unpairMachine(connectionId, machineId)` already performs the full local reset (close tabs → `machineRegistry.destroy` → delete secret) and is already unit-tested — it is reused as-is, not modified. We add (1) a new NiceModal dialog `UnpairMachineDialog` modelled on `ConfirmDialog` with a checkbox, and (2) a kebab (`⋯`) menu on paired rows in `GatewayHomeTab.tsx` that shows the dialog and then calls `unpairMachine` plus, optionally, `clearAllCachedEntries()`.

**Tech Stack:** React + TypeScript, Zustand (`connection-store`), `@ebay/nice-modal-react` (via `defineModal` in `lib/modals.ts`), Tailwind (legacy design tokens), lucide-react icons, Vitest + `@testing-library/react`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `frontend/src/components/dialogs/UnpairMachineDialog.tsx` (new) | Confirmation modal with a "clear cached data" checkbox; resolves `{ confirmed, clearCache }`. |
| `frontend/src/components/dialogs/index.ts` (modify) | Barrel-export the new dialog + its prop/result types. |
| `frontend/src/components/tabs/GatewayHomeTab.tsx` (modify) | Add a kebab menu with an "Unpair" item to paired `MachineRow`s; wire it to the dialog + store action + optional cache clear. |
| `frontend/src/components/tabs/__tests__/GatewayHomeTab.test.tsx` (new) | Component test: kebab shows only when paired; clicking Unpair (confirmed) calls `unpairMachine`. |

**Not changed:** `connection-store.ts` (`unpairMachine` already complete + tested), backend/gateway/daemon, `MachinePairingForm`, `HomeTab.tsx` (desktop sibling).

---

## Task 1: Create the UnpairMachineDialog

**Files:**
- Create: `frontend/src/components/dialogs/UnpairMachineDialog.tsx`
- Modify: `frontend/src/components/dialogs/index.ts`

This dialog follows the exact NiceModal pattern of `ConfirmDialog.tsx` (`NiceModal.create` + `defineModal`), but resolves a structured object so the caller learns both whether the user confirmed and whether they ticked "clear cache". `defineModal` passes the component object straight to `NiceModal.show`, so **no registration in `types/modals.ts` is needed** (that file only types modals invoked by string id).

- [ ] **Step 1: Write the dialog component**

Create `frontend/src/components/dialogs/UnpairMachineDialog.tsx`:

```tsx
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { AlertTriangle } from 'lucide-react';
import { defineModal } from '@/lib/modals';

export interface UnpairMachineDialogProps {
  hostname: string;
}

export interface UnpairMachineResult {
  confirmed: boolean;
  clearCache: boolean;
}

const UnpairMachineDialogImpl = NiceModal.create<UnpairMachineDialogProps>(
  ({ hostname }) => {
    const modal = useModal();
    const [clearCache, setClearCache] = useState(false);

    const handleConfirm = () => {
      modal.resolve({ confirmed: true, clearCache } as UnpairMachineResult);
    };

    const handleCancel = () => {
      modal.resolve({ confirmed: false, clearCache: false } as UnpairMachineResult);
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleCancel}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <DialogTitle>Unpair machine</DialogTitle>
            </div>
            <DialogDescription className="text-left pt-2">
              This removes this device's pairing with{' '}
              <span className="font-medium">{hostname}</span>. You can pair it
              again afterwards with a fresh master secret. The machine itself and
              other devices are not affected.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 py-1">
            <Checkbox
              id="unpair-clear-cache"
              checked={clearCache}
              onCheckedChange={setClearCache}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="unpair-clear-cache" className="text-sm">
                Also clear cached conversation data on this device
              </Label>
              <p className="text-xs text-muted-foreground">
                Clears cached conversations for all machines on this device, not
                just this one.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirm}>
              Unpair
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const UnpairMachineDialog = defineModal<
  UnpairMachineDialogProps,
  UnpairMachineResult
>(UnpairMachineDialogImpl);
```

- [ ] **Step 2: Barrel-export the dialog**

In `frontend/src/components/dialogs/index.ts`, add to the "Shared/Generic dialogs" section (after the `ConfirmDialog` export near line 94):

```ts
export {
  UnpairMachineDialog,
  type UnpairMachineDialogProps,
  type UnpairMachineResult,
} from './UnpairMachineDialog';
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && pnpm run check`
Expected: PASS (no type errors). If `node_modules` is missing, run `pnpm i` first.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dialogs/UnpairMachineDialog.tsx frontend/src/components/dialogs/index.ts
git commit -m "feat(dialogs): add UnpairMachineDialog with optional cache-clear"
```

---

## Task 2: Add the Unpair kebab menu to paired machine rows

**Files:**
- Modify: `frontend/src/components/tabs/GatewayHomeTab.tsx`

The current `MachineRow` (`GatewayHomeTab.tsx:64-120`) renders no control on paired rows. We add a kebab (`⋯`) menu — matching the dropdown pattern already used in `HomeTab.tsx` (`MoreHorizontal` button + absolute-positioned menu + `showMenu` state) — that opens `UnpairMachineDialog`, then calls `unpairMachine` and optionally `clearAllCachedEntries()`. The kebab renders **only when `isPaired`**. Text is hardcoded English (no i18n), consistent with this subtree.

- [ ] **Step 1: Update imports**

In `frontend/src/components/tabs/GatewayHomeTab.tsx`, replace the lucide-react import block (currently lines 3-10) with:

```tsx
import {
  ChevronDown,
  LogOut,
  Wifi,
  WifiOff,
  Monitor,
  AlertCircle,
  MoreHorizontal,
} from 'lucide-react';
```

Then add these imports below the existing import of `MachinePairingForm` (after line 12):

```tsx
import { UnpairMachineDialog } from '@/components/dialogs';
import { clearAllCachedEntries } from '@/utils/conversationCache';
```

- [ ] **Step 2: Add unpair handler + menu state to `MachineRow`**

In `MachineRow`, the current body starts (around line 71):

```tsx
  const isPaired = useConnectionStore(
    (s) => machine.machine_id in s.machineSecrets
  );
  const openMachineProjectsTab = useConnectionStore(
    (s) => s.openMachineProjectsTab
  );
  const [showPair, setShowPair] = useState(false);
  const label = machine.hostname || machine.machine_id.slice(0, 8);
```

Replace that block with (adds the `unpairMachine` selector, a `showMenu` state, and a `handleUnpair` callback):

```tsx
  const isPaired = useConnectionStore(
    (s) => machine.machine_id in s.machineSecrets
  );
  const openMachineProjectsTab = useConnectionStore(
    (s) => s.openMachineProjectsTab
  );
  const unpairMachine = useConnectionStore((s) => s.unpairMachine);
  const [showPair, setShowPair] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const label = machine.hostname || machine.machine_id.slice(0, 8);

  const handleUnpair = async () => {
    setShowMenu(false);
    const result = await UnpairMachineDialog.show({ hostname: label });
    if (!result.confirmed) return;
    unpairMachine(connectionId, machine.machine_id);
    if (result.clearCache) {
      await clearAllCachedEntries();
    }
  };
```

- [ ] **Step 3: Render the kebab menu on paired rows**

In `MachineRow`'s returned JSX, the not-paired badge currently reads (around lines 106-108):

```tsx
        {!isPaired && (
          <span className="text-xs text-foreground/40">Not paired</span>
        )}
```

Immediately AFTER that block (still inside the `flex items-center` row `div`, before its closing `</div>`), insert the paired-only kebab menu:

```tsx
        {isPaired && (
          <div className="relative shrink-0">
            <button
              aria-label="Machine actions"
              className="p-1.5 rounded hover:bg-foreground/10"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu((v) => !v);
              }}
            >
              <MoreHorizontal size={16} className="text-foreground/50" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded shadow-lg z-10 py-1 min-w-[140px]">
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnpair();
                  }}
                >
                  <WifiOff size={14} /> Unpair
                </button>
              </div>
            )}
          </div>
        )}
```

Note: `WifiOff` and `MoreHorizontal` are both imported in Step 1. The `e.stopPropagation()` on both the kebab button and the menu item prevents the row's `handleClick` (open projects) from firing.

- [ ] **Step 4: Type-check and lint**

Run: `cd frontend && pnpm run check && pnpm run lint`
Expected: PASS. (If `node_modules` is missing, run `pnpm i` first.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/tabs/GatewayHomeTab.tsx
git commit -m "feat(machines): add Unpair menu to GatewayHomeTab paired rows"
```

---

## Task 3: Component test for MachineRow unpair behaviour

**Files:**
- Create: `frontend/src/components/tabs/__tests__/GatewayHomeTab.test.tsx`

Verify the two behaviours that matter: (a) the kebab appears only on paired rows, and (b) confirming the dialog calls `unpairMachine` with the right args. We mock the dialog (so no real modal render) and the store.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/tabs/__tests__/GatewayHomeTab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { MachineStatus } from '@/lib/e2ee';

// --- Mocks (declared before importing the component) ---

const unpairMachine = vi.fn();
const openMachineProjectsTab = vi.fn();
const logoutConnection = vi.fn();

// Minimal store mock: machine-1 is paired, machine-2 is not.
const pairedSecrets: Record<string, string> = { 'machine-1': 'secret' };
const machines: MachineStatus[] = [
  { machine_id: 'machine-1', hostname: 'devbox', platform: 'linux', port: 3000 },
  { machine_id: 'machine-2', hostname: 'laptop', platform: 'mac', port: 0 },
];

type Selector<T> = (s: unknown) => T;
const state = {
  nodes: [
    {
      entry: { id: 'gateway-self' },
      gatewayState: { machines },
    },
  ],
  machineSecrets: pairedSecrets,
  unpairMachine,
  openMachineProjectsTab,
  logoutConnection,
};

vi.mock('@/stores/connection-store', () => ({
  useConnectionStore: <T,>(selector: Selector<T>) => selector(state),
}));

vi.mock('@/utils/conversationCache', () => ({
  clearAllCachedEntries: vi.fn(() => Promise.resolve()),
}));

const showDialog = vi.fn(() =>
  Promise.resolve({ confirmed: true, clearCache: false })
);
vi.mock('@/components/dialogs', () => ({
  UnpairMachineDialog: { show: (...args: unknown[]) => showDialog(...args) },
}));

// MachinePairingForm renders nothing in this test
vi.mock('../MachinePairingForm', () => ({
  MachinePairingForm: () => null,
}));

import { GatewayHomeTab } from '../GatewayHomeTab';

describe('GatewayHomeTab MachineRow unpair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the kebab menu only for paired machines', () => {
    render(<GatewayHomeTab connectionId="gateway-self" />);
    // Exactly one paired machine (machine-1) → exactly one kebab.
    const kebabs = screen.getAllByRole('button', { name: 'Machine actions' });
    expect(kebabs).toHaveLength(1);
    fireEvent.click(kebabs[0]);
    expect(screen.getByText('Unpair')).toBeInTheDocument();
  });

  it('calls unpairMachine when the dialog is confirmed', async () => {
    render(<GatewayHomeTab connectionId="gateway-self" />);
    const kebab = screen.getByRole('button', { name: 'Machine actions' });
    fireEvent.click(kebab);
    fireEvent.click(screen.getByText('Unpair'));

    await waitFor(() => {
      expect(showDialog).toHaveBeenCalledWith({ hostname: 'devbox' });
      expect(unpairMachine).toHaveBeenCalledWith('gateway-self', 'machine-1');
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `cd frontend && pnpm exec vitest run src/components/tabs/__tests__/GatewayHomeTab.test.tsx`
Expected: PASS (2 passed). The component already has the behaviour from Task 2, so this is a regression guard rather than red-first TDD — if it fails, the failure pinpoints a wiring bug in Task 2 (e.g. dialog args or store call).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tabs/__tests__/GatewayHomeTab.test.tsx
git commit -m "test(machines): cover GatewayHomeTab unpair menu wiring"
```

---

## Task 4: Full verification

- [ ] **Step 1: Run the full frontend check suite**

Run: `cd frontend && pnpm run check && pnpm run lint && pnpm exec vitest run src/stores/__tests__/connection-store-gateway.test.ts src/components/tabs/__tests__/GatewayHomeTab.test.tsx`
Expected: type-check passes, lint passes, both test files pass (existing `unpairMachine` store tests still green; new component tests green).

- [ ] **Step 2: Manual verification (browser gateway mode)**

Prerequisite: a running gateway with at least one online machine.

1. Run the gateway-web frontend (`pnpm run dev` with gateway mode, or the project's gateway dev command) and open it in a browser.
2. Log in; the "Machines" list (`GatewayHomeTab`) appears.
3. Pair a machine (paste its master secret). The row shows the green `Wifi` icon.
4. Confirm a `⋯` kebab now appears at the end of the paired row. An unpaired row has no kebab.
5. Click `⋯` → **Unpair** → the confirmation dialog appears with the machine's hostname and an unticked "clear cached conversation data" checkbox.
6. Click **Unpair** in the dialog. The row reverts to "Not paired" (`WifiOff`); any open tab for that machine closes; active tab falls back to home.
7. Click the now-unpaired row → `MachinePairingForm` expands → paste the correct secret → it pairs and connects.
8. Repeat steps 5-6 with the checkbox ticked; confirm no errors (cached conversation data is cleared).

- [ ] **Step 3: Final confirmation**

Confirm all checkboxes above are complete and the working tree is committed (`git status` clean).

---

## Self-Review Notes

- **Spec coverage:** Kebab on paired rows (Task 2) ✓; confirmation dialog with optional cache checkbox (Task 1) ✓; execute `unpairMachine` + optional `clearAllCachedEntries` (Task 2) ✓; hardcoded English (Task 2) ✓; no backend/store changes (reuses existing `unpairMachine`) ✓; recovery via `MachinePairingForm` (manual verify step 7) ✓.
- **Type consistency:** `UnpairMachineResult { confirmed, clearCache }` defined in Task 1 and consumed identically in Task 2's `handleUnpair`. `UnpairMachineDialog.show({ hostname })` matches `UnpairMachineDialogProps`. `unpairMachine(connectionId, machineId)` matches the existing store signature (`connection-store.ts:155`).
- **No placeholders:** all steps contain complete code/commands.
- **Checkbox API:** `onCheckedChange: (checked: boolean) => void` — `setClearCache` accepts a boolean, matches the primitive (`checkbox.tsx:8`).
