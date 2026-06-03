# Machines Unpair (Local Reset) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Unpair" action to paired machines in the Home tab that fully resets the pairing locally (closes tabs, drops the live connection, forgets the secret) so a bad/stuck pairing can be redone.

**Architecture:** Purely client-side. Widen the existing `unpairMachine` store action from `(machineId)` to `(connectionId, machineId)` so it can close the machine's tabs (via the existing `closeTab`) and destroy its live E2EE connection (via `machineRegistry.destroy`) before deleting the master secret from `machineSecrets`. Surface the action through a `⋯` kebab menu on paired machine rows, mirroring the menus already used by `DirectNodeView` / `GatewayNodeView` in the same file. No backend, gateway, or daemon changes.

**Tech Stack:** React + TypeScript, Zustand store, Vitest (jsdom), Tailwind (legacy design tokens), lucide-react icons.

---

## Background (read before starting)

Relevant current code:

- `frontend/src/stores/connection-store.ts`
  - Interface decl: `unpairMachine(machineId: string): void;` (line ~106)
  - Impl (lines ~154-159) — deletes the secret only:
    ```ts
    unpairMachine(machineId) {
      set((s) => {
        const { [machineId]: _removed, ...rest } = s.machineSecrets;
        return { machineSecrets: rest };
      });
    },
    ```
  - `machineRegistry` is already imported at the top: `import * as machineRegistry from '@/services/machine-registry';`
  - `closeTab(tabId)` (lines ~493-528) already handles connection `removeRef` and the `activeTabId` fallback to `'home'`.
- `frontend/src/services/machine-registry.ts` exposes `destroy(connId, machineId)` — disconnects the live `GatewayMachineConnection` and removes it from the map (no-op if absent).
- `frontend/src/components/tabs/HomeTab.tsx`
  - `MachineNodeView` (lines ~305-360) — paired rows currently have NO trailing control.
  - Kebab-menu pattern to copy lives in `GatewayNodeView` (lines ~149-184).
  - Icons `MoreHorizontal` and `WifiOff` are already imported (lines ~3-14).

Key facts that make this safe and simple:
- `HomeTab` does **not** call `unpairMachine` today (only the interface, impl, and one test reference it), so changing the signature in Task 1 does not break `pnpm run check`.
- Test files are excluded from `tsc` (`tsconfig.json` `exclude`), and Vitest uses esbuild (no type-check), so a test calling the new 2-arg form produces a *behavioural* red (wrong result / tab not closed), not a compile error — exactly what we want for TDD.
- `removeRef()` only schedules a 30s delayed disconnect; that is why we still call `machineRegistry.destroy(...)` for an immediate teardown.
- `components/tabs/` is intentionally non-i18n (hardcoded English) — use the literal string `Unpair`, no translation keys.

All commands below run from `frontend/` unless stated otherwise. If `node_modules` is missing in this worktree, run `pnpm i` once first.

---

## Task 1: Widen `unpairMachine` to a full local reset (store + tests)

**Files:**
- Modify: `frontend/src/stores/connection-store.ts` (interface line ~106; impl lines ~154-159)
- Test: `frontend/src/stores/__tests__/connection-store-gateway.test.ts` (existing test lines ~98-105; add one new test after it)

- [ ] **Step 1: Update the existing test and add the tab-closing test (red)**

In `frontend/src/stores/__tests__/connection-store-gateway.test.ts`, replace the existing test (currently lines ~98-105):

```ts
  it('unpairMachine removes from machineSecrets', async () => {
    const { useConnectionStore } = await import('../connection-store');
    useConnectionStore.getState().pairMachine('m-abc', 'secret123');
    useConnectionStore.getState().pairMachine('m-xyz', 'secret456');
    useConnectionStore.getState().unpairMachine('m-abc');
    const { machineSecrets } = useConnectionStore.getState();
    expect(machineSecrets).toEqual({ 'm-xyz': 'secret456' });
  });
```

with this updated version plus a new test:

```ts
  it('unpairMachine removes only that machine secret', async () => {
    const { useConnectionStore } = await import('../connection-store');
    useConnectionStore.getState().pairMachine('m-abc', 'secret123');
    useConnectionStore.getState().pairMachine('m-xyz', 'secret456');
    useConnectionStore.getState().unpairMachine('conn-1', 'm-abc');
    const { machineSecrets } = useConnectionStore.getState();
    expect(machineSecrets).toEqual({ 'm-xyz': 'secret456' });
  });

  it('unpairMachine closes the machine tabs and falls active tab back to home', async () => {
    const { useConnectionStore } = await import('../connection-store');

    useConnectionStore.setState({
      nodes: [
        {
          entry: {
            id: 'gateway-self',
            type: 'gateway',
            url: 'http://gateway.test',
            label: 'Gateway',
          },
          gatewayUrl: 'http://gateway.test',
          gatewayState: {
            session: { sessionToken: 'token', userId: 'user-1' },
            machines: [
              {
                machine_id: 'machine-1',
                hostname: 'devbox',
                platform: 'linux',
                port: 3000,
              },
            ],
            registrationOpen: true,
            authError: null,
            authLoading: false,
          },
        },
      ],
      tabs: [],
      activeTabId: 'home',
      initialized: true,
      machineSecrets: {},
    });

    useConnectionStore.getState().pairMachine('machine-1', 'secret-123');
    useConnectionStore
      .getState()
      .openMachineProjectsTab('gateway-self', 'machine-1', 'devbox');

    expect(useConnectionStore.getState().tabs).toHaveLength(1);
    expect(useConnectionStore.getState().activeTabId).not.toBe('home');

    useConnectionStore.getState().unpairMachine('gateway-self', 'machine-1');

    expect(useConnectionStore.getState().tabs).toHaveLength(0);
    expect(useConnectionStore.getState().activeTabId).toBe('home');
    expect('machine-1' in useConnectionStore.getState().machineSecrets).toBe(
      false
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail (red)**

Run: `pnpm test src/stores/__tests__/connection-store-gateway.test.ts`

Expected: FAIL.
- `unpairMachine removes only that machine secret`: with the old 1-arg impl, `machineId` binds to `'conn-1'`, so `m-abc` is never removed → `machineSecrets` still contains it.
- `unpairMachine closes the machine tabs ...`: old impl never closes tabs → `tabs` length stays `1`.

- [ ] **Step 3: Update the interface signature**

In `frontend/src/stores/connection-store.ts`, change the `ConnectionStoreActions` declaration (line ~106):

```ts
  unpairMachine(machineId: string): void;
```

to:

```ts
  unpairMachine(connectionId: string, machineId: string): void;
```

- [ ] **Step 4: Implement the full local reset**

In the same file, replace the `unpairMachine` implementation (lines ~154-159):

```ts
      unpairMachine(machineId) {
        set((s) => {
          const { [machineId]: _removed, ...rest } = s.machineSecrets;
          return { machineSecrets: rest };
        });
      },
```

with:

```ts
      unpairMachine(connectionId, machineId) {
        // 1. Close any tabs bound to this machine. closeTab handles connection
        //    removeRef and the activeTabId -> 'home' fallback for us.
        const tabIds = get()
          .tabs.filter(
            (t) => t.connectionId === connectionId && t.machineId === machineId
          )
          .map((t) => t.id);
        for (const id of tabIds) get().closeTab(id);

        // 2. Tear down the live E2EE connection immediately (removeRef alone
        //    only schedules a delayed disconnect).
        machineRegistry.destroy(connectionId, machineId);

        // 3. Forget the master secret -> the row reverts to "Not paired".
        set((s) => {
          const { [machineId]: _removed, ...rest } = s.machineSecrets;
          return { machineSecrets: rest };
        });
      },
```

- [ ] **Step 5: Run the tests to verify they pass (green)**

Run: `pnpm test src/stores/__tests__/connection-store-gateway.test.ts`
Expected: PASS (all tests in the file, including the two above).

- [ ] **Step 6: Type-check and lint**

Run: `pnpm run check`
Expected: no errors (no non-test code calls `unpairMachine` yet, so the signature change is isolated).

Run: `pnpm run lint`
Expected: no errors/warnings.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/stores/connection-store.ts frontend/src/stores/__tests__/connection-store-gateway.test.ts
git commit -m "feat(connection-store): unpairMachine performs full local reset"
```

---

## Task 2: Add the Unpair kebab menu to paired machine rows

**Files:**
- Modify: `frontend/src/components/tabs/HomeTab.tsx` (`MachineNodeView`, lines ~305-360)

No new imports are required: `MoreHorizontal` and `WifiOff` are already imported, and `useConnectionStore` is already in use.

- [ ] **Step 1: Replace `MachineNodeView` with the menu-enabled version**

Replace the whole `MachineNodeView` function (lines ~305-360) with:

```tsx
function MachineNodeView({
  machine,
  connectionId,
}: {
  machine: MachineStatus;
  connectionId: string;
}) {
  const { openMachineProjectsTab, unpairMachine } = useConnectionStore();
  const [showPairing, setShowPairing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const isPaired = useConnectionStore(
    (s) => machine.machine_id in s.machineSecrets
  );

  const machineLabel = machine.hostname || machine.machine_id.slice(0, 8);

  const handleClick = () => {
    if (isPaired) {
      openMachineProjectsTab(connectionId, machine.machine_id, machineLabel);
    } else {
      setShowPairing(!showPairing);
    }
  };

  return (
    <div className="border border-border/50 rounded bg-background/50">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={handleClick}
      >
        {isPaired ? (
          <Wifi size={16} className="text-green-500 shrink-0" />
        ) : showPairing ? (
          <ChevronDown size={16} className="shrink-0" />
        ) : (
          <WifiOff size={16} className="text-foreground/30 shrink-0" />
        )}
        <Monitor size={16} className="text-foreground/50 shrink-0" />
        <span className="text-sm flex-1 truncate">
          {machineLabel}
          {machine.port ? `:${machine.port}` : ''}
        </span>
        {!isPaired && (
          <span className="text-sm text-foreground/40">Not paired</span>
        )}
        {isPaired && (
          <div className="relative shrink-0">
            <button
              className="p-1.5 rounded hover:bg-foreground/10"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
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
                    unpairMachine(connectionId, machine.machine_id);
                    setShowMenu(false);
                  }}
                >
                  <WifiOff size={14} /> Unpair
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showPairing && !isPaired && (
        <MachinePairingForm
          connectionId={connectionId}
          machineId={machine.machine_id}
          onPaired={() => setShowPairing(false)}
        />
      )}
    </div>
  );
}
```

What changed vs. the original:
- Added `unpairMachine` to the store destructure and a `showMenu` state.
- When `isPaired`, render a trailing `⋯` (`MoreHorizontal`) kebab button + dropdown with a single destructive **Unpair** item. The button and item both `stopPropagation()` so they don't trigger the row's `handleClick`.
- Unpaired rows are unchanged (no kebab; still show "Not paired" and expand the pairing form).

- [ ] **Step 2: Type-check**

Run: `pnpm run check`
Expected: no errors (`unpairMachine(connectionId, machine.machine_id)` matches the Task 1 signature).

- [ ] **Step 3: Lint**

Run: `pnpm run lint`
Expected: no errors/warnings.

- [ ] **Step 4: Manual verification (gateway mode)**

From repo root, build/serve the gateway frontend or use the existing dev flow, then in the browser:
1. Log in to a gateway connection that lists at least one machine.
2. Pair a machine (green Wifi icon appears).
3. Confirm a `⋯` button now appears at the end of the paired row; click it → **Unpair** item shows.
4. Open the machine's projects tab, then click **Unpair**:
   - the projects tab closes and the active tab returns to Home,
   - the row reverts to the `WifiOff` "Not paired" state,
   - clicking the row again expands the pairing form (re-pair works).

If you cannot run gateway mode in this environment, note that in the task report and rely on the Task 1 store tests + `check`/`lint` as the automated evidence.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/tabs/HomeTab.tsx
git commit -m "feat(home): add Unpair action to paired machine rows"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:**
  - Full local reset (close tabs → destroy connection → delete secret) → Task 1, Step 4.
  - `unpairMachine(connectionId, machineId)` signature → Task 1, Steps 3-4.
  - Kebab `⋯` menu with destructive "Unpair", `stopPropagation`, no confirmation → Task 2, Step 1.
  - Unpaired rows unchanged; machine stays in list → Task 2 (only the `isPaired` branch adds UI; no change to `machines`).
  - Update existing `unpairMachine` test + add tab-closing test → Task 1, Step 1.
  - No backend/gateway/daemon changes → no such tasks (by design).
- **Placeholder scan:** none — every code/step is concrete.
- **Type consistency:** `unpairMachine(connectionId, machineId)` is used identically in the interface (Task 1 Step 3), impl (Step 4), UI call (Task 2 Step 1), and tests (Task 1 Step 1). `machineRegistry.destroy` and `get().closeTab` match existing signatures in `machine-registry.ts` / `connection-store.ts`.
