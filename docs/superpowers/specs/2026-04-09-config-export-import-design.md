# Config Export/Import Design

## Problem

Users with vibe-board installed on multiple machines have no way to sync configuration between them. They must manually copy JSON files across machines, which is error-prone and tedious.

## Goal

Add a config export/import feature in the Settings UI that lets users export all configuration to a single JSON file and selectively import it on another machine.

## Scope

Four configuration categories:

| Category | Storage | Source |
|---|---|---|
| General Settings | `config.json` (v10 schema) | Backend file |
| Agent Profiles | `profiles.json` | Backend file |
| Gateway Credentials | `e2ee_credentials.json` | Backend file |
| UI Preferences | Zustand store (`useUiPreferencesStore`) | Frontend in-memory |

## Export File Format

Single JSON file named `vibe-board-config-YYYY-MM-DD.json`:

```json
{
  "export_version": 1,
  "exported_at": "2026-04-09T12:00:00Z",
  "source_app_version": "0.x.x",
  "sections": {
    "config": { },
    "profiles": { },
    "gateway_credentials": { },
    "ui_preferences": { }
  }
}
```

- `export_version` enables future format migrations.
- Each section contains the raw content of its source (config.json content, profiles.json content, etc.).
- `config` section preserves `config_version` so the existing config migration logic handles version differences on import.
- `ui_preferences` contains only the data fields from the Zustand `State` type (lines 268-302 of `useUiPreferencesStore.ts`), not the action methods. Specifically: `repoActions`, `expanded`, `contextBarPosition`, `paneSizes`, `collapsedPaths`, `fileSearchRepoId`, `layoutMode`, `isLeftSidebarVisible`, `isRightSidebarVisible`, `isTerminalVisible`, `workspacePanelStates`, `kanbanProjectViewSelections`, `kanbanProjectViewPreferences`, `workspaceFilters`, `kanbanViewMode`, `listViewStatusFilter`. The transient field `previewRefreshKey` is excluded.
- Sensitive data (API keys, tokens, master_secret) is included as-is. The user is responsible for file security.

## Backend API

### `GET /api/config/export`

Reads `config.json`, `profiles.json`, and `e2ee_credentials.json` from the asset directory. Returns the export envelope JSON (without `ui_preferences` — that section is added by the frontend).

Response:
```json
{
  "export_version": 1,
  "exported_at": "...",
  "source_app_version": "...",
  "sections": {
    "config": { ... },
    "profiles": { ... },
    "gateway_credentials": { ... }
  }
}
```

If `e2ee_credentials.json` does not exist, the `gateway_credentials` section is omitted.

### `POST /api/config/import`

Accepts a partial export envelope. Only sections present in the request body are written.

Request body:
```json
{
  "sections": {
    "config": { ... },
    "profiles": { ... }
  }
}
```

Behavior per section:
- `config` — Validates as a Config object, writes to `config.json`. The existing config migration system handles version differences.
- `profiles` — Writes to `profiles.json`.
- `gateway_credentials` — Writes to `e2ee_credentials.json`. The existing file watcher (`BridgeManager`) detects the change and automatically reconnects bridges.

Response:
```json
{
  "results": {
    "config": "ok",
    "profiles": "ok"
  }
}
```

Each section reports `"ok"` or `"error"` with a message. Sections are written independently — one failure does not block others.

`ui_preferences` is never sent to the backend. The frontend handles it directly via `useUiPreferencesStore.setState()`.

## Frontend UX

### Entry Point

A new **"Configuration Transfer"** card in `GeneralSettings.tsx`, placed between the "Safety" section and the "About" section. Contains two buttons: **Export** and **Import**.

### Export Dialog

```
┌─────────────────────────────────────┐
│  Export Configuration               │
├─────────────────────────────────────┤
│                                     │
│  Select what to export:             │
│                                     │
│  ☑ General Settings                 │
│    Theme, language, editor, git...  │
│                                     │
│  ☑ Agent Profiles                   │
│    Executor configs, MCP servers    │
│                                     │
│  ☑ Gateway Credentials              │
│    E2EE connection credentials      │
│                                     │
│  ☑ UI Preferences                   │
│    Layout, panel states, filters    │
│                                     │
├─────────────────────────────────────┤
│              [Cancel]  [Export]      │
└─────────────────────────────────────┘
```

- All checkboxes default to **checked**.
- Export button disabled if nothing is selected.
- Gateway Credentials checkbox only shown if `e2ee_credentials.json` exists (i.e., the backend export response includes that section).
- On click: fetches `GET /api/config/export`, reads UI preferences from Zustand store, assembles the full export JSON keeping only selected sections, triggers browser file download.

### Import Dialog

```
┌─────────────────────────────────────┐
│  Import Configuration               │
├─────────────────────────────────────┤
│                                     │
│  [Select file...]                   │
│  ✓ vibe-board-config-2026-04-09.json│
│                                     │
│  Select what to import:             │
│                                     │
│  ☑ General Settings                 │
│  ☑ Agent Profiles                   │
│  ☐ Gateway Credentials              │
│  ☑ UI Preferences                   │
│                                     │
│  ⚠ This will overwrite your current │
│    settings for selected sections.  │
│                                     │
├─────────────────────────────────────┤
│              [Cancel]  [Import]     │
└─────────────────────────────────────┘
```

- File picker accepts `.json` files only.
- After file selection, parse JSON and validate `export_version`.
- Only show checkboxes for sections that exist in the file.
- All sections default to **checked** except **Gateway Credentials** which defaults to **unchecked**.
- Import button disabled if nothing is selected or no file chosen.
- Overwrite warning is always visible once a file is selected.
- On click:
  1. Send selected backend sections to `POST /api/config/import`.
  2. If `ui_preferences` is selected, call `useUiPreferencesStore.setState(importedPreferences)`.
  3. Call `reloadSystem()` to refresh frontend state from backend.
  4. Show success/error alert.

### Validation

- Reject files where `export_version` is higher than what this app version supports (future-proofing).
- Reject files that fail JSON parsing.
- Per-section backend errors are reported individually without blocking other sections.

## Reload After Import

No page reload or app restart is needed. Each category has a live reload path:

| Category | Reload mechanism |
|---|---|
| config | `reloadSystem()` → invalidates React Query `user-system` key → refetch `/api/info` |
| profiles | Same as config — both come from the `user-system` query |
| gateway_credentials | `BridgeManager` file watcher (500ms debounce) detects change → `sync_with_credentials()` reconnects bridges automatically |
| ui_preferences | `useUiPreferencesStore.setState()` → Zustand notifies all subscribed components → re-render |

## Multi-Machine Gateway Safety

Two machines sharing the same `e2ee_credentials.json` (same `master_secret`, `session_token`, `user_id`) is safe:
- Each machine generates a unique `machine_id` from `hash(hostname + username + port)`.
- Both machines register as separate entries in the gateway's `machines` table.
- The shared `master_secret` derives the same Ed25519 keypair → same `device_key`, which is fine — gateway allows multiple machine connections per device key.
- No conflicts or errors occur.

## Files to Create/Modify

### Backend (Rust)
- `crates/server/src/routes/config_transfer.rs` — New module with export/import handlers.
- `crates/server/src/routes/mod.rs` — Register new routes.
- `crates/server/src/main.rs` or router setup — Mount `/api/config/export` and `/api/config/import`.

### Frontend (TypeScript/React)
- `frontend/src/components/dialogs/settings/ExportConfigDialog.tsx` — Export dialog with section checkboxes.
- `frontend/src/components/dialogs/settings/ImportConfigDialog.tsx` — Import dialog with file picker and section checkboxes.
- `frontend/src/pages/settings/GeneralSettings.tsx` — Add "Configuration Transfer" card.
- `frontend/src/lib/api.ts` — Add `exportConfig()` and `importConfig()` API functions.

### Shared Types
- `crates/server/src/bin/generate_types.rs` — Add export/import types if needed for TypeScript generation.
