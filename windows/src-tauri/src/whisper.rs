// Local Whisper Speech-to-Text transcriber for Coucou.
// Uses local Whisper model (CPU-based, zero token consumption)
// and handles typing into external window or populating prompt.

use std::fs;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn find_python() -> PathBuf {
    // 1. Check hermes-agent venv where whisper is known to exist
    let hermes = PathBuf::from(r"C:\Users\theja\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe");
    if hermes.exists() {
        return hermes;
    }
    // 2. Python 3.13 standard install
    let py313 = PathBuf::from(r"C:\Users\theja\AppData\Local\Programs\Python\Python313\python.exe");
    if py313.exists() {
        return py313;
    }
    // 3. Fallback to python in PATH
    PathBuf::from("python")
}

pub fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    let s = if let Some(idx) = input.find(";base64,") {
        &input[idx + 8..]
    } else {
        input
    };
    let clean = s.trim().replace(|c: char| c == '\r' || c == '\n', "");
    let bytes = clean.as_bytes();
    if bytes.is_empty() {
        return Ok(Vec::new());
    }
    if bytes.len() % 4 != 0 {
        return Err("Invalid base64 length".to_string());
    }

    let decode_val = |b: u8| -> Result<u8, String> {
        match b {
            b'A'..=b'Z' => Ok(b - b'A'),
            b'a'..=b'z' => Ok(b - b'a' + 26),
            b'0'..=b'9' => Ok(b - b'0' + 52),
            b'+' => Ok(62),
            b'/' => Ok(63),
            b'=' => Ok(0),
            _ => Err(format!("Invalid character in base64: {}", b as char)),
        }
    };

    let mut out = Vec::with_capacity(bytes.len() / 4 * 3);
    for chunk in bytes.chunks(4) {
        let b0 = decode_val(chunk[0])?;
        let b1 = decode_val(chunk[1])?;
        let b2 = decode_val(chunk[2])?;
        let b3 = decode_val(chunk[3])?;

        out.push((b0 << 2) | (b1 >> 4));
        if chunk[2] != b'=' {
            out.push(((b1 & 0x0f) << 4) | (b2 >> 2));
        }
        if chunk[3] != b'=' {
            out.push(((b2 & 0x03) << 6) | b3);
        }
    }
    Ok(out)
}

pub fn transcribe(audio_base64: &str, mode: &str, lang: Option<&str>) -> Result<String, String> {
    let audio_bytes = base64_decode(audio_base64)?;
    if audio_bytes.is_empty() {
        return Err("Audio payload is empty".to_string());
    }

    let temp_dir = std::env::temp_dir();
    let file_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let temp_audio = temp_dir.join(format!("coucou_whisper_{}.webm", file_id));

    if let Err(e) = fs::write(&temp_audio, &audio_bytes) {
        return Err(format!("Failed to write temp audio file: {e}"));
    }

    let python_exe = find_python();
    let script = r#"
import sys, os

audio_path = sys.argv[1]
lang = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "auto" else None

try:
    import whisper
    opts = {"language": lang} if lang else {}
    model = whisper.load_model("base")
    res = model.transcribe(audio_path, **opts)
    text = res.get("text", "").strip()
    sys.stdout.reconfigure(encoding='utf-8')
    print(text)
except Exception as e:
    sys.stderr.write(f"Whisper error: {e}\n")
    sys.exit(1)
"#;

    let target_lang = lang.unwrap_or("pt");
    let mut cmd = Command::new(&python_exe);
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.env("PYTHONIOENCODING", "utf-8");
    cmd.args(["-c", script, &temp_audio.to_string_lossy(), target_lang]);

    let output = match cmd.output() {
        Ok(out) => out,
        Err(e) => {
            let _ = fs::remove_file(&temp_audio);
            return Err(format!("Failed to execute python whisper: {e}"));
        }
    };

    let _ = fs::remove_file(&temp_audio);

    if !output.status.success() {
        let err_str = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("Whisper transcription failed: {err_str}"));
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // Mode A: Type directly into the active window
    if mode == "type" && !text.is_empty() {
        crate::win_user::type_text_into_active_window(&text);
    }

    Ok(text)
}
