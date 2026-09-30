// Zero-token, fast multi-language translation and language detection engine.

use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TranslationResult {
    pub original_text: String,
    pub translated_text: String,
    pub detected_source_lang: String,
    pub target_lang: String,
    pub is_fallback: bool,
}

/// Detects the system default UI language (defaults to "pt" if system is in Portuguese, else "en").
pub fn get_system_default_lang() -> String {
    let lang = std::env::var("LANG")
        .or_else(|_| std::env::var("LC_ALL"))
        .unwrap_or_else(|_| "pt_BR".to_string())
        .to_lowercase();

    if lang.starts_with("pt") {
        "pt".to_string()
    } else if lang.starts_with("es") {
        "es".to_string()
    } else if lang.starts_with("fr") {
        "fr".to_string()
    } else {
        "pt".to_string()
    }
}

/// Translates text with zero AI token consumption using high-speed deterministic endpoints.
pub async fn translate(
    text: &str,
    source_opt: Option<&str>,
    target_opt: Option<&str>,
) -> Result<TranslationResult, String> {
    let clean = text.trim();
    if clean.is_empty() {
        return Ok(TranslationResult {
            original_text: String::new(),
            translated_text: String::new(),
            detected_source_lang: "auto".to_string(),
            target_lang: target_opt.unwrap_or("pt").to_string(),
            is_fallback: false,
        });
    }

    let sys_lang = get_system_default_lang();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(6))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .build()
        .map_err(|e| e.to_string())?;

    let sl = source_opt.unwrap_or("auto");
    let mut tl = target_opt.unwrap_or(&sys_lang).to_string();

    // 1. Primary zero-token engine (Google Chrome Extension translation API)
    let chrome_url = format!(
        "https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl={}&tl={}&q={}",
        sl,
        tl,
        urlencoding::encode(clean)
    );

    if let Ok(res) = client.get(&chrome_url).send().await {
        if let Ok(json_val) = res.json::<serde_json::Value>().await {
            if let Some((translated, detected)) = extract_chrome_text(&json_val) {
                // If source text is already the system default language (e.g. pt),
                // and target was not manually specified, auto-translate to English!
                if target_opt.is_none() && detected.starts_with(&sys_lang) {
                    tl = "en".to_string();
                    let retry_url = format!(
                        "https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl={}&tl={}&q={}",
                        detected,
                        tl,
                        urlencoding::encode(clean)
                    );
                    if let Ok(retry_res) = client.get(&retry_url).send().await {
                        if let Ok(retry_json) = retry_res.json::<serde_json::Value>().await {
                            if let Some((retry_trans, _)) = extract_chrome_text(&retry_json) {
                                return Ok(TranslationResult {
                                    original_text: clean.to_string(),
                                    translated_text: retry_trans,
                                    detected_source_lang: detected,
                                    target_lang: tl,
                                    is_fallback: false,
                                });
                            }
                        }
                    }
                }

                return Ok(TranslationResult {
                    original_text: clean.to_string(),
                    translated_text: translated,
                    detected_source_lang: detected,
                    target_lang: tl,
                    is_fallback: false,
                });
            }
        }
    }

    // 2. Secondary fallback engine (MyMemory API with valid language codes)
    let fallback_sl = if sl == "auto" { "en" } else { sl };
    let pair = format!("{fallback_sl}|{tl}");
    let mymemory_url = format!(
        "https://api.mymemory.translated.net/get?q={}&langpair={}",
        urlencoding::encode(clean),
        pair
    );

    if let Ok(res) = client.get(&mymemory_url).send().await {
        if let Ok(json_val) = res.json::<serde_json::Value>().await {
            if let Some(translated) = json_val
                .pointer("/responseData/translatedText")
                .and_then(|v| v.as_str())
            {
                if !translated.starts_with("MYMEMORY WARNING:") {
                    return Ok(TranslationResult {
                        original_text: clean.to_string(),
                        translated_text: translated.to_string(),
                        detected_source_lang: fallback_sl.to_string(),
                        target_lang: tl,
                        is_fallback: true,
                    });
                }
            }
        }
    }

    Err("Could not complete translation. Please check internet connection.".to_string())
}

fn extract_chrome_text(val: &serde_json::Value) -> Option<(String, String)> {
    let arr = val.as_array()?;
    let mut full = String::new();
    let mut detected = "auto".to_string();
    for item in arr {
        if let Some(pair) = item.as_array() {
            if let Some(text) = pair.get(0).and_then(|v| v.as_str()) {
                full.push_str(text);
            }
            if detected == "auto" {
                if let Some(src) = pair.get(1).and_then(|v| v.as_str()) {
                    detected = src.to_lowercase();
                }
            }
        }
    }
    if full.is_empty() {
        None
    } else {
        Some((full, detected))
    }
}

mod urlencoding {
    pub fn encode(data: &str) -> String {
        let mut out = String::with_capacity(data.len() * 2);
        for byte in data.bytes() {
            match byte {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    out.push(byte as char);
                }
                _ => {
                    use std::fmt::Write;
                    let _ = write!(out, "%{:02X}", byte);
                }
            }
        }
        out
    }
}
