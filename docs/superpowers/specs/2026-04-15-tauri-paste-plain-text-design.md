# Tauri: Fix Ctrl/Cmd+Shift+V Plain Text Paste

## Problem

The follow-up input field in the Tauri desktop app does not support Ctrl+Shift+V (Cmd+Shift+V on macOS) for plain text paste. After pasting formatted content, all subsequent typed text inherits the formatting and cannot be cleared.

**Root cause**: The Tauri app (`src-tauri/src/lib.rs`) has no native application menu bar with an Edit submenu. On macOS, WKWebView requires a native Edit menu in the responder chain for Cmd+key shortcuts to be routed to the webview. On Linux (WebKitGTK), the behavior is similar. Without this menu, keyboard shortcuts like Cmd+Shift+V never reach the frontend JavaScript.

**Why it works on web**: In a regular browser, the browser itself provides the Edit menu and responder chain. The Tauri webview does not.

## Solution

Add a standard application menu bar with an Edit submenu to the Tauri app using Tauri v2's `Submenu` and `PredefinedMenuItem` APIs. This is cross-platform — macOS, Windows, and Linux all get the same menu.

## Design

### Changes

**Single file**: `src-tauri/src/lib.rs`

Add an application menu bar in the `setup` closure with:

1. **App submenu** (macOS convention, name = app product name):
   - About (PredefinedMenuItem)
   - Separator
   - Hide (PredefinedMenuItem)
   - Hide Others (PredefinedMenuItem)
   - Show All (PredefinedMenuItem)
   - Separator
   - Quit (PredefinedMenuItem)

2. **Edit submenu**:
   - Undo (Cmd+Z / Ctrl+Z)
   - Redo (Cmd+Shift+Z / Ctrl+Shift+Z)
   - Separator
   - Cut (Cmd+X / Ctrl+X)
   - Copy (Cmd+C / Ctrl+C)
   - Paste (Cmd+V / Ctrl+V)
   - Select All (Cmd+A / Ctrl+A)

All items are `PredefinedMenuItem` — Tauri handles shortcut binding and platform adaptation automatically.

Set the menu on the app via `app.set_menu(menu)`.

### What stays the same

- **Frontend paste plugin** (`paste-markdown-plugin.tsx`): No changes needed. Once the webview receives keyboard events, the existing `shiftHeldRef` logic handles Cmd+Shift+V correctly by calling `selection.insertRawText(plainText)`.
- **Tray icon menu**: Stays as-is (Quit/Show Window). The tray menu is separate from the app menu bar.
- **Dependencies**: No new crates needed. `tauri::menu::Submenu` and `tauri::menu::PredefinedMenuItem` are already available in `tauri = "2"`.
- **Permissions**: No changes to `capabilities/default.json`.

### How it fixes the problem

1. macOS: Native Edit menu establishes the responder chain → WKWebView receives Cmd+Shift+V → browser fires a ClipboardEvent with plain text → Lexical's PASTE_COMMAND fires → `PasteMarkdownPlugin` detects `shiftHeldRef = true` → `selection.insertRawText(plainText)` inserts clean text.
2. Linux: WebKitGTK gets the same benefit from having an Edit menu for keyboard shortcut routing.
3. Windows: WebView2 already routes shortcuts, but the Edit menu provides a consistent UX across platforms.

## Out of scope

- No frontend code changes
- No new Tauri plugins or permissions
- No changes to the WYSIWYG editor behavior
