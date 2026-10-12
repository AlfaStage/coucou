// App shortcuts: every app installed on the PC, plus the windows already open.
//
// Installed apps come from the Start Menu (.lnk files), the same list Windows
// search uses. Open windows are matched to an app by the executable that owns
// them, not by guessing from the title. The user pins what they want on the
// island; everything else is one search away.

use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::win_user::{self, OpenWindowInfo};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const SCAN_TTL: Duration = Duration::from_secs(120);

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppShortcutItem {
    /// Lower-case app name; stable across launches and what `pinned_apps` stores.
    pub id: String,
    pub name: String,
    /// Key into the island's icon set, or "apps" for the generic tile.
    pub icon: String,
    pub is_open: bool,
    pub pinned: bool,
    pub hwnd: Option<isize>,
    pub window_title: Option<String>,
}

#[derive(Clone)]
struct Installed {
    name: String,
    target: PathBuf,
}

static CACHE: Mutex<Option<(Instant, Vec<Installed>)>> = Mutex::new(None);

/// Shown pinned the very first time, when the app exists on this PC.
pub const DEFAULT_PINS: &[&str] = &[
    "google chrome", "microsoft edge", "visual studio code", "windows terminal",
    "spotify", "discord", "notion", "explorador de arquivos",
];

fn start_menu_roots() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(pd) = std::env::var_os("ProgramData") {
        v.push(PathBuf::from(pd).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    if let Some(ad) = std::env::var_os("APPDATA") {
        v.push(PathBuf::from(ad).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    v
}

fn scan_dir(dir: &Path, depth: u8, out: &mut Vec<Installed>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            if depth < 3 {
                scan_dir(&p, depth + 1, out);
            }
        } else if p.extension().map(|x| x.eq_ignore_ascii_case("lnk")).unwrap_or(false) {
            let name = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
            let lower = name.to_lowercase();
            // Uninstallers, help pages and docs aren't apps people launch.
            let noise = ["uninstall", "desinstal", "readme", "license", "documenta", "help", "ajuda", "manual"];
            if !name.is_empty() && !noise.iter().any(|n| lower.contains(n)) {
                out.push(Installed { name, target: p });
            }
        }
    }
}

fn installed() -> Vec<Installed> {
    let mut guard = CACHE.lock().unwrap();
    if let Some((at, list)) = guard.as_ref() {
        if at.elapsed() < SCAN_TTL {
            return list.clone();
        }
    }
    let mut list = Vec::new();
    for root in start_menu_roots() {
        scan_dir(&root, 0, &mut list);
    }
    // Not always in the Start Menu, but always there.
    list.push(Installed { name: "Explorador de Arquivos".into(), target: PathBuf::from("explorer.exe") });
    list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    list.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));
    *guard = Some((Instant::now(), list.clone()));
    list
}

fn icon_for(name: &str) -> &'static str {
    let n = name.to_lowercase();
    let table: &[(&str, &str)] = &[
        ("spotify", "spotify"), ("chrome", "chrome"), ("visual studio code", "code"),
        ("terminal", "terminal"), ("powershell", "terminal"), ("discord", "discord"),
        ("notion", "notion"), ("edge", "globe"), ("firefox", "globe"), ("explorador", "folder"),
        ("explorer", "folder"),
    ];
    table.iter().find(|(k, _)| n.contains(k)).map(|(_, i)| *i).unwrap_or("apps")
}

fn norm(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric()).collect::<String>().to_lowercase()
}

/// Does this window belong to this app? Matched on the owning executable.
fn window_matches(app_name: &str, win: &OpenWindowInfo) -> bool {
    let name = norm(app_name);
    let exe = win.exe.as_str();
    if exe.len() < 3 {
        return false;
    }
    let aliases: &[(&str, &str)] = &[
        ("msedge", "edge"), ("wt", "terminal"), ("windowsterminal", "terminal"),
        ("explorer", "explorador"), ("code", "visualstudiocode"),
    ];
    if aliases.iter().any(|(e, a)| *e == exe && name.contains(a)) {
        return true;
    }
    name == exe || name.contains(exe) || (name.len() >= 4 && exe.contains(&name))
}

fn item_for(app: &Installed, windows: &[OpenWindowInfo], pinned: &[String]) -> AppShortcutItem {
    let win = windows.iter().find(|w| window_matches(&app.name, w));
    let id = app.name.to_lowercase();
    AppShortcutItem {
        pinned: pinned.iter().any(|p| *p == id),
        icon: icon_for(&app.name).to_string(),
        is_open: win.is_some(),
        hwnd: win.map(|w| w.hwnd),
        window_title: win.map(|w| w.title.clone()),
        name: app.name.clone(),
        id,
    }
}

/// The pinned apps (or the defaults, the first time), open ones first.
pub fn list_shortcuts(pinned: &[String]) -> Vec<AppShortcutItem> {
    let windows = win_user::enum_open_windows();
    let apps = installed();
    let wanted: Vec<String> = if pinned.is_empty() {
        DEFAULT_PINS.iter().map(|s| s.to_string()).collect()
    } else {
        pinned.to_vec()
    };
    let mut items: Vec<AppShortcutItem> = wanted
        .iter()
        .filter_map(|id| apps.iter().find(|a| a.name.to_lowercase() == *id))
        .map(|a| item_for(a, &windows, &wanted))
        .collect();
    items.sort_by_key(|i| !i.is_open);
    items
}

/// Search the whole PC: installed apps by name, plus open windows by title.
pub fn search(query: &str, pinned: &[String]) -> Vec<AppShortcutItem> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Vec::new();
    }
    let windows = win_user::enum_open_windows();
    let mut items: Vec<AppShortcutItem> = installed()
        .iter()
        .filter(|a| a.name.to_lowercase().contains(&q))
        .map(|a| item_for(a, &windows, pinned))
        .collect();
    // Prefix matches first, then open ones.
    items.sort_by_key(|i| (!i.name.to_lowercase().starts_with(&q), !i.is_open));
    items.truncate(8);
    items
}

/// Brings the app's window forward if it has one, otherwise launches it.
pub fn launch_or_focus(app_id: &str) -> bool {
    let windows = win_user::enum_open_windows();
    let apps = installed();
    let Some(app) = apps.iter().find(|a| a.name.to_lowercase() == app_id) else {
        return false;
    };
    if let Some(w) = windows.iter().find(|w| window_matches(&app.name, w)) {
        if win_user::focus_or_restore_hwnd(w.hwnd) {
            return true;
        }
    }
    Command::new("cmd")
        .args(["/C", "start", "", &app.target.to_string_lossy()])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn win(exe: &str) -> OpenWindowInfo {
        OpenWindowInfo { hwnd: 1, title: String::new(), exe: exe.into() }
    }

    /// Lists this PC's real pinned apps and open windows (run with `--ignored --nocapture`).
    #[test]
    #[ignore]
    fn lists_real_apps() {
        println!("installed: {}", installed().len());
        for i in list_shortcuts(&[]) {
            println!("{:<26} open={} title={:?}", i.name, i.is_open, i.window_title);
        }
        for i in search("code", &[]) {
            println!("search: {}", i.name);
        }
    }

    #[test]
    fn windows_match_their_app_by_executable() {
        assert!(window_matches("Google Chrome", &win("chrome")));
        assert!(window_matches("Visual Studio Code", &win("code")));
        assert!(window_matches("Microsoft Edge", &win("msedge")));
        assert!(window_matches("Windows Terminal", &win("windowsterminal")));
        assert!(!window_matches("Discord", &win("chrome")));
        assert!(!window_matches("Notion", &win("wt")));
    }
}
