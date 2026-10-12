// Thin wrapper over the Tauri commands/events. Every call is a no-op when the
// page is opened in a plain browser, so the island can be iterated on with
// `npm run dev` alone.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { AiQuotaItem, AppShortcutItem, Settings, SpotifyPlaybackState } from "./state";

export const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!IS_TAURI) return null;
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.error(`[coucou] ${cmd} failed`, err);
    return null;
  }
}

export interface BootInfo {
  settings: Settings;
  /** Logical screen rect of the monitor the island lives on. */
  screen: { x: number; y: number; width: number; height: number; scale: number };
  version: string;
  hookPath: string;
}

export const Bridge = {
  boot: () => call<BootInfo>("boot"),

  saveSettings: (settings: Settings) => call<void>("save_settings", { settings }),

  /** Shrink the window down to the invisible wake strip (hidden) or back to full. */
  setCollapsed: (collapsed: boolean) => call<void>("set_collapsed", { collapsed }),

  /**
   * Pushes the island shape in window coordinates. Rust flips click-through from
   * its own cursor poll, so the flag is never a frame behind a click.
   */
  setIslandRect: (x: number, y: number, width: number, height: number) =>
    call<void>("set_island_rect", { x, y, width, height }),

  /** Give the window keyboard focus (chat field) and take it away again. */
  focusWindow: (focused: boolean) => call<void>("focus_window", { focused }),

  reposition: () => call<void>("reposition"),

  openUrl: (url: string) => call<void>("open_url", { url }),

  /** "Open terminal" → opens the folder in VS Code when `code` is on PATH. */
  openInVSCode: (path: string | null) => call<boolean>("open_in_vscode", { path }),

  quit: () => call<void>("quit_app"),

  openSettingsWindow: () => call<void>("open_settings_window"),

  /** Writes to %LOCALAPPDATA%\Coucou\coucou.log, next to the Rust lines. */
  log: (message: string) => call<void>("log_line", { message }),

  // ── Claude Code hooks ─────────────────────────────────────────────────────
  hooksStatus: () => call<HookStatus>("hooks_status"),
  /** Diff to show before anything is written. `install: false` previews removal. */
  hooksPreview: (install: boolean) => callOrThrow<HookPreview>("hooks_preview", { install }),
  /**
   * Writes ~/.claude/settings.json — only ever after an explicit click, and only
   * when the file still matches the preview the user looked at.
   */
  hooksApply: (install: boolean, fingerprint: string) =>
    callOrThrow<string>("hooks_apply", { install, fingerprint }),

  approvalDecision: (requestId: string, decision: "allow" | "deny") =>
    call<void>("approval_decision", { requestId, decision }),
  /** "The card is up" — until this lands the relay only waits a moment. */
  approvalAck: (requestId: string) => call<void>("approval_ack", { requestId }),
  /** "Nobody can act on this" — Claude Code asks in the terminal right away. */
  approvalDecline: (requestId: string) => call<void>("approval_decline", { requestId }),

  // ── Chat, files, secrets ──────────────────────────────────────────────────
  /** One chat turn. The API key and any file bytes never leave Rust. */
  chatSend: (query: string, context: ChatContext | null) =>
    callOrThrow<{ text: string }>("chat_send", { query, context }),
  chatReset: () => call<void>("chat_reset"),
  /** Copies a dropped file into the inbox. */
  ingestFile: (path: string) => callOrThrow<DroppedFile>("ingest_file", { path }),
  /** Only ever tells you whether a key exists — never its value. */
  secretPresent: (key: string) => call<boolean>("secret_present", { key }),
  secretSet: (key: string, value: string) => callOrThrow<void>("secret_set", { key, value }),
  secretClear: (key: string) => callOrThrow<void>("secret_clear", { key }),

  // ── Integrations ──────────────────────────────────────────────────────────
  refreshIntegration: (id: string) => call<void>("refresh_integration", { id }),
  /** Opens the configured n8n instance in the browser. */
  openN8n: () => call<void>("open_n8n"),

  /** Tray → Pause. Stops the integration pollers, not just the island. */
  setPaused: (paused: boolean) => call<void>("set_paused", { paused }),

  // ── Spotify ───────────────────────────────────────────────────────────────
  // Everything below talks to the real system through Rust. Outside the Coucou
  // window (a plain browser) there is no system to ask, so each call returns
  // nothing — never invented data.
  spotifyGetState: () => call<SpotifyPlaybackState>("spotify_get_state"),
  spotifyPlayPause: async () => (await call<boolean>("spotify_play_pause")) ?? false,
  spotifyNext: async () => (await call<boolean>("spotify_next")) ?? false,
  spotifyPrev: async () => (await call<boolean>("spotify_prev")) ?? false,
  /** Spotify's own volume, 0–1 (null while it isn't making sound). */
  spotifyGetVolume: async (): Promise<number | null> => (await call<number | null>("spotify_get_volume")) ?? null,
  spotifySetVolume: async (level: number): Promise<boolean> =>
    (await call<boolean>("spotify_set_volume", { level })) ?? false,

  // ── Apps & Switcher ────────────────────────────────────────────────────────
  listAppShortcuts: () => call<AppShortcutItem[]>("list_app_shortcuts"),
  searchApps: async (query: string): Promise<AppShortcutItem[]> =>
    (await call<AppShortcutItem[]>("search_apps", { query })) ?? [],
  togglePinApp: async (appId: string): Promise<string[]> =>
    (await call<string[]>("toggle_pin_app", { appId })) ?? [],
  launchOrFocusApp: async (appId: string) => (await call<boolean>("launch_or_focus_app", { appId })) ?? false,

  // ── Clipboard history (Windows, Win+V) ─────────────────────────────────────
  /** Throws the reason in plain language (history off, access denied…). */
  clipboardHistory: () => callOrThrow<ClipboardItem[]>("clipboard_history"),
  clipboardPaste: (id: string) => callOrThrow<void>("clipboard_paste", { id }),

  // ── Global shortcuts ───────────────────────────────────────────────────────
  hotkeyStatus: () => call<HotkeyStatus>("hotkey_status"),
  setHotkeys: (toggle: string, dictate: string) => call<HotkeyStatus>("set_hotkeys", { toggle, dictate }),

  // ── Smart Translator ───────────────────────────────────────────────────────
  translateText: (text: string, sourceLang = "auto", targetLang = "pt") =>
    call<TranslationResult>("translate_text", { text, sourceLang, targetLang }),
  getSystemLanguage: async () => (await call<string>("get_system_language")) ?? "pt",

  // ── Local Whisper Speech-to-Text ───────────────────────────────────────────
  whisperStatus: async (): Promise<WhisperEngineStatus | null> => call<WhisperEngineStatus>("whisper_status"),
  /** Starts the one-time download of the speech engine; progress arrives as `whisper-setup`. */
  whisperSetup: () => call<void>("whisper_setup"),
  /** `wavBase64` is a 16 kHz mono WAV. Throws a plain-language message when nothing could be transcribed. */
  whisperTranscribe: (wavBase64: string, mode: "type" | "copy", lang?: string) =>
    callOrThrow<string>("whisper_transcribe", { wavBase64, mode, lang }),
  typeTextIntoActiveWindow: async (text: string): Promise<void> => {
    await call<void>("type_text_into_active_window", { text });
  },

  // ── AI Quotas & Limits ─────────────────────────────────────────────────────
  getAiQuotas: () => call<AiQuotaItem[]>("get_ai_quotas"),
};

export interface WhisperEngineStatus {
  /** ready | needs_setup | setting_up */
  state: "ready" | "needs_setup" | "setting_up";
  downloadMb: number;
}

export interface WhisperSetupProgress {
  stage: "downloading" | "unpacking" | "done" | "error";
  percent: number;
  message?: string | null;
}

export interface ClipboardItem {
  id: string;
  kind: "text" | "image" | "other";
  text: string;
  /** Epoch milliseconds. */
  copiedAt: number;
}

export interface HotkeyState {
  combo: string;
  ok: boolean;
  error?: string | null;
}

export interface HotkeyStatus {
  toggle: HotkeyState;
  dictate: HotkeyState;
}

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  detectedSourceLang: string;
  targetLang: string;
  isFallback: boolean;
}

export interface IntegrationUpdate {
  id: string;
  data: Record<string, unknown>;
  error: string | null;
  event: { success: boolean; label: string; detail: string | null } | null;
}

export type ChatContext =
  | { kind: "file"; name: string; path: string }
  | { kind: "window"; appName: string; title: string; url?: string };

export interface DroppedFile {
  name: string;
  path: string;
  size: number;
}

export interface HookStatus {
  installed: boolean;
  settingsPath: string;
  hookPath: string;
  hookReady: boolean;
}

export interface HookPreview {
  diff: string;
  backup: string;
  settingsPath: string;
  /** Hand back to hooksApply so only the reviewed diff is ever written. */
  fingerprint: string;
}

/** Same as `call`, but surfaces the error so the UI can show what went wrong. */
async function callOrThrow<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!IS_TAURI) throw new Error("Abra o Coucou (o app) para usar isto.");
  return invoke<T>(cmd, args);
}

export type BridgeEvent =
  | { name: "cursor"; payload: { x: number; y: number } }
  | { name: "tray"; payload: string }
  | { name: "hook"; payload: Record<string, unknown> }
  | { name: "screen-changed"; payload: null };

export interface DragDropPayload {
  type: "enter" | "over" | "drop" | "leave";
  paths?: string[];
}

/** Files dragged onto the island. Only reaches us when the window takes the mouse. */
export async function onDragDrop(handler: (e: DragDropPayload) => void) {
  if (!IS_TAURI) return () => {};
  return getCurrentWebview().onDragDropEvent((event) => {
    handler(event.payload as DragDropPayload);
  });
}

export async function onEvent<T>(name: string, handler: (payload: T) => void) {
  if (!IS_TAURI) return () => {};
  return listen<T>(name, (e) => handler(e.payload));
}
