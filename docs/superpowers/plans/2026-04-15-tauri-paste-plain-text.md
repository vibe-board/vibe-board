# Tauri Plain Text Paste Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Ctrl/Cmd+Shift+V plain text paste in the Tauri desktop app by adding a native application menu bar with an Edit submenu.

**Architecture:** Add a standard macOS/Windows/Linux application menu bar using Tauri v2's `SubmenuBuilder` and `PredefinedMenuItem` APIs. The Edit submenu provides the OS-level responder chain that routes keyboard shortcuts (including Cmd+Shift+V) to the WKWebView/WebKitGTK/WebView2 webview. No frontend changes needed — the existing `PasteMarkdownPlugin` already handles Shift+V correctly once the event reaches JavaScript.

**Tech Stack:** Rust, Tauri v2 (`tauri::menu::SubmenuBuilder`, `tauri::menu::PredefinedMenuItem`)

**Spec:** `docs/superpowers/specs/2026-04-15-tauri-paste-plain-text-design.md`

---

### File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/src/lib.rs` | Modify | Add application menu bar with App + Edit submenus |

This is a single-file change. No new files, no new dependencies, no frontend changes.

---

### Task 1: Add native application menu bar to Tauri app

**Files:**
- Modify: `src-tauri/src/lib.rs` (lines 1-5 imports, lines 11-14 setup closure)

- [ ] **Step 1: Update imports**

Replace the current import block at the top of `src-tauri/src/lib.rs`:

```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
```

With:

```rust
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
```

This adds `PredefinedMenuItem` and `Submenu` to the existing imports.

- [ ] **Step 2: Add application menu bar in setup closure**

In the `setup` closure, **before** the tray icon builder block (before `TrayIconBuilder::new()`), add the application menu bar. The full setup closure should read:

```rust
.setup(|app| {
    // Application menu bar (fixes Cmd+Shift+V on macOS, Ctrl+Shift+V on Linux)
    let app_menu = {
        #[cfg(target_os = "macos")]
        {
            Submenu::with_items(
                app,
                "Vibe Board",
                true,
                &[
                    &PredefinedMenuItem::about(app, None, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::show_all(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?
        }
        #[cfg(not(target_os = "macos"))]
        {
            Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?
        }
    };

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let menu_bar = Menu::with_items(app, &[&app_menu, &edit_menu])?;
    app.set_menu(menu_bar)?;

    // Tray icon (existing code — unchanged)
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    // ... rest of tray icon code remains unchanged ...
```

Note on cross-platform behavior:
- **macOS**: Undo/Redo are supported natively. The "Vibe Board" submenu provides About/Hide/Quit per macOS convention.
- **Windows/Linux**: `undo()` and `redo()` are unsupported by Tauri on these platforms — calling them is safe (they compile and run, just don't render in the menu). Cut/Copy/Paste/SelectAll work on all platforms. The "File" submenu replaces the macOS app menu.

- [ ] **Step 3: Verify it compiles**

Run from the project root:

```bash
cd src-tauri && cargo check
```

Expected: Compiles without errors or warnings.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(tauri): add native Edit menu to fix plain text paste

Add application menu bar with Edit submenu containing standard
Undo/Redo/Cut/Copy/Paste/SelectAll items. On macOS, this
establishes the responder chain needed for WKWebView to receive
Cmd+Shift+V (paste as plain text). Cross-platform: macOS gets
an app-name submenu, Windows/Linux get a File submenu."
```

---

### Task 2: Manual verification

This task is manual — the engineer should test on any available platform.

- [ ] **Step 1: Run the Tauri dev build**

```bash
pnpm tauri dev
```

- [ ] **Step 2: Verify menu bar appears**

- On macOS: "Vibe Board" and "Edit" menus should appear in the system menu bar
- On Windows/Linux: "File" and "Edit" menus should appear in the window title bar area

- [ ] **Step 3: Test plain text paste**

1. Open a webpage with rich text (bold, links, etc.)
2. Select and copy some formatted text (Cmd+C / Ctrl+C)
3. Click into the follow-up input field
4. Press Cmd+Shift+V (macOS) or Ctrl+Shift+V (Windows/Linux)
5. **Expected**: Text is pasted as plain text without formatting
6. Type some more text after the paste
7. **Expected**: New text has no inherited formatting

- [ ] **Step 4: Test normal paste still works**

1. Copy the same formatted text
2. Press Cmd+V / Ctrl+V (normal paste)
3. **Expected**: Text is pasted with markdown conversion (existing behavior)

- [ ] **Step 5: Test standard Edit shortcuts**

Verify these all work in the follow-up input:
- Cmd/Ctrl+A: Select all
- Cmd/Ctrl+C: Copy
- Cmd/Ctrl+X: Cut
- Cmd/Ctrl+V: Paste
- Cmd/Ctrl+Z: Undo (macOS only via native menu)
