# Technical Specification (Spec) — Mochi Extended Integrations

## 1. Context & Traceability
- **Parent PRD:** `/.system-plan/prd-mochi-extended-integrations/PRD.md`
- **Target Feature:** AI Quota Notch, Local Whisper STT, Smart Translator, App Switcher, Native Spotify Desktop
- **Spec Status:** Draft (Awaiting User Approval)

---

## 2. Reusability Analysis (MANDATORY SEARCH PHASE)
*Codebase inspection verified existing modular architectures:*
- **Existing UI Components & Helpers to Reuse:**
  - `windows/src/views/dom.ts`: Reuse `h`, `svg`, `clear`, `dot` helper functions.
  - `windows/src/views/views.ts`: Reuse `card`, `btn`, `stack`, `agentWho`, `ViewHost`, `ViewActions` contracts.
  - `windows/src/views/icons.ts`: Follow existing 24x24 SVG coordinate standard for new icons.
  - `windows/src/mochi/engine.ts`: Reuse `BotEngine`, `BOT_STATES`, `EyeShape`, particles, tweens for Mochi's musical, listening, and quota states.
  - `windows/src/core/anim.ts`: Reuse `Tracked`, `Spring`, `lerp`, `Ease` for smooth animations.
- **Existing Backend Modules to Reuse:**
  - `windows/src-tauri/src/integrations.rs`: Reuse background spawn/polling pattern with delay, intervals, and paused gate.
  - `windows/src-tauri/src/win_user.rs`: Reuse Win32 window APIs, extending them with `EnumWindows` and `SetForegroundWindow`.
  - `windows/src-tauri/src/secrets.rs`: Reuse Windows Credential Manager (`keyring`) for optional provider API keys.
  - `windows/src-tauri/src/log.rs`: Reuse structured low-token file logger.
- **External Dependencies:**
  - `windows` crate features: `Media_Control`, `Storage_Streams`, `Win32_UI_Shell`, `Win32_UI_Input_KeyboardAndMouse` (already in workspace, activate features for native Win10/11 media & window control).
  - High-speed, tokenless translation via lightweight HTTP client or local fallback.
  - Local whisper audio engine via lightweight audio capture and bundled whisper engine.

---

## 3. Data Models & State Schema

### A. TypeScript Frontend Interfaces (`windows/src/core/state.ts`)
```typescript
export interface AiQuotaItem {
  id: string;             // "claude_code", "cursor", "codex", "antigravity", etc.
  name: string;           // "Claude Code", "Cursor", "OpenAI Codex", "Antigravity"
  usedPercent: number;    // 0 - 100
  usedLabel: string;      // e.g. "45 / 500 requests" or "$12.40 / $50.00"
  resetIn: string;        // e.g. "3h 24m"
  changedRecently: boolean;
  status: "normal" | "warning" | "critical";
  lastUpdated: number;
}

export interface SpotifyPlaybackState {
  title: string;
  artist: string;
  album: string;
  albumArtBase64: string | null;
  isPlaying: boolean;
  volume: number;         // 0.0 - 1.0
  nextTrackTitle?: string | null;
  nextTrackArtist?: string | null;
}

export interface AppShortcutItem {
  id: string;
  name: string;
  icon: string;           // SVG string or base64 icon
  exePath: string;
  isOpen: boolean;
  hwnd?: number;
}

export interface WhisperState {
  isListening: boolean;
  mode: "direct" | "chat"; // "direct" sends input to active window, "chat" sends to Mochi
  transcription: string;
  partialText: string;
}

export interface TranslationItem {
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  isTranslating: boolean;
}
```

---

## 4. API & Backend Contracts (Tauri Commands)

### 1. Spotify Control (`windows/src-tauri/src/spotify.rs`)
- `spotify_get_state() -> Result<SpotifyPlaybackState, String>`
- `spotify_play_pause() -> Result<bool, String>`
- `spotify_next() -> Result<bool, String>`
- `spotify_prev() -> Result<bool, String>`
- `spotify_set_volume(volume: f32) -> Result<(), String>`

### 2. App Launcher & Switcher (`windows/src-tauri/src/apps.rs`)
- `list_app_shortcuts() -> Result<Vec<AppShortcutItem>, String>`
- `launch_or_focus_app(app_id: String) -> Result<bool, String>`
- `pin_app_shortcut(exe_path: String) -> Result<(), String>`

### 3. Smart Translator (`windows/src-tauri/src/translator.rs`)
- `translate_text(text: String, source_lang: Option<String>, target_lang: Option<String>) -> Result<TranslationResult, String>`
- `get_system_language() -> String`

### 4. Local Whisper STT (`windows/src-tauri/src/whisper.rs`)
- `whisper_start_listening(target_mode: String) -> Result<(), String>`
- `whisper_stop_listening() -> Result<String, String>`
- Tauri Event: `whisper-chunk` (emitted during speech), `whisper-final` (transcribed text)

### 5. AI Limits / Quotas (`windows/src-tauri/src/quotas.rs`)
- `get_ai_quotas() -> Result<Vec<AiQuotaItem>, String>`
- Tauri Event: `ai-quotas-update` (emitted on background check when quota changes)

---

## 5. Strict File Manifest

### A. Files to Create
1. `windows/src/views/spotify.ts`: Spotify player card with cover art, playback controls, and volume.
2. `windows/src/views/quotas.ts`: AI Limits dashboard with circular progress rings and reset timers.
3. `windows/src/views/translator.ts`: Smart clipboard translator view with auto-detect and quick copy.
4. `windows/src/views/apps.ts`: Shortcuts & window switcher grid showing open vs closed apps.
5. `windows/src-tauri/src/spotify.rs`: Rust native module leveraging Windows GSMTC for Spotify control.
6. `windows/src-tauri/src/quotas.rs`: Rust module parsing local quota databases & cache files.
7. `windows/src-tauri/src/translator.rs`: Fast zero-token translation engine with language detection.
8. `windows/src-tauri/src/apps.rs`: Process & window manager module for app launching/switching.
9. `windows/src-tauri/src/whisper.rs`: Local Whisper capture, STT pipeline, and SendInput simulation.

### B. Files to Modify
1. `windows/src-tauri/Cargo.toml`: Enable necessary Windows crate features (`Media_Control`, `Storage_Streams`, `Win32_UI_Shell`).
2. `windows/src-tauri/src/lib.rs`: Register new commands and spawn Spotify & Quota background workers.
3. `windows/src-tauri/src/win_user.rs`: Add Win32 window focus, restore, and SendInput keyboard simulation.
4. `windows/src/core/state.ts`: Add data models, state storage, and initial values for new features.
5. `windows/src/core/layout.ts`: Add new view keys (`spotify`, `quotas`, `translator`, `apps`) and dimension profiles.
6. `windows/src/views/icons.ts`: Add SVGs for Spotify, Quota ring, Translate, Mic, and App Grid.
7. `windows/src/views/views.ts`: Add tabs to header and instantiate the new views in view map.
8. `windows/src/mochi/engine.ts`: Add Mochi musical dancing state, listening glow, and quota alert reactions.
9. `windows/src/style.css`: Add styles for circular progress meters, album art, app grid tiles, and translator card.

---

## 6. Implementation Strategy & Logic
- **Thin Client / Fat Server:** The webview only issues clean events. All hardware, Win32 API calls, file parsing, and background timers execute in compiled Rust.
- **GSMTC Local Zero-Token:** Windows GSMTC provides title, artist, playback status, and thumbnail stream without any Spotify API rate limits or tokens.
- **Smart Quota Filtering:** Frontend maintains a state diff of `usedPercent`. Only providers whose value changed in the last poll appear as circular pills in the glanceable notch area.
- **Whisper CPU Optimization:** Runs tiny/base quantized model on local CPU. Audio input is captured via standard Windows WASAPI with silence cutoff.
- **SendInput Simulation:** For direct voice typing, uses Windows `SendInput` with `KEYEVENTF_UNICODE` so accents, emojis, and all UTF-16 characters type instantly into the focused application.

---

## 7. Proposed Issue Breakdown
1. **Issue 01:** Native Spotify Desktop Integration (GSMTC, media controls, cover art, Mochi dancing)
2. **Issue 02:** App Shortcuts & Window Switcher Tab (Window enumeration, focus, launcher)
3. **Issue 03:** Smart Clipboard & Multi-Language Translator (Zero-token engine, auto-detect, copy)
4. **Issue 04:** Super-Fast Local Whisper STT (Audio capture, local transcription, SendInput typing)
5. **Issue 05:** AI Quotas Notch (Codenotch/CodexBar local caching, circular progress rings, smart change pill)
6. **Issue 06:** Mochi Expressions, System Integration, Settings & Polish (Animations, sounds, styling)
