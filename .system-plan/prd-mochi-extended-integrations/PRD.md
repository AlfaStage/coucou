# Product Requirements Document (PRD) — Mochi Extended Integrations

## 1. Meta Information
- **Feature/App Name:** Mochi Extended Integrations (AI Quota Notch, Local Whisper STT, Smart Translator, App Switcher, Native Spotify)
- **Status:** Draft (Awaiting User Approval)
- **Primary Objective:** Expand Coucou Windows and its central character Mochi into a high-utility, zero-token-first desktop companion. Integrates multi-provider AI quota monitoring with smart-change circular rings, ultra-fast local Whisper voice dictation, instant multi-language translation, a quick app launcher/window switcher, and native desktop Spotify playback control with reactive Mochi animations.

---

## 2. Actors & Permissions
- **Desktop User:** The active Windows user sitting at the PC. Has full control over Mochi, keyboard shortcuts, media playback, dictation triggers, and clipboard operations.
- **Background Pollers (Rust Backend):** Asynchronous background workers running in Tauri that query local cache files (Cursor, Claude Code, Antigravity), Windows GSMTC media session, and free zero-token APIs without blocking the UI thread or consuming cloud AI tokens.
- **Native OS Environment (Win32 / WinRT):** Interacts securely with Windows Audio (microphones), Windows Media Manager (Spotify), Windows Window Manager (window focus / restoration), and Windows Input (SendInput for voice typing).

---

## 3. User Stories & Workflows

### Workflow 1: AI Limits & Smart Quota Pills (Codenotch / CodexBar Pattern)
1. **Background Polling:** Tauri backend inspects local cached quotas for Claude Code (`~/.claude`), Cursor (`state.vscdb`), Codex, Antigravity, and configured API providers every interval.
2. **Smart Pill Display:** The compact island header does **NOT** overwhelm the user with all providers. It dynamically shows circular progress rings ONLY for providers whose quota percentage has changed since the last check or exceeded a warning threshold (>80%).
3. **Mochi Reaction:** 
   - Normal/High quota: Mochi is calm (`idle`/`happy`).
   - Quota changed: Mochi performs a quick visual blip/nod with circular badge update.
   - Critical rate limit (>90% or exhausted): Mochi shifts to `ratelimit` (sweat particles, tired eyes, warning amber/red badge).
4. **Expanded AI Limits Card:** Clicking the quota pill or selecting the Limits tab opens a complete dashboard showing all providers, % consumed, remaining tokens/requests, reset countdowns, and quick links to dashboards.

### Workflow 2: Super-Fast Local Whisper Dictation (Zero-Token Voice-to-Text)
1. **Trigger:** User presses a customizable global hotkey (e.g., `Win+Alt+D` or clicks the microphone icon in Mochi's header).
2. **Listening State:** Mochi enters listening mode with a glowing cyan/violet pulse aura, listening ears/waves, and acoustic sound blip.
3. **Local Processing:** High-speed, lightweight local Whisper model transcribes audio in real time on the CPU (0 cloud tokens).
4. **Target Destination (Two Modes):**
   - **Mode A (Direct Dictation):** Simulates keyboard input (`SendInput`) into whichever external application window was active before the trigger (e.g., Word, VS Code, Browser, Slack).
   - **Mode B (Mochi Chat / Search):** Types directly into Mochi's prompt box for instant copying, translation, or AI inquiry.
5. **Completion:** Mochi blips happily, sound confirmation plays, and transcription is ready.

### Workflow 3: Multi-Language Clipboard & Quick Translator
1. **Trigger & Auto-Detection:** User opens the Translator tab or pastes text into Mochi's translation card.
2. **Language Resolution:**
   - Detects source text language.
   - If foreign language -> translates to system default language (e.g. Portuguese pt-BR).
   - If already system default language -> automatically translates to English (en-US) by default.
   - User can easily toggle/swap source and target languages from a dropdown pill.
3. **Zero-Token Engine:** Executes translation via high-speed, free tokenless endpoint / local engine with 0 LLM token cost. Fallback to Claude AI only if user explicitly requests deep semantic nuance.
4. **Output & Copy:** Displays source and translated text with a single-click "Copy" button. Mochi shows thinking/reading glasses animation during processing.

### Workflow 4: App Shortcuts & Window Switcher Tab
1. **Navigation:** User clicks the new "Apps" tab in the Island header.
2. **App Grid:** Shows curated and installed apps (Spotify, Chrome, VS Code, Terminal, Notion, Discord, etc.).
3. **Smart Switch vs Launch:**
   - If the app is **already open**: Clicking the icon instantly restores and brings that window to the foreground (`SetForegroundWindow`), eliminating alt-tab hunting.
   - If the app is **not open**: Clicking the icon launches the app executable cleanly in the background.
4. **Mochi Reaction:** Mochi looks towards the selected app and does a cheerful wave.

### Workflow 5: Native Spotify Desktop Integration
1. **Local Media Hook:** Uses Windows GSMTC (Global System Media Transport Controls) to communicate with Spotify Desktop natively (100% offline, zero OAuth setup required, zero token cost).
2. **Island Display:**
   - When playing: Header displays a green Spotify mini-pill with musical notes or pulsating equalizer.
   - Overview Card: Displays album art thumbnail, track title, artist name, and if available, next track preview.
3. **Controls:** Instant Play/Pause, Next Track, Previous Track, and Volume slider.
4. **Mochi Reaction:** Mochi bobs head / dances (`bounces: true`, `happy` eyes, musical note particles) while music is actively playing.

---

## 4. UI/UX & Pages Structure
- **Design System Fidelity:** Strictly inherits Coucou's dark frosted glass (`#10131A` / `rgba(22, 24, 30, 0.85)`), subtle borders (`rgba(255,255,255,0.08)`), Inter font, smooth spring physics, and 24x24 icons.
- **Island Header Tabs:**
  - `Overview (House)`: Claude Code, integrations, and Spotify live widget.
  - `Ask / Chat (Bubble)`: AI Chat and Ask assistant.
  - `Apps (Grid)`: App launcher & window switcher.
  - `Translator (Translate icon)`: Smart clipboard translator.
  - `AI Limits (Pie/Ring icon)`: Quota dashboard.
  - `Drop (Plus)`: File drop & inspect.
- **Mic Quick-Action:** Mic icon in header next to mute/settings for instant dictation toggle.
- **Circular Indicators:** SVG stroke-dasharray progress circles with percentage tooltip for quotas.

---

## 5. Business Rules & Security Constraints
- **Zero-Token Priority:** Tasks that can be achieved deterministically (media controls, window management, audio transcription, language translation, quota reading) must consume 0 AI tokens.
- **Thin Client / Fat Server:** UI only renders state and triggers events. Audio capture, OS window enumeration, GSMTC hooks, and local file parsing run in Tauri Rust.
- **No Credential Exposure:** Any optional API keys (e.g. OpenAI, Anthropic, Custom providers) are stored strictly in Windows Credential Manager (`keyring` crate) and never written in plain text or emitted to logs.
- **Non-Blocking Operation:** All pollers run asynchronously with backoff. Network errors or sleeping apps never freeze the island or Claude Code hooks.

---

## 6. Out of Scope
- Building a full cloud-based media streaming service (Coucou controls local Spotify, it does not re-stream audio).
- Heavy GPU training workloads (Whisper uses a lightweight quantized CPU model `tiny` or `base`).
- Replacing full Windows Task Manager (Shortcuts focus on quick-access everyday applications).

---

## 7. Future Considerations
- Support for additional media players (Apple Music, YouTube in Chrome, Foobar2000) via the same GSMTC infrastructure.
- Local custom hotkeys configuration in Settings window.
