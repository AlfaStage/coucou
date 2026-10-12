// Native Spotify & Windows Media Transport Controls (GSMTC) integration.
// Zero-token, local-first media query and playback control.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession,
    GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};
use windows::Storage::Streams::DataReader;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, KEYEVENTF_KEYUP, VK_MEDIA_NEXT_TRACK, VK_MEDIA_PLAY_PAUSE, VK_MEDIA_PREV_TRACK,
};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyPlaybackState {
    pub is_available: bool,
    pub is_playing: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_art_base64: Option<String>,
    pub app_name: String,
    pub next_track_title: Option<String>,
    pub next_track_artist: Option<String>,
}

static POLLER_RUNNING: AtomicBool = AtomicBool::new(false);

/// Resolves the current active media session, preferring Spotify if multiple media sessions are open.
fn get_target_session(
    manager: &GlobalSystemMediaTransportControlsSessionManager,
) -> Option<GlobalSystemMediaTransportControlsSession> {
    // 1. Try to find a session from Spotify specifically
    if let Ok(sessions) = manager.GetSessions() {
        for session in sessions {
            if let Ok(id) = session.SourceAppUserModelId() {
                let id_lower = id.to_string().to_lowercase();
                if id_lower.contains("spotify") {
                    return Some(session);
                }
            }
        }
    }
    // 2. Fall back to the system's current default session
    manager.GetCurrentSession().ok()
}

/// Fetches media metadata and playback status from Windows GSMTC.
pub async fn query_state() -> SpotifyPlaybackState {
    tokio::task::spawn_blocking(|| {
        let manager = match GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
            Ok(op) => match op.get() {
                Ok(m) => m,
                Err(_) => return SpotifyPlaybackState::default(),
            },
            Err(_) => return SpotifyPlaybackState::default(),
        };

        let session = match get_target_session(&manager) {
            Some(s) => s,
            None => return SpotifyPlaybackState::default(),
        };

        let app_name = session
            .SourceAppUserModelId()
            .map(|h| h.to_string())
            .unwrap_or_else(|_| "Media".to_string());

        let is_playing = session
            .GetPlaybackInfo()
            .map(|info| {
                matches!(
                    info.PlaybackStatus(),
                    Ok(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
                )
            })
            .unwrap_or(false);

        let (title, artist, album, album_art_base64) = match session.TryGetMediaPropertiesAsync() {
            Ok(op) => match op.get() {
                Ok(props) => {
                    let title = props.Title().map(|h| h.to_string()).unwrap_or_default();
                    let artist = props.Artist().map(|h| h.to_string()).unwrap_or_default();
                    let album = props.AlbumTitle().map(|h| h.to_string()).unwrap_or_default();

                    let mut art = None;
                    if let Ok(thumb_ref) = props.Thumbnail() {
                        if let Ok(stream_op) = thumb_ref.OpenReadAsync() {
                            if let Ok(stream) = stream_op.get() {
                                if let Ok(size) = stream.Size() {
                                    if size > 0 && size < 10_000_000 {
                                        if let Ok(reader) = DataReader::CreateDataReader(&stream) {
                                            if let Ok(load_op) = reader.LoadAsync(size as u32) {
                                                if load_op.get().is_ok() {
                                                    let mut buf = vec![0u8; size as usize];
                                                    if reader.ReadBytes(&mut buf).is_ok() {
                                                        let b64 = base64_encode(&buf);
                                                        art = Some(format!("data:image/jpeg;base64,{b64}"));
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    (title, artist, album, art)
                }
                Err(_) => (String::new(), String::new(), String::new(), None),
            },
            Err(_) => (String::new(), String::new(), String::new(), None),
        };

        SpotifyPlaybackState {
            is_available: !title.is_empty(),
            is_playing,
            title,
            artist,
            album,
            album_art_base64,
            app_name,
            next_track_title: None,
            next_track_artist: None,
        }
    })
    .await
    .unwrap_or_default()
}

fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0];
        let b1 = chunk.get(1).copied().unwrap_or(0);
        let b2 = chunk.get(2).copied().unwrap_or(0);

        out.push(TABLE[(b0 >> 2) as usize] as char);
        out.push(TABLE[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(b2 & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

/// Plays or pauses playback using GSMTC with hardware key fallback.
pub async fn toggle_play_pause() -> Result<bool, String> {
    tokio::task::spawn_blocking(|| {
        if let Ok(op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
            if let Ok(manager) = op.get() {
                if let Some(session) = get_target_session(&manager) {
                    if let Ok(play_op) = session.TryTogglePlayPauseAsync() {
                        if let Ok(res) = play_op.get() {
                            return Ok(res);
                        }
                    }
                }
            }
        }
        // Fallback: simulate media key press
        unsafe {
            keybd_event(VK_MEDIA_PLAY_PAUSE.0 as u8, 0, Default::default(), 0);
            keybd_event(VK_MEDIA_PLAY_PAUSE.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        }
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Skips to the next track using GSMTC with hardware key fallback.
pub async fn next_track() -> Result<bool, String> {
    tokio::task::spawn_blocking(|| {
        if let Ok(op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
            if let Ok(manager) = op.get() {
                if let Some(session) = get_target_session(&manager) {
                    if let Ok(skip_op) = session.TrySkipNextAsync() {
                        if let Ok(res) = skip_op.get() {
                            return Ok(res);
                        }
                    }
                }
            }
        }
        unsafe {
            keybd_event(VK_MEDIA_NEXT_TRACK.0 as u8, 0, Default::default(), 0);
            keybd_event(VK_MEDIA_NEXT_TRACK.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        }
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Skips to the previous track using GSMTC with hardware key fallback.
pub async fn prev_track() -> Result<bool, String> {
    tokio::task::spawn_blocking(|| {
        if let Ok(op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
            if let Ok(manager) = op.get() {
                if let Some(session) = get_target_session(&manager) {
                    if let Ok(prev_op) = session.TrySkipPreviousAsync() {
                        if let Ok(res) = prev_op.get() {
                            return Ok(res);
                        }
                    }
                }
            }
        }
        unsafe {
            keybd_event(VK_MEDIA_PREV_TRACK.0 as u8, 0, Default::default(), 0);
            keybd_event(VK_MEDIA_PREV_TRACK.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        }
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Background poller checking Spotify/media status every 1.5 seconds.
pub fn start_poller(app: AppHandle) {
    if POLLER_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let mut last_title = String::new();
        let mut last_playing = false;

        loop {
            tokio::time::sleep(Duration::from_millis(1500)).await;
            if crate::integrations::PAUSED.load(Ordering::Relaxed) {
                continue;
            }

            let state = query_state().await;
            if state.title != last_title || state.is_playing != last_playing {
                last_title = state.title.clone();
                last_playing = state.is_playing;
                let _ = app.emit_to(crate::island::WINDOW_LABEL, "spotify-update", &state);
            }
        }
    });
}
