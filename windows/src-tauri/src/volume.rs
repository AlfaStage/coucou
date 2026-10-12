// Spotify's own volume, through the Windows audio-session API.
//
// This moves the slider inside Windows' volume mixer for Spotify only — the
// master volume and every other app stay where they are. Nothing is sent
// anywhere; it is the same control the mixer itself uses.

use windows::core::{Interface, GUID};
use windows::Win32::Media::Audio::{
    eConsole, eRender, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator,
    ISimpleAudioVolume, MMDeviceEnumerator,
};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};

use crate::win_user::exe_stem_of_pid;

/// Runs `f` on the audio session that belongs to Spotify, if it is making sound.
fn with_spotify<R>(f: impl Fn(&ISimpleAudioVolume) -> Option<R>) -> Option<R> {
    unsafe {
        // Already initialised on this thread is fine; we only need COM to be up.
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let devices: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
        let device = devices.GetDefaultAudioEndpoint(eRender, eConsole).ok()?;
        let manager: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None).ok()?;
        let sessions = manager.GetSessionEnumerator().ok()?;
        for i in 0..sessions.GetCount().ok()? {
            let Ok(control) = sessions.GetSession(i) else { continue };
            let Ok(control2) = control.cast::<IAudioSessionControl2>() else { continue };
            let Ok(pid) = control2.GetProcessId() else { continue };
            if exe_stem_of_pid(pid) == "spotify" {
                if let Ok(volume) = control.cast::<ISimpleAudioVolume>() {
                    return f(&volume);
                }
            }
        }
        None
    }
}

/// Spotify's volume, 0.0–1.0. None when Spotify has no audio session yet.
pub fn spotify_volume() -> Option<f32> {
    with_spotify(|v| unsafe { v.GetMasterVolume().ok() })
}

pub fn set_spotify_volume(level: f32) -> bool {
    let level = level.clamp(0.0, 1.0);
    with_spotify(|v| unsafe { v.SetMasterVolume(level, &GUID::zeroed()).ok().map(|_| true) }).unwrap_or(false)
}
