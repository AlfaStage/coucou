// Global keyboard shortcuts (work whatever app has the focus).
//
// Two of them: open/close the island, and start/stop dictation. Both are
// configurable because a shortcut another app already owns cannot be shared —
// Windows refuses the registration and we say so instead of failing silently.
//
// A dedicated thread owns the registrations (RegisterHotKey is per-thread) and
// sleeps in GetMessage, so idle cost is zero.

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, MOD_SHIFT, MOD_WIN,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetMessageW, PeekMessageW, PostThreadMessageW, MSG, PM_NOREMOVE, WM_APP, WM_HOTKEY, WM_USER,
};

const ID_TOGGLE: i32 = 0x0C01;
const ID_DICTATE: i32 = 0x0C02;

static THREAD_ID: AtomicU32 = AtomicU32::new(0);
static PENDING: Mutex<Option<(String, String, mpsc::Sender<HotkeyStatus>)>> = Mutex::new(None);

/// One shortcut's outcome, for the settings UI.
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyState {
    /// Canonical spelling ("Ctrl+Alt+Space"), empty when unset.
    pub combo: String,
    pub ok: bool,
    /// Plain-language reason when `ok` is false.
    pub error: Option<String>,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyStatus {
    pub toggle: HotkeyState,
    pub dictate: HotkeyState,
}

/// Parses "Ctrl+Alt+D" into Win32 modifiers, a virtual-key code and its canonical spelling.
pub fn parse(combo: &str) -> Result<(HOT_KEY_MODIFIERS, u32, String), String> {
    let mut mods = HOT_KEY_MODIFIERS(0);
    let mut names: Vec<&str> = Vec::new();
    let mut key: Option<(u32, String)> = None;
    for raw in combo.split('+') {
        let t = raw.trim();
        if t.is_empty() {
            return Err("Atalho incompleto.".into());
        }
        match t.to_lowercase().as_str() {
            "ctrl" | "control" => {
                mods |= MOD_CONTROL;
                names.push("Ctrl");
            }
            "alt" => {
                mods |= MOD_ALT;
                names.push("Alt");
            }
            "shift" => {
                mods |= MOD_SHIFT;
                names.push("Shift");
            }
            "win" | "meta" | "super" | "cmd" => {
                mods |= MOD_WIN;
                names.push("Win");
            }
            other => {
                if key.is_some() {
                    return Err("Use só uma tecla além dos modificadores.".into());
                }
                key = Some(key_code(other).ok_or_else(|| format!("Tecla \"{t}\" não suportada."))?);
            }
        }
    }
    let (vk, label) = key.ok_or("Falta a tecla principal.")?;
    let is_function_key = (0x70..=0x87).contains(&vk);
    if mods.0 == 0 && !is_function_key {
        return Err("Inclua Ctrl, Alt, Shift ou Win.".into());
    }
    let mut spelled: Vec<String> = Vec::new();
    for n in ["Ctrl", "Alt", "Shift", "Win"] {
        if names.contains(&n) {
            spelled.push(n.to_string());
        }
    }
    spelled.push(label);
    Ok((mods, vk, spelled.join("+")))
}

fn key_code(name: &str) -> Option<(u32, String)> {
    let named: &[(&str, u32, &str)] = &[
        ("space", 0x20, "Space"), ("enter", 0x0D, "Enter"), ("tab", 0x09, "Tab"),
        ("backspace", 0x08, "Backspace"), ("insert", 0x2D, "Insert"), ("delete", 0x2E, "Delete"),
        ("home", 0x24, "Home"), ("end", 0x23, "End"), ("pageup", 0x21, "PageUp"), ("pagedown", 0x22, "PageDown"),
        ("up", 0x26, "Up"), ("down", 0x28, "Down"), ("left", 0x25, "Left"), ("right", 0x27, "Right"),
        (";", 0xBA, ";"), ("=", 0xBB, "="), (",", 0xBC, ","), ("-", 0xBD, "-"), (".", 0xBE, "."),
        ("/", 0xBF, "/"), ("`", 0xC0, "`"), ("[", 0xDB, "["), ("\\", 0xDC, "\\"), ("]", 0xDD, "]"), ("'", 0xDE, "'"),
    ];
    if let Some((_, vk, label)) = named.iter().find(|(n, _, _)| *n == name) {
        return Some((*vk, label.to_string()));
    }
    if let Some(n) = name.strip_prefix('f').and_then(|n| n.parse::<u32>().ok()) {
        if (1..=24).contains(&n) {
            return Some((0x6F + n, format!("F{n}")));
        }
    }
    let mut chars = name.chars();
    match (chars.next(), chars.next()) {
        (Some(c), None) if c.is_ascii_alphabetic() => {
            Some((c.to_ascii_uppercase() as u32, c.to_ascii_uppercase().to_string()))
        }
        (Some(c), None) if c.is_ascii_digit() => Some((c as u32, c.to_string())),
        _ => None,
    }
}

fn register(id: i32, combo: &str) -> HotkeyState {
    if combo.trim().is_empty() {
        return HotkeyState::default();
    }
    match parse(combo) {
        Err(error) => HotkeyState { combo: combo.to_string(), ok: false, error: Some(error) },
        Ok((mods, vk, spelled)) => {
            let result = unsafe { RegisterHotKey(None, id, mods | MOD_NOREPEAT, vk) };
            match result {
                Ok(()) => HotkeyState { combo: spelled, ok: true, error: None },
                Err(_) => HotkeyState {
                    combo: spelled,
                    ok: false,
                    error: Some("Outro programa já usa esse atalho. Escolha outro.".into()),
                },
            }
        }
    }
}

fn apply(toggle: &str, dictate: &str) -> HotkeyStatus {
    unsafe {
        let _ = UnregisterHotKey(None, ID_TOGGLE);
        let _ = UnregisterHotKey(None, ID_DICTATE);
    }
    let toggle_state = register(ID_TOGGLE, toggle);
    let mut dictate_state = register(ID_DICTATE, dictate);
    if dictate_state.ok && toggle_state.ok && dictate_state.combo == toggle_state.combo {
        unsafe {
            let _ = UnregisterHotKey(None, ID_DICTATE);
        }
        dictate_state.ok = false;
        dictate_state.error = Some("É o mesmo atalho de abrir o Coucou.".into());
    }
    HotkeyStatus { toggle: toggle_state, dictate: dictate_state }
}

/// Starts the hotkey thread and registers both shortcuts. Returns their status.
pub fn start(app: AppHandle, toggle: String, dictate: String) -> HotkeyStatus {
    let (ready_tx, ready_rx) = mpsc::channel::<HotkeyStatus>();
    std::thread::spawn(move || unsafe {
        THREAD_ID.store(GetCurrentThreadId(), Ordering::SeqCst);
        // Force this thread's message queue into existence before anyone posts to it.
        let mut msg = MSG::default();
        let _ = PeekMessageW(&mut msg, None, WM_USER, WM_USER, PM_NOREMOVE);
        let _ = ready_tx.send(apply(&toggle, &dictate));

        while GetMessageW(&mut msg, None, 0, 0).0 > 0 {
            if msg.message == WM_HOTKEY {
                let action = match msg.wParam.0 as i32 {
                    ID_TOGGLE => "toggle",
                    ID_DICTATE => "dictate",
                    _ => continue,
                };
                let _ = app.emit_to(crate::island::WINDOW_LABEL, "hotkey", action);
            } else if msg.message == WM_APP {
                if let Some((t, d, reply)) = PENDING.lock().unwrap().take() {
                    let _ = reply.send(apply(&t, &d));
                }
            }
        }
    });
    ready_rx.recv().unwrap_or_default()
}

/// Re-registers both shortcuts (after the user edits them) and reports the result.
pub fn update(toggle: &str, dictate: &str) -> HotkeyStatus {
    let thread = THREAD_ID.load(Ordering::SeqCst);
    if thread == 0 {
        return HotkeyStatus::default();
    }
    let (tx, rx) = mpsc::channel();
    *PENDING.lock().unwrap() = Some((toggle.to_string(), dictate.to_string(), tx));
    unsafe {
        let _ = PostThreadMessageW(thread, WM_APP, Default::default(), Default::default());
    }
    rx.recv_timeout(std::time::Duration::from_secs(2)).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_canonicalises() {
        let (m, vk, s) = parse("alt + ctrl + d").unwrap();
        assert_eq!(s, "Ctrl+Alt+D");
        assert_eq!(vk, 'D' as u32);
        assert!(m.0 & MOD_CONTROL.0 != 0 && m.0 & MOD_ALT.0 != 0);
        assert_eq!(parse("F9").unwrap().2, "F9");
        assert_eq!(parse("Ctrl+Space").unwrap().1, 0x20);
    }

    /// Asks Windows for a real (rarely used) shortcut and gives it back.
    #[test]
    fn windows_accepts_a_free_combo_and_refuses_a_taken_one() {
        let first = register(0x0CF1, "Ctrl+Alt+Shift+F23");
        assert!(first.ok, "{first:?}");
        // Same thread, same combo, different id: Windows says it is taken.
        let second = register(0x0CF2, "Ctrl+Alt+Shift+F23");
        assert!(!second.ok && second.error.is_some());
        unsafe {
            let _ = UnregisterHotKey(None, 0x0CF1);
        }
    }

    #[test]
    fn rejects_bad_combos() {
        assert!(parse("D").is_err()); // no modifier
        assert!(parse("Ctrl+").is_err());
        assert!(parse("Ctrl+A+B").is_err());
        assert!(parse("Ctrl+Banana").is_err());
    }
}
