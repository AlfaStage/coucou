// Windows clipboard history (the one behind Win+V), read and pasted from the island.
//
// The list comes straight from Windows — nothing is copied, stored or sent by
// Coucou. Choosing an item puts it back on the clipboard and sends Ctrl+V to the
// window you were already typing in (the island never takes focus).

use std::time::{Duration, Instant};

use serde::Serialize;
use windows::ApplicationModel::DataTransfer::{
    Clipboard, ClipboardHistoryItemsResultStatus, SetHistoryItemAsContentStatus, StandardDataFormats,
};
use windows_future::AsyncStatus;
use windows_future::IAsyncOperation;
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::WindowsAndMessaging::{DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClipItem {
    pub id: String,
    /// text | image | other
    pub kind: String,
    /// Full text for text items, a label for the rest.
    pub text: String,
    /// When it was copied, epoch milliseconds.
    pub copied_at: i64,
}

/// 100 ns ticks since 1601-01-01 (WinRT DateTime) → epoch milliseconds.
fn to_epoch_ms(universal_time: i64) -> i64 {
    (universal_time - 116_444_736_000_000_000) / 10_000
}

/// The clipboard WinRT classes only activate in a single-threaded apartment, and an
/// STA thread must keep pumping messages or its async calls never complete. So each
/// request runs on its own short-lived STA thread and waits by pumping.
fn on_sta<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    std::thread::spawn(move || {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
        let out = work();
        unsafe { CoUninitialize() };
        out
    })
    .join()
    .map_err(|_| "O histórico da área de transferência falhou.".to_string())?
}

/// Waits for a WinRT async operation while dispatching this thread's messages.
fn wait<T: windows::core::RuntimeType + 'static>(op: IAsyncOperation<T>) -> Result<T, String> {
    let started = Instant::now();
    loop {
        match op.Status().map_err(|e| e.to_string())? {
            AsyncStatus::Started => {
                if started.elapsed() > Duration::from_secs(4) {
                    return Err("O Windows demorou demais para responder.".into());
                }
                unsafe {
                    let mut msg = MSG::default();
                    while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                        let _ = TranslateMessage(&msg);
                        DispatchMessageW(&msg);
                    }
                }
                std::thread::sleep(Duration::from_millis(4));
            }
            AsyncStatus::Completed => return op.GetResults().map_err(|e| e.to_string()),
            _ => return Err("O Windows não liberou o histórico da área de transferência.".into()),
        }
    }
}

pub fn history() -> Result<Vec<ClipItem>, String> {
    on_sta(history_inner)
}

fn history_inner() -> Result<Vec<ClipItem>, String> {
    let result = wait(Clipboard::GetHistoryItemsAsync().map_err(|e| e.to_string())?)?;
    match result.Status().map_err(|e| e.to_string())? {
        ClipboardHistoryItemsResultStatus::Success => {}
        ClipboardHistoryItemsResultStatus::ClipboardHistoryDisabled => {
            return Err("O histórico da área de transferência está desligado. Ative em Configurações do Windows ▸ Sistema ▸ Área de Transferência (ou Win+V).".into());
        }
        _ => return Err("O Windows não liberou o histórico da área de transferência.".into()),
    }
    let items = result.Items().map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for item in items {
        let id = item.Id().map(|s| s.to_string()).unwrap_or_default();
        let copied_at = item.Timestamp().map(|t| to_epoch_ms(t.UniversalTime)).unwrap_or(0);
        let Ok(view) = item.Content() else { continue };
        let is_text = StandardDataFormats::Text().ok().and_then(|f| view.Contains(&f).ok()).unwrap_or(false);
        let is_image = StandardDataFormats::Bitmap().ok().and_then(|f| view.Contains(&f).ok()).unwrap_or(false);
        let (kind, text) = if is_text {
            let text = view
                .GetTextAsync()
                .map_err(|e| e.to_string())
                .and_then(wait)
                .map(|s| s.to_string())
                .unwrap_or_default();
            ("text", text)
        } else if is_image {
            ("image", "Imagem".to_string())
        } else {
            ("other", "Conteúdo copiado".to_string())
        };
        out.push(ClipItem { id, kind: kind.into(), text, copied_at });
    }
    Ok(out)
}

/// Puts the chosen history item back on the clipboard and pastes it.
pub fn paste(id: &str) -> Result<(), String> {
    let id = id.to_string();
    on_sta(move || paste_inner(&id))
}

fn paste_inner(id: &str) -> Result<(), String> {
    let result = wait(Clipboard::GetHistoryItemsAsync().map_err(|e| e.to_string())?)?;
    let items = result.Items().map_err(|e| e.to_string())?;
    let item = items
        .into_iter()
        .find(|i| i.Id().map(|s| s.to_string()).unwrap_or_default() == id)
        .ok_or("Esse item não está mais no histórico.")?;
    match Clipboard::SetHistoryItemAsContent(&item).map_err(|e| e.to_string())? {
        SetHistoryItemAsContentStatus::Success => {}
        _ => return Err("O Windows recusou colar esse item.".into()),
    }
    // Let the clipboard settle before the target app reads it.
    std::thread::sleep(std::time::Duration::from_millis(60));
    crate::win_user::send_ctrl_v();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn epoch_conversion() {
        assert_eq!(to_epoch_ms(116_444_736_000_000_000), 0);
    }

    /// Dumps this PC's real clipboard history: `cargo test --lib -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn reads_real_history() {
        match history() {
            Ok(items) => {
                println!("{} items", items.len());
                for i in items.iter().take(8) {
                    println!("{:<6} {} | {}", i.kind, i.copied_at, i.text.chars().take(60).collect::<String>());
                }
            }
            Err(e) => println!("ERR: {e}"),
        }
    }
}
