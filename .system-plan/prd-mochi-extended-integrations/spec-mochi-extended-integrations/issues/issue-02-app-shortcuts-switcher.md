# Issue: App Shortcuts & Window Switcher Tab

## 1. Traceability
- **Parent Spec:** `/.system-plan/prd-mochi-extended-integrations/spec-mochi-extended-integrations/spec.md`
- **Issue Number:** #02
- **Issue Type:** Window Manager Service & UI App Grid

## 2. Task Description
Implement a dedicated "Apps" tab in the Island header that provides instant access to key user applications (Spotify, Chrome, VS Code, Discord, Terminal, etc.). Detects whether an app's window is already open or closed. If open, clicking immediately activates and brings the window to the foreground (`SetForegroundWindow` / `ShowWindow`). If closed, clicking launches the app executable cleanly in the background.

## 3. The Sandbox (MANDATORY FILE LIMITS)
### Files to Create:
- `windows/src-tauri/src/apps.rs`: Rust module enumerating top-level windows (`EnumWindows`), checking processes, bringing windows to focus, and launching executables.
- `windows/src/views/apps.ts`: UI grid rendering app icons, running status indicator dots, and click handlers.

### Files to Modify:
- `windows/src-tauri/src/lib.rs`: Register Tauri commands for app listing and focus/launching.
- `windows/src-tauri/src/win_user.rs`: Add `focus_or_restore_hwnd(hwnd: isize)` and window enumeration helper.
- `windows/src/core/state.ts`: Add `AppShortcutItem` interface and state collection.
- `windows/src/views/icons.ts`: Add apps grid icon (`grid`/`apps`).

## 4. Required Imports & Reusability
- Import `h`, `svg`, `dot`, `clear` from `windows/src/views/dom.ts`
- Import `ICONS` from `windows/src/views/icons.ts`
- Import `card`, `btn`, `stack`, `ViewHost`, `ViewActions` from `windows/src/views/views.ts`
- Import `AppShortcutItem` from `windows/src/core/state.ts`

## 5. Step-by-Step Execution Plan
- [ ] **Step 1:** Implement Win32 window helper in `windows/src-tauri/src/win_user.rs` to bring any HWND to the foreground using `SetForegroundWindow` and `ShowWindow(SW_RESTORE)`.
- [ ] **Step 2:** Write `windows/src-tauri/src/apps.rs` to detect running windows matching common application names and paths, falling back to executable launch (`ShellExecuteW`).
- [ ] **Step 3:** Expose Tauri commands: `list_app_shortcuts`, `launch_or_focus_app`.
- [ ] **Step 4:** Implement `windows/src/views/apps.ts` with a 4-column responsive app tile grid, glowing dots for open windows, and hover animations.
- [ ] **Step 5:** Wire header navigation to the new "apps" view.

## 6. Definition of Done (Acceptance Criteria)
- [ ] Clicking an open app switches to it immediately without minimizing other windows.
- [ ] Clicking a closed app launches it without flashing console windows.
- [ ] NO files outside the Sandbox section were modified.
- [ ] Thin Client / Fat Server pattern maintained: Win32 window management lives in Rust.
- [ ] Keyboard navigation and accessibility respected.
