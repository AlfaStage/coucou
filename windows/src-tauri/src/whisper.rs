// Local speech-to-text for Coucou — nothing you say leaves the machine.
//
// The engine is whisper.cpp's prebuilt `whisper-cli` and a small quantised
// Whisper model. Nothing has to be installed by hand: the first time dictation is
// used, Coucou downloads both (about 68 MB, once) into %LOCALAPPDATA%\Coucou\whisper,
// checks their SHA-256 against the values pinned below, and from then on works
// offline. Audio arrives from the island as a 16 kHz mono WAV; the text is typed
// where the cursor is, or returned for copying.

use std::fs;
use std::io::Write;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const ENGINE_URL: &str = "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip";
const ENGINE_SHA256: &str = "49DCC16DE826F20BD53D44F947A1AE49DFA81F86CAD67A64D80820CB192D674A";
const ENGINE_BYTES: u64 = 8_194_445;

const MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin";
const MODEL_FILE: &str = "ggml-base-q5_1.bin";
const MODEL_SHA256: &str = "422F1AE452ADE6F30A004D7E5C6A43195E4433BC370BF23FAC9CC591F01A8898";
const MODEL_BYTES: u64 = 59_707_625;

static SETTING_UP: AtomicBool = AtomicBool::new(false);

fn dir() -> PathBuf {
    crate::settings::local_dir().join("whisper")
}

fn engine_exe() -> PathBuf {
    dir().join("engine").join("Release").join("whisper-cli.exe")
}

fn model_path() -> PathBuf {
    dir().join(MODEL_FILE)
}

fn installed() -> bool {
    engine_exe().is_file() && model_path().metadata().map(|m| m.len() == MODEL_BYTES).unwrap_or(false)
}

/// What the island shows about the engine.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WhisperStatus {
    /// ready | needs_setup | setting_up
    pub state: String,
    /// Download size still to fetch, in MB (0 when ready).
    pub download_mb: u64,
}

pub fn status() -> WhisperStatus {
    if installed() {
        return WhisperStatus { state: "ready".into(), download_mb: 0 };
    }
    let mb = (ENGINE_BYTES + MODEL_BYTES) / 1_000_000;
    let state = if SETTING_UP.load(Ordering::Relaxed) { "setting_up" } else { "needs_setup" };
    WhisperStatus { state: state.into(), download_mb: mb }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SetupProgress {
    /// downloading | unpacking | done | error
    stage: String,
    percent: u32,
    message: Option<String>,
}

fn emit(app: &AppHandle, stage: &str, percent: u32, message: Option<String>) {
    let _ = app.emit_to(
        crate::island::WINDOW_LABEL,
        "whisper-setup",
        SetupProgress { stage: stage.into(), percent, message },
    );
}

/// (stage, percent, message) — where setup reports to.
type Progress<'a> = &'a (dyn Fn(&str, u32, Option<String>) + Send + Sync);

fn sha256_of(path: &PathBuf) -> Option<String> {
    let out = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command"])
        .arg(format!("(Get-FileHash -Algorithm SHA256 -LiteralPath '{}').Hash", path.display()))
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    Some(String::from_utf8_lossy(&out.stdout).trim().to_uppercase())
}

/// Downloads `url` to `dest` (via a .part file), reporting progress mapped into
/// `[from, to]` percent, and checks the pinned hash.
async fn download(
    report: Progress<'_>,
    url: &str,
    dest: &PathBuf,
    sha256: &str,
    from: u32,
    to: u32,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;
    let mut resp = client
        .get(url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|_| "Não consegui baixar o motor de voz. Verifique a internet e tente de novo.".to_string())?;
    let total = resp.content_length().unwrap_or(0);
    let part = dest.with_extension("part");
    let mut file = fs::File::create(&part).map_err(|e| e.to_string())?;
    let mut got: u64 = 0;
    let mut last = 0;
    while let Some(chunk) = resp.chunk().await.map_err(|_| "O download foi interrompido.".to_string())? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        got += chunk.len() as u64;
        if total > 0 {
            let pct = from + ((to - from) as u64 * got / total) as u32;
            if pct != last {
                last = pct;
                report("downloading", pct, None);
            }
        }
    }
    drop(file);
    let hash = sha256_of(&part);
    if hash.as_deref() != Some(sha256) {
        let _ = fs::remove_file(&part);
        return Err("O arquivo baixado não confere com o esperado. Por segurança, não usei.".into());
    }
    fs::rename(&part, dest).map_err(|e| e.to_string())
}

/// Downloads and unpacks the engine and the model, reporting to the island.
pub async fn setup(app: AppHandle) {
    setup_with(&move |stage, pct, msg| emit(&app, stage, pct, msg)).await;
}

/// Downloads and unpacks the engine and the model. Safe to call twice.
pub async fn setup_with(report: Progress<'_>) {
    if installed() || SETTING_UP.swap(true, Ordering::SeqCst) {
        return;
    }
    let result: Result<(), String> = async {
        let root = dir();
        fs::create_dir_all(&root).map_err(|e| e.to_string())?;

        if !engine_exe().is_file() {
            let zip = root.join("engine.zip");
            download(report, ENGINE_URL, &zip, ENGINE_SHA256, 0, 12).await?;
            report("unpacking", 12, None);
            let target = root.join("engine");
            let _ = fs::remove_dir_all(&target);
            let ok = Command::new("powershell")
                .args(["-NoProfile", "-NonInteractive", "-Command"])
                .arg(format!(
                    "Expand-Archive -Force -LiteralPath '{}' -DestinationPath '{}'",
                    zip.display(),
                    target.display()
                ))
                .creation_flags(CREATE_NO_WINDOW)
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            let _ = fs::remove_file(&zip);
            if !ok || !engine_exe().is_file() {
                return Err("Não consegui abrir o motor de voz baixado.".into());
            }
        }
        if !model_path().is_file() {
            download(report, MODEL_URL, &model_path(), MODEL_SHA256, 12, 100).await?;
        }
        Ok(())
    }
    .await;
    SETTING_UP.store(false, Ordering::SeqCst);
    match result {
        Ok(()) => report("done", 100, None),
        Err(message) => report("error", 0, Some(message)),
    }
}

pub fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    let s = input.find(";base64,").map(|i| &input[i + 8..]).unwrap_or(input);
    let clean: Vec<u8> = s.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
    if clean.len() % 4 != 0 {
        return Err("Áudio inválido.".into());
    }
    let val = |b: u8| -> Result<u8, String> {
        Ok(match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' => 0,
            _ => return Err("Áudio inválido.".into()),
        })
    };
    let mut out = Vec::with_capacity(clean.len() / 4 * 3);
    for c in clean.chunks(4) {
        let (b0, b1, b2, b3) = (val(c[0])?, val(c[1])?, val(c[2])?, val(c[3])?);
        out.push((b0 << 2) | (b1 >> 4));
        if c[2] != b'=' {
            out.push(((b1 & 0x0f) << 4) | (b2 >> 2));
        }
        if c[3] != b'=' {
            out.push(((b2 & 0x03) << 6) | b3);
        }
    }
    Ok(out)
}

/// Whisper writes these for silence and noise; they are not speech.
fn is_noise(text: &str) -> bool {
    let t = text.trim().to_lowercase();
    t.is_empty()
        || (t.starts_with('[') && t.ends_with(']'))
        || (t.starts_with('(') && t.ends_with(')'))
        || t == "you"
}

/// Transcribes one 16 kHz mono WAV. `lang` "auto"/None lets Whisper detect it.
/// In "type" mode the text is typed into whichever window has focus.
pub fn transcribe(wav_base64: &str, mode: &str, lang: Option<&str>) -> Result<String, String> {
    if !installed() {
        return Err("O motor de voz ainda não foi baixado.".into());
    }
    let wav = base64_decode(wav_base64)?;
    // 44-byte header + at least ~0.4 s of 16 kHz 16-bit audio.
    if wav.len() < 44 + 12_800 {
        return Err("Não ouvi nada. Fale um pouco mais perto do microfone.".into());
    }
    let path = std::env::temp_dir().join(format!(
        "coucou_voice_{}.wav",
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
    ));
    fs::write(&path, &wav).map_err(|e| format!("Não consegui gravar o áudio: {e}"))?;

    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).min(8);
    let language = lang.filter(|l| !l.is_empty()).unwrap_or("auto");
    let output = Command::new(engine_exe())
        .arg("-m")
        .arg(model_path())
        .arg("-f")
        .arg(&path)
        .args(["-l", language, "-nt", "-np", "-bs", "1", "-bo", "1", "-nf", "-t", &threads.to_string()])
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output();
    let _ = fs::remove_file(&path);

    let output = output.map_err(|_| "Não consegui iniciar o motor de voz.".to_string())?;
    if !output.status.success() {
        return Err("Não consegui transcrever esse áudio.".into());
    }
    let text = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    if is_noise(&text) {
        return Err("Não ouvi nenhuma fala.".into());
    }
    if mode == "type" {
        crate::win_user::type_text_into_active_window(&text);
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Runs the real first-use setup on this machine (downloads ~68 MB into
    /// %LOCALAPPDATA%\Coucou\whisper) and transcribes a WAV given in COUCOU_TEST_WAV:
    /// `cargo test --lib -- --ignored --nocapture downloads_and_transcribes`.
    #[test]
    #[ignore]
    fn downloads_and_transcribes() {
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        rt.block_on(setup_with(&|stage, pct, msg| println!("[setup] {stage} {pct}% {msg:?}")));
        assert!(installed(), "engine and model should be in place");
        let wav = std::fs::read(std::env::var("COUCOU_TEST_WAV").unwrap()).unwrap();
        let b64 = {
            const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            let mut o = String::new();
            for c in wav.chunks(3) {
                let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
                o.push(T[(n >> 18) as usize & 63] as char);
                o.push(T[(n >> 12) as usize & 63] as char);
                o.push(if c.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
                o.push(if c.len() > 2 { T[n as usize & 63] as char } else { '=' });
            }
            o
        };
        let t = std::time::Instant::now();
        let text = transcribe(&b64, "copy", Some("en")).unwrap();
        println!("[transcribe] {:?} in {:.1}s -> {text}", t.elapsed(), t.elapsed().as_secs_f32());
    }

    #[test]
    fn silence_markers_are_not_speech() {
        assert!(is_noise("[BLANK_AUDIO]"));
        assert!(is_noise(" (silence) "));
        assert!(!is_noise("Olá, tudo bem?"));
    }

    #[test]
    fn base64_round_trips_a_data_url() {
        assert_eq!(base64_decode("data:audio/wav;base64,aGk=").unwrap(), b"hi");
    }
}
