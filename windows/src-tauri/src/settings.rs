// Preferences, stored as plain JSON in %APPDATA%\Coucou\settings.json.
// No secret ever lands here — API keys live in the Windows Credential Manager.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub sound_enabled: bool,
    pub sound_volume: f64,
    pub auto_close_interval: f64,
    pub absence_interval: f64,
    pub active_integrations: Vec<String>,
    /// "primary" = the main display, "cursor" = whichever display the mouse is on.
    pub screen: String,
    pub autostart: bool,
    pub hooks_installed: bool,
    /// Claude model used by the chat. Changeable in the settings window.
    /// Defaulted explicitly so a settings.json written by an older build still loads.
    #[serde(default = "default_model")]
    pub model: String,
    /// Which assistant answers the chat: "claude" today, "chatgpt" when its
    /// account login lands. Unknown values fall back to Claude.
    #[serde(default = "default_provider")]
    pub chat_provider: String,
    /// Opt-in: read real Claude usage with the login Claude Code already stored.
    #[serde(default)]
    pub quota_claude_live: bool,
    /// App ids (lower-case names) pinned on the island's Apps tab. Empty = defaults.
    #[serde(default)]
    pub pinned_apps: Vec<String>,
    /// Global shortcut that opens/closes the island.
    #[serde(default = "default_hotkey_toggle")]
    pub hotkey_toggle: String,
    /// Global shortcut that starts/stops dictation.
    #[serde(default = "default_hotkey_dictate")]
    pub hotkey_dictate: String,
    /// Keep a slim notch visible at the top instead of hiding it completely.
    #[serde(default = "default_true")]
    pub notch_always_visible: bool,
}

fn default_true() -> bool {
    true
}

fn default_hotkey_toggle() -> String {
    "Ctrl+Alt+Space".to_string()
}

fn default_hotkey_dictate() -> String {
    "Ctrl+Alt+D".to_string()
}

fn default_provider() -> String {
    "claude".to_string()
}

fn default_model() -> String {
    crate::claude::DEFAULT_MODEL.to_string()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            sound_enabled: true,
            sound_volume: 0.12,
            auto_close_interval: 15.0,
            absence_interval: 180.0,
            active_integrations: vec![
                "integration_resend".into(),
                "integration_n8n".into(),
                "integration_vercel".into(),
                "integration_github".into(),
            ],
            screen: "primary".into(),
            autostart: false,
            hooks_installed: false,
            model: default_model(),
            chat_provider: default_provider(),
            quota_claude_live: false,
            pinned_apps: Vec::new(),
            hotkey_toggle: default_hotkey_toggle(),
            hotkey_dictate: default_hotkey_dictate(),
            notch_always_visible: true,
        }
    }
}

/// %APPDATA%\Coucou
pub fn config_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("Coucou")
}

/// %LOCALAPPDATA%\Coucou — where coucou-hook.exe and the log live.
pub fn local_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("Coucou")
}

pub fn hook_exe_path() -> PathBuf {
    local_dir().join("bin").join("coucou-hook.exe")
}

fn settings_path() -> PathBuf {
    config_dir().join("settings.json")
}

pub fn load() -> Settings {
    match std::fs::read(settings_path()) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => Settings::default(),
    }
}

pub fn save(settings: &Settings) -> std::io::Result<()> {
    let dir = config_dir();
    std::fs::create_dir_all(&dir)?;
    let json = serde_json::to_vec_pretty(settings)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    std::fs::write(settings_path(), json)
}
