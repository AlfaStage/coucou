# Issue: Super-Fast Local Whisper STT & Voice Typing

## 1. Traceability
- **Parent Spec:** `/.system-plan/prd-mochi-extended-integrations/spec-mochi-extended-integrations/spec.md`
- **Issue Number:** #04
- **Issue Type:** Audio Capture, Local Speech-to-Text & Input Injection

## 2. Task Description
Implement a fast, lightweight, and offline speech-to-text dictation engine using a local Whisper model (tiny/base quantized). Activated by a hotkey or header microphone button. Transcribes the user's voice in real-time. Supports two distinct modes: Mode A (types directly into the active external window via Windows `SendInput`), and Mode B (populates Mochi's prompt box for easy copying or AI inquiry). Mochi enters a glowing cyan listening state with soundwave animations while recording.

## 3. The Sandbox (MANDATORY FILE LIMITS)
### Files to Create:
- `windows/src-tauri/src/whisper.rs`: Rust module for microphone capture (WASAPI/Windows audio), silence detection, lightweight STT transcription, and keyboard event simulation (`SendInput`).

### Files to Modify:
- `windows/src-tauri/Cargo.toml`: Add audio capture and keyboard injection features.
- `windows/src-tauri/src/lib.rs`: Register Tauri commands for toggling listening state.
- `windows/src-tauri/src/win_user.rs`: Add Unicode `SendInput` simulation helper.
- `windows/src/core/state.ts`: Add `WhisperState` tracking.
- `windows/src/views/icons.ts`: Add microphone icon (`mic`, `micActive`).
- `windows/src/views/views.ts`: Add microphone button to Island header with pulsating active indicator.

## 4. Required Imports & Reusability
- Import `h`, `svg`, `clear` from `windows/src/views/dom.ts`
- Import `ICONS` from `windows/src/views/icons.ts`
- Import `ViewHost`, `ViewActions` from `windows/src/views/views.ts`
- Import `WhisperState` from `windows/src/core/state.ts`

## 5. Step-by-Step Execution Plan
- [ ] **Step 1:** Implement Win32 `SendInput` helper with `KEYEVENTF_UNICODE` in `windows/src-tauri/src/win_user.rs` to allow typing Unicode strings into any active window.
- [ ] **Step 2:** Write `windows/src-tauri/src/whisper.rs` handling audio capture from the default microphone, silence detection, and local STT execution.
- [ ] **Step 3:** Expose Tauri commands: `whisper_start_listening(mode)`, `whisper_stop_listening()`.
- [ ] **Step 4:** Add microphone trigger button to the island header next to the volume/mute toggle.
- [ ] **Step 5:** Wire Mochi listening feedback: glowing cyan halo, listening eyes, and audio blip on start/stop.
- [ ] **Step 6:** Emit transcription to active window if Mode A, or to Mochi's prompt input if Mode B.

## 6. Definition of Done (Acceptance Criteria)
- [ ] Dictation works locally on the CPU with 0 cloud AI tokens consumed.
- [ ] Accented Portuguese characters and punctuation type accurately into active text fields.
- [ ] Mochi visually reflects the listening state with distinct color and animation.
- [ ] Microphone resource is cleanly released when recording stops.
- [ ] NO files outside the Sandbox section were modified.
