// App shortcuts, running window detection, and quick switcher/launcher.

use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::process::Command;
use crate::win_user;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppShortcutItem {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub exe_stem: String,
    pub is_open: bool,
    pub hwnd: Option<isize>,
    pub window_title: Option<String>,
}

struct AppDef {
    id: &'static str,
    name: &'static str,
    icon: &'static str,
    exe_stem: &'static str,
    keywords: &'static [&'static str],
    launch_cmd: &'static str,
    launch_args: &'static [&'static str],
}

const APPS: &[AppDef] = &[
    AppDef {
        id: "app_spotify",
        name: "Spotify",
        icon: "spotify",
        exe_stem: "spotify",
        keywords: &["spotify"],
        launch_cmd: "cmd",
        launch_args: &["/C", "start", "spotify:"],
    },
    AppDef {
        id: "app_chrome",
        name: "Chrome",
        icon: "chrome",
        exe_stem: "chrome",
        keywords: &["google chrome", "chrome"],
        launch_cmd: "cmd",
        launch_args: &["/C", "start", "chrome"],
    },
    AppDef {
        id: "app_vscode",
        name: "VS Code",
        icon: "code",
        exe_stem: "code",
        keywords: &["visual studio code", " - visual studio code", " - code"],
        launch_cmd: "cmd",
        launch_args: &["/C", "start", "code"],
    },
    AppDef {
        id: "app_terminal",
        name: "Terminal",
        icon: "terminal",
        exe_stem: "wt",
        keywords: &["terminal", "powershell", "cmd.exe", "developer command prompt"],
        launch_cmd: "cmd",
        launch_args: &["/C", "start", "wt"],
    },
    AppDef {
        id: "app_discord",
        name: "Discord",
        icon: "discord",
        exe_stem: "discord",
        keywords: &["discord"],
        launch_cmd: "cmd",
        launch_args: &["/C", "start", "discord:"],
    },
    AppDef {
        id: "app_notion",
        name: "Notion",
        icon: "notion",
        exe_stem: "notion",
        keywords: &["notion"],
        launch_cmd: "cmd",
        launch_args: &["/C", "start", "notion:"],
    },
    AppDef {
        id: "app_edge",
        name: "Edge",
        icon: "globe",
        exe_stem: "msedge",
        keywords: &["microsoft edge", "edge"],
        launch_cmd: "cmd",
        launch_args: &["/C", "start", "microsoft-edge:"],
    },
    AppDef {
        id: "app_explorer",
        name: "Explorer",
        icon: "folder",
        exe_stem: "explorer",
        keywords: &["file explorer", "explorador de arquivos", "explorer"],
        launch_cmd: "explorer",
        launch_args: &[],
    },
];

/// Scans running windows and returns shortcut definitions updated with live open/focus state.
pub fn list_shortcuts() -> Vec<AppShortcutItem> {
    let open_windows = win_user::enum_open_windows();

    APPS.iter()
        .map(|def| {
            let mut is_open = false;
            let mut matched_hwnd = None;
            let mut matched_title = None;

            for win in &open_windows {
                let lower = win.title.to_lowercase();
                if def.keywords.iter().any(|kw| lower.contains(kw)) {
                    is_open = true;
                    matched_hwnd = Some(win.hwnd);
                    matched_title = Some(win.title.clone());
                    break;
                }
            }

            AppShortcutItem {
                id: def.id.to_string(),
                name: def.name.to_string(),
                icon: def.icon.to_string(),
                exe_stem: def.exe_stem.to_string(),
                is_open,
                hwnd: matched_hwnd,
                window_title: matched_title,
            }
        })
        .collect()
}

/// If the app has an open window, brings it to the foreground. Otherwise, launches the app.
pub fn launch_or_focus(app_id: &str) -> bool {
    let shortcuts = list_shortcuts();
    if let Some(target) = shortcuts.into_iter().find(|s| s.id == app_id) {
        if let Some(hwnd) = target.hwnd {
            if win_user::focus_or_restore_hwnd(hwnd) {
                return true;
            }
        }
    }

    // Fall back to launching the executable / command
    if let Some(def) = APPS.iter().find(|a| a.id == app_id) {
        let mut cmd = Command::new(def.launch_cmd);
        cmd.args(def.launch_args);
        cmd.creation_flags(CREATE_NO_WINDOW);
        return cmd.spawn().is_ok();
    }

    false
}
