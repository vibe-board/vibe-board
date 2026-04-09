# Multi-Tab Machine Selection Isolation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix cross-tab interference where multiple browser tabs on the same gateway overwrite each other's machine selection via shared localStorage.

**Architecture:** Replace the single `localStorage` key `vk_gateway_selected_machine` with a hybrid approach: `sessionStorage` for per-tab isolation of the active machine, plus a `localStorage` hint (`vk_gateway_last_machine`) that new tabs read once on first load.

**Tech Stack:** React, TypeScript, browser Storage APIs

---

### Task 1: Switch machine selection storage to hybrid sessionStorage + localStorage

**Files:**
- Modify: `frontend/src/contexts/GatewayContext.tsx:60-91` (storage constants and helper functions)

- [ ] **Step 1: Add the new localStorage hint key constant**

In `frontend/src/contexts/GatewayContext.tsx`, after line 61, add the new constant:

```typescript
const SELECTED_MACHINE_KEY = 'vk_gateway_selected_machine';
const LAST_MACHINE_HINT_KEY = 'vk_gateway_last_machine';
```

- [ ] **Step 2: Rewrite `loadSelectedMachine` to use sessionStorage with localStorage fallback**

Replace the existing `loadSelectedMachine` function (lines 81-83) with:

```typescript
function loadSelectedMachine(): string | null {
  // Per-tab: check sessionStorage first (survives refresh, isolated per tab)
  const perTab = sessionStorage.getItem(SELECTED_MACHINE_KEY);
  if (perTab) return perTab;
  // New tab: fall back to shared hint from any previous tab
  const hint = localStorage.getItem(LAST_MACHINE_HINT_KEY);
  if (hint) {
    // Adopt into this tab's own sessionStorage so future reads stay local
    sessionStorage.setItem(SELECTED_MACHINE_KEY, hint);
  }
  return hint;
}
```

- [ ] **Step 3: Rewrite `saveSelectedMachine` to write both storages**

Replace the existing `saveSelectedMachine` function (lines 85-87) with:

```typescript
function saveSelectedMachine(machineId: string): void {
  sessionStorage.setItem(SELECTED_MACHINE_KEY, machineId);
  localStorage.setItem(LAST_MACHINE_HINT_KEY, machineId);
}
```

- [ ] **Step 4: Rewrite `clearSelectedMachine` to clear sessionStorage only**

Replace the existing `clearSelectedMachine` function (lines 89-91) with:

```typescript
function clearSelectedMachine(): void {
  sessionStorage.removeItem(SELECTED_MACHINE_KEY);
  // Do not clear LAST_MACHINE_HINT_KEY — it's a shared hint for new tabs
}
```

- [ ] **Step 5: Clean up the old localStorage key on load**

In `loadSelectedMachine`, after the sessionStorage check, add migration logic so the old key doesn't leave stale data. The full function becomes:

```typescript
function loadSelectedMachine(): string | null {
  // Per-tab: check sessionStorage first (survives refresh, isolated per tab)
  const perTab = sessionStorage.getItem(SELECTED_MACHINE_KEY);
  if (perTab) return perTab;
  // Migrate: if old localStorage key exists, treat it as the hint
  const legacy = localStorage.getItem(SELECTED_MACHINE_KEY);
  if (legacy) {
    localStorage.setItem(LAST_MACHINE_HINT_KEY, legacy);
    localStorage.removeItem(SELECTED_MACHINE_KEY);
  }
  // New tab: fall back to shared hint from any previous tab
  const hint = localStorage.getItem(LAST_MACHINE_HINT_KEY);
  if (hint) {
    sessionStorage.setItem(SELECTED_MACHINE_KEY, hint);
  }
  return hint;
}
```

- [ ] **Step 6: Verify type-check passes**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/contexts/GatewayContext.tsx
git commit -m "fix: isolate per-tab machine selection with sessionStorage

Switch vk_gateway_selected_machine from localStorage (shared across all
tabs) to sessionStorage (per-tab). Add vk_gateway_last_machine as a
shared localStorage hint so new tabs auto-select the last-used machine.

Migrates the old localStorage key on first read."
```

### Task 2: Manual verification

- [ ] **Step 1: Start the dev server**

Run: `pnpm run dev`

- [ ] **Step 2: Test multi-tab isolation**

1. Open Tab A, connect to a gateway, select Machine-1 → confirm connected
2. Open Tab B (same gateway), select Machine-2 → confirm connected; confirm Tab A still shows Machine-1
3. Refresh Tab A → should auto-connect to Machine-1 (not Machine-2)
4. Refresh Tab B → should auto-connect to Machine-2 (not Machine-1)
5. Open Tab C (fresh tab) → should auto-select whichever machine was last selected by any tab (the hint)
6. In Tab B, disconnect Machine-2, select Machine-3 → Tab A should remain on Machine-1

- [ ] **Step 3: Check browser storage in DevTools**

1. In Tab A: Application → Session Storage → `vk_gateway_selected_machine` should show Machine-1's ID
2. In Tab B: Application → Session Storage → `vk_gateway_selected_machine` should show Machine-2's ID
3. Application → Local Storage → `vk_gateway_last_machine` should show whichever machine was selected most recently
4. Application → Local Storage → `vk_gateway_selected_machine` should NOT exist (migrated away)
