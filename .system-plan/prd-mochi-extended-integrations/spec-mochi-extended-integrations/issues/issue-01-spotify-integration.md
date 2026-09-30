# Issue: Native Spotify Desktop Integration

## 1. Traceability
- **Parent Spec:** `/.system-plan/prd-mochi-extended-integrations/spec-mochi-extended-integrations/spec.md`
- **Issue Number:** #01
- **Issue Type:** Backend Media Hook & UI Player Component

## 2. Task Description
Implement native desktop Spotify control and status monitoring using the Windows GSMTC (Global System Media Transport Controls) API. Provides zero-token, zero-latency playback control (play/pause, next, previous, volume) and extracts current song title, artist, album, and thumbnail cover art. Embeds Spotify controls inside Coucou's overview and island card, and connects Mochi's head-bobbing / dancing state when music is playing.

## 3. The Sandbox (MANDATORY FILE LIMITS)
### Files to Create:
- `windows/src-tauri/src/spotify.rs`: Rust module implementing GSMTC session listener, media commands, and thumbnail extraction.
- `windows/src/views/spotify.ts`: UI card rendering Spotify album art, playback controls, track title ticker, and volume slider.

### Files to Modify:
- `windows/src-tauri/Cargo.toml`: Enable `Media_Control`, `Storage_Streams` in `windows` dependency.
- `windows/src-tauri/src/lib.rs`: Register Tauri commands for Spotify control.
- `windows/src/core/state.ts`: Add `SpotifyPlaybackState` interface and reactive state handler.
- `windows/src/views/icons.ts`: Add Spotify logo and media playback icons (play, pause, skip forward, skip back).

## 4. Required Imports & Reusability
- Import `h`, `svg`, `dot`, `clear` from `windows/src/views/dom.ts`
- Import `ICONS` from `windows/src/views/icons.ts`
- Import `card`, `btn`, `stack`, `ViewHost`, `ViewActions` from `windows/src/views/views.ts`
- Import `SpotifyPlaybackState` from `windows/src/core/state.ts`

## 5. Step-by-Step Execution Plan
- [ ] **Step 1:** Enable `Media_Control` & `Storage_Streams` in `windows/src-tauri/Cargo.toml`.
- [ ] **Step 2:** Write `windows/src-tauri/src/spotify.rs` using `GlobalSystemMediaTransportControlsSessionManager` to query current playback info, album art stream, and control playback asynchronously.
- [ ] **Step 3:** Expose Tauri commands: `spotify_get_state`, `spotify_play_pause`, `spotify_next`, `spotify_prev`, `spotify_set_volume`.
- [ ] **Step 4:** Implement `windows/src/views/spotify.ts` with album art display, track info ticker, playback buttons, and volume bar.
- [ ] **Step 5:** Connect Mochi's state: trigger `happy`/`bounces: true` when music is actively playing.

## 6. Definition of Done (Acceptance Criteria)
- [ ] Code successfully controls local desktop Spotify playback without requiring Spotify API developer credentials.
- [ ] NO files outside the Sandbox section were modified.
- [ ] Album art, track title, and artist name update dynamically when track changes.
- [ ] Thin Client / Fat Server rule enforced: OS media calls stay entirely within Rust.
- [ ] Clean error handling when Spotify is closed or not actively playing.
