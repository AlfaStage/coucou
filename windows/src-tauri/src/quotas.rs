// AI usage limits for Coucou — real numbers only.
//
// Inspired by vinzdg/codenotch & steipete/CodexBar. A provider is listed only if
// the user actually has it installed, and a percentage is shown only if a real
// source produced it:
//   · Codex  — the `rate_limits` block Codex itself writes into its local session
//              logs (~/.codex/sessions). Nothing leaves the machine.
//   · Claude — Anthropic's usage endpoint, called with the login Claude Code
//              already stored. That reads a credential, so it stays off until the
//              user switches it on (`quota_claude_live`).
// Nothing is estimated from file sizes and no provider is given an invented number.

use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// id → (last seen percent, epoch second of the last real movement).
static LAST_QUOTAS: Mutex<Option<HashMap<String, (f64, u64)>>> = Mutex::new(None);

/// How long a provider keeps counting as "changed" after its number moved.
const CHANGE_WINDOW_SECS: u64 = 5 * 60;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AiQuotaItem {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub icon: String,
    /// Usage of the short window (the one that hits first), 0–100.
    pub used_percent: f64,
    /// "5 h", "Semana", "Mês"…
    pub window_label: String,
    pub reset_in_minutes: Option<u64>,
    pub weekly_percent: Option<f64>,
    pub weekly_reset_in_minutes: Option<u64>,
    pub changed_recently: bool,
    /// normal | warning | critical
    pub status: String,
    /// live | needs_consent | unavailable
    pub availability: String,
    /// Human explanation when availability is not "live".
    pub note: Option<String>,
}

fn home_dir() -> PathBuf {
    std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("C:\\"))
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn status_for(percent: f64) -> &'static str {
    if percent >= 90.0 {
        "critical"
    } else if percent >= 75.0 {
        "warning"
    } else {
        "normal"
    }
}

fn label_for_window(minutes: u64) -> String {
    match minutes {
        0 => "Janela".into(),
        1..=1440 => format!("{} h", (minutes + 30) / 60),
        10080 => "Semana".into(),
        43200..=44640 => "Mês".into(),
        _ => format!("{} d", minutes / 1440),
    }
}

fn minutes_until(epoch_secs: u64) -> Option<u64> {
    let now = now_secs();
    Some(epoch_secs.saturating_sub(now) / 60).filter(|_| epoch_secs > 0)
}

fn base(id: &str, name: &str, provider: &str, icon: &str) -> AiQuotaItem {
    AiQuotaItem {
        id: id.into(),
        name: name.into(),
        provider: provider.into(),
        icon: icon.into(),
        used_percent: 0.0,
        window_label: String::new(),
        reset_in_minutes: None,
        weekly_percent: None,
        weekly_reset_in_minutes: None,
        changed_recently: false,
        status: "normal".into(),
        availability: "live".into(),
        note: None,
    }
}

// ── Codex ─────────────────────────────────────────────────────────────────────

/// The newest rollout files, newest first. Sessions are stored as
/// sessions/YYYY/MM/DD/rollout-*.jsonl, so only the latest day folders are walked.
fn recent_rollouts(root: &Path, want: usize) -> Vec<PathBuf> {
    fn sorted_dirs(p: &Path) -> Vec<PathBuf> {
        let mut v: Vec<PathBuf> = fs::read_dir(p)
            .map(|r| r.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect())
            .unwrap_or_default();
        v.sort();
        v.reverse();
        v
    }
    let mut files: Vec<(SystemTime, PathBuf)> = Vec::new();
    'outer: for year in sorted_dirs(root) {
        for month in sorted_dirs(&year) {
            for day in sorted_dirs(&month) {
                if let Ok(rd) = fs::read_dir(&day) {
                    for e in rd.flatten() {
                        let p = e.path();
                        let is_rollout = p
                            .file_name()
                            .and_then(|n| n.to_str())
                            .map(|n| n.starts_with("rollout-") && n.ends_with(".jsonl"))
                            .unwrap_or(false);
                        if is_rollout {
                            if let Ok(m) = e.metadata().and_then(|m| m.modified()) {
                                files.push((m, p));
                            }
                        }
                    }
                }
                if files.len() >= want {
                    break 'outer;
                }
            }
        }
    }
    files.sort_by(|a, b| b.0.cmp(&a.0));
    files.into_iter().take(want).map(|(_, p)| p).collect()
}

/// The last `rate_limits` object in a rollout file (only the tail is read).
fn last_rate_limits(path: &Path) -> Option<serde_json::Value> {
    let mut f = fs::File::open(path).ok()?;
    let len = f.metadata().ok()?.len();
    let take = len.min(512 * 1024);
    f.seek(SeekFrom::Start(len - take)).ok()?;
    let mut buf = String::new();
    f.take(take).read_to_string(&mut buf).ok()?;
    buf.lines()
        .rev()
        .filter(|l| l.contains("\"rate_limits\""))
        .find_map(|l| {
            let v: serde_json::Value = serde_json::from_str(l).ok()?;
            let rl = v.get("payload")?.get("rate_limits")?.clone();
            rl.get("primary").filter(|p| p.is_object())?;
            Some(rl)
        })
}

fn window_of(v: &serde_json::Value) -> Option<(f64, u64, Option<u64>)> {
    let used = v.get("used_percent")?.as_f64()?;
    let minutes = v.get("window_minutes").and_then(|x| x.as_u64()).unwrap_or(0);
    let reset = v
        .get("resets_at")
        .and_then(|x| x.as_u64())
        .and_then(minutes_until)
        .or_else(|| v.get("resets_in_seconds").and_then(|x| x.as_u64()).map(|s| s / 60));
    Some((used, minutes, reset))
}

fn read_codex() -> Option<AiQuotaItem> {
    let root = home_dir().join(".codex").join("sessions");
    if !root.is_dir() {
        return None; // Codex isn't installed: don't invent a card for it
    }
    let mut item = base("codex", "Codex", "OpenAI", "openai");
    let found = recent_rollouts(&root, 4).iter().find_map(|p| last_rate_limits(p));
    let Some(rl) = found else {
        item.availability = "unavailable".into();
        item.note = Some("Use o Codex uma vez para aparecer aqui.".into());
        return Some(item);
    };
    let (used, minutes, reset) = window_of(rl.get("primary")?)?;
    item.used_percent = used.clamp(0.0, 100.0);
    item.window_label = label_for_window(minutes);
    item.reset_in_minutes = reset;
    if let Some((w_used, w_min, w_reset)) = rl.get("secondary").filter(|s| s.is_object()).and_then(window_of) {
        item.weekly_percent = Some(w_used.clamp(0.0, 100.0));
        item.weekly_reset_in_minutes = w_reset;
        if item.window_label.is_empty() {
            item.window_label = label_for_window(w_min);
        }
    }
    item.status = status_for(item.used_percent.max(item.weekly_percent.unwrap_or(0.0))).into();
    Some(item)
}

// ── Claude ────────────────────────────────────────────────────────────────────

/// Days since 1970-01-01 for a civil date (Howard Hinnant's algorithm).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

/// "2025-11-06T15:00:00.123+00:00" / "...Z" → epoch seconds.
fn parse_iso8601(s: &str) -> Option<u64> {
    let (date, rest) = s.split_once('T')?;
    let mut dp = date.split('-').map(|x| x.parse::<i64>().ok());
    let (y, mo, d) = (dp.next()??, dp.next()??, dp.next()??);
    let time_end = rest.find(|c| c == 'Z' || c == '+' || c == '-').unwrap_or(rest.len());
    let (time, zone) = rest.split_at(time_end);
    let mut tp = time.split(':');
    let hh: i64 = tp.next()?.parse().ok()?;
    let mm: i64 = tp.next()?.parse().ok()?;
    let ss: f64 = tp.next().unwrap_or("0").parse().ok()?;
    let mut secs = days_from_civil(y, mo, d) * 86400 + hh * 3600 + mm * 60 + ss as i64;
    if let Some(sign) = zone.chars().next().filter(|c| *c == '+' || *c == '-') {
        let z = &zone[1..];
        let (zh, zm) = z.split_once(':').unwrap_or((z, "0"));
        let off = zh.parse::<i64>().ok()? * 3600 + zm.parse::<i64>().ok()? * 60;
        secs -= if sign == '+' { off } else { -off };
    }
    u64::try_from(secs).ok()
}

fn claude_window(v: &serde_json::Value) -> Option<(f64, Option<u64>)> {
    let used = v.get("utilization")?.as_f64()?;
    let reset = v
        .get("resets_at")
        .and_then(|x| x.as_str())
        .and_then(parse_iso8601)
        .and_then(minutes_until);
    Some((used, reset))
}

async fn read_claude(live: bool) -> Option<AiQuotaItem> {
    let cred_path = home_dir().join(".claude").join(".credentials.json");
    if !cred_path.is_file() {
        return None; // Claude Code isn't logged in here
    }
    let mut item = base("claude", "Claude Code", "Anthropic", "claude");
    if !live {
        item.availability = "needs_consent".into();
        item.note = Some("Toque para ler o uso real usando o login do Claude Code.".into());
        return Some(item);
    }
    let unavailable = |mut item: AiQuotaItem, why: &str| {
        item.availability = "unavailable".into();
        item.note = Some(why.into());
        Some(item)
    };
    let Ok(raw) = fs::read_to_string(&cred_path) else {
        return unavailable(item, "Não consegui ler o login do Claude Code.");
    };
    let creds: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();
    let oauth = creds.get("claudeAiOauth");
    let token = oauth.and_then(|o| o.get("accessToken")).and_then(|t| t.as_str());
    let Some(token) = token else {
        return unavailable(item, "Faça login no Claude Code para ver o uso.");
    };
    let expired = oauth
        .and_then(|o| o.get("expiresAt"))
        .and_then(|e| e.as_u64())
        .map(|ms| ms / 1000 <= now_secs())
        .unwrap_or(false);
    if expired {
        return unavailable(item, "Abra o Claude Code uma vez para renovar o login.");
    }

    let client = reqwest::Client::builder().timeout(Duration::from_secs(8)).build().ok()?;
    let resp = client
        .get("https://api.anthropic.com/api/oauth/usage")
        .bearer_auth(token)
        .header("anthropic-beta", "oauth-2025-04-20")
        .send()
        .await;
    let body: serde_json::Value = match resp {
        Ok(r) if r.status().is_success() => r.json().await.unwrap_or_default(),
        _ => return unavailable(item, "Não consegui consultar o uso agora."),
    };
    let Some((used, reset)) = body.get("five_hour").and_then(claude_window) else {
        return unavailable(item, "O Claude não informou o uso desta conta.");
    };
    item.used_percent = used.clamp(0.0, 100.0);
    item.window_label = "5 h".into();
    item.reset_in_minutes = reset;
    if let Some((w, r)) = body.get("seven_day").and_then(claude_window) {
        item.weekly_percent = Some(w.clamp(0.0, 100.0));
        item.weekly_reset_in_minutes = r;
    }
    item.status = status_for(item.used_percent.max(item.weekly_percent.unwrap_or(0.0))).into();
    Some(item)
}

// ── Aggregate ─────────────────────────────────────────────────────────────────

pub async fn get_ai_quotas(claude_live: bool) -> Vec<AiQuotaItem> {
    let mut items: Vec<AiQuotaItem> = Vec::new();
    if let Some(c) = read_claude(claude_live).await {
        items.push(c);
    }
    if let Some(c) = tokio::task::spawn_blocking(read_codex).await.ok().flatten() {
        items.push(c);
    }

    // A provider "changed" for five minutes after its real number moved, or when it
    // is already in alert territory the first time we see it.
    let now = now_secs();
    let mut lock = LAST_QUOTAS.lock().unwrap();
    let mut next = HashMap::new();
    for item in items.iter_mut().filter(|i| i.availability == "live") {
        let (pct, moved_at) = match lock.as_ref().and_then(|prev| prev.get(&item.id)) {
            Some(&(old, at)) if (item.used_percent - old).abs() < 1.0 => (old, at),
            Some(_) => (item.used_percent, now),
            None => (item.used_percent, if item.status != "normal" { now } else { 0 }),
        };
        item.changed_recently = moved_at > 0 && now.saturating_sub(moved_at) < CHANGE_WINDOW_SECS;
        next.insert(item.id.clone(), (pct, moved_at));
    }
    *lock = Some(next);
    items
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_parses_utc_and_offsets() {
        assert_eq!(parse_iso8601("1970-01-02T00:00:00Z"), Some(86400));
        assert_eq!(parse_iso8601("1970-01-01T01:00:00+01:00"), Some(0));
        assert_eq!(parse_iso8601("2025-11-06T15:00:00.123456+00:00"), Some(1762441200));
    }

    /// Reads this machine's real Codex logs: `cargo test --lib -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn reads_the_real_codex_limits() {
        let item = read_codex();
        println!("{item:#?}");
        assert!(item.is_none() || item.unwrap().used_percent <= 100.0);
    }

    #[test]
    fn window_labels() {
        assert_eq!(label_for_window(300), "5 h");
        assert_eq!(label_for_window(10080), "Semana");
    }
}
