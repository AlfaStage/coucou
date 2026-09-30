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
  spotifyGetState: async (): Promise<SpotifyPlaybackState | null> => {
    if (!IS_TAURI) {
      return {
        isAvailable: true,
        isPlaying: true,
        title: "Blinding Lights",
        artist: "The Weeknd",
        album: "After Hours",
        albumArtBase64: null,
        appName: "Spotify",
        nextTrackTitle: "Save Your Tears",
        nextTrackArtist: "The Weeknd",
      };
    }
    return call<SpotifyPlaybackState>("spotify_get_state");
  },
  spotifyPlayPause: async () => {
    if (!IS_TAURI) return true;
    return (await call<boolean>("spotify_play_pause")) ?? false;
  },
  spotifyNext: async () => {
    if (!IS_TAURI) return true;
    return (await call<boolean>("spotify_next")) ?? false;
  },
  spotifyPrev: async () => {
    if (!IS_TAURI) return true;
    return (await call<boolean>("spotify_prev")) ?? false;
  },
  spotifyVolumeUp: () => call<void>("spotify_volume_up"),
  spotifyVolumeDown: () => call<void>("spotify_volume_down"),

  // ── Apps & Switcher ────────────────────────────────────────────────────────
  listAppShortcuts: async (): Promise<AppShortcutItem[] | null> => {
    if (!IS_TAURI) {
      return [
        { id: "spotify", name: "Spotify", icon: "spotify", exeStem: "spotify", isOpen: true, windowTitle: "Spotify Premium" },
        { id: "code", name: "VS Code", icon: "code", exeStem: "code", isOpen: true, windowTitle: "coucou — Visual Studio Code" },
        { id: "chrome", name: "Chrome", icon: "chrome", exeStem: "chrome", isOpen: true, windowTitle: "Google Chrome" },
        { id: "terminal", name: "Terminal", icon: "terminal", exeStem: "wt", isOpen: true, windowTitle: "Windows PowerShell" },
        { id: "discord", name: "Discord", icon: "discord", exeStem: "discord", isOpen: false },
        { id: "notion", name: "Notion", icon: "notion", exeStem: "notion", isOpen: false },
        { id: "explorer", name: "Explorer", icon: "folder", exeStem: "explorer", isOpen: true, windowTitle: "Projects" },
        { id: "edge", name: "Edge", icon: "globe", exeStem: "msedge", isOpen: false },
      ];
    }
    return call<AppShortcutItem[]>("list_app_shortcuts");
  },
  launchOrFocusApp: async (appId: string) => {
    if (!IS_TAURI) return true;
    return (await call<boolean>("launch_or_focus_app", { appId })) ?? false;
  },

  // ── Smart Translator ───────────────────────────────────────────────────────
  translateText: async (text: string, sourceLang = "auto", targetLang = "pt"): Promise<TranslationResult | null> => {
    if (!IS_TAURI) {
      try {
        const sl = sourceLang || "auto";
        const tl = targetLang || "pt";
        const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          let translated = "";
          let detected = sl === "auto" ? "en" : sl;
          if (Array.isArray(json) && Array.isArray(json[0])) {
            translated = json[0][0] || text;
            if (json[0][1]) detected = json[0][1];
          } else if (Array.isArray(json) && typeof json[0] === "string") {
            translated = json[0];
          }
          if (translated) {
            return {
              originalText: text,
              translatedText: translated,
              detectedSourceLang: detected,
              targetLang: tl,
              isFallback: false,
            };
          }
        }
      } catch (_err) {
        // web fetch blocked or failed; fall through to dictionary fallback
      }
      const MOCK_DICT: Record<string, string> = {
        "hello": "olá",
        "world": "mundo",
        "hello world": "olá mundo",
        "how are you": "como você está",
        "how are you?": "como você está?",
        "good morning": "bom dia",
        "thank you": "obrigado",
        "coucou": "olá",
        "welcome": "bem-vindo",
        "settings": "configurações",
        "test": "teste",
      };
      const cleanLower = text.trim().toLowerCase();
      const mockTranslated = MOCK_DICT[cleanLower] || (targetLang === "pt" ? `[Tradução PT] ${text}` : `[Translation EN] ${text}`);
      return {
        originalText: text,
        translatedText: mockTranslated,
        detectedSourceLang: targetLang === "pt" ? "en" : "pt",
        targetLang,
        isFallback: true,
      };
    }
    return call<TranslationResult>("translate_text", { text, sourceLang, targetLang });
  },
  getSystemLanguage: async () => {
    if (!IS_TAURI) return "pt";
    return (await call<string>("get_system_language")) ?? "pt";
  },

  // ── Local Whisper Speech-to-Text ───────────────────────────────────────────
  whisperTranscribe: async (audioBase64: string, mode: "type" | "prompt", lang?: string) => {
    if (!IS_TAURI) {
      return "Olá! Ditado por voz do Whisper funcionando com sucesso.";
    }
    return call<string>("whisper_transcribe", { audioBase64, mode, lang });
  },
  typeTextIntoActiveWindow: async (text: string): Promise<void> => {
    if (!IS_TAURI) {
      console.log("[bridge] typeTextIntoActiveWindow simulated:", text);
      return;
    }
    await call<void>("type_text_into_active_window", { text });
  },

  // ── AI Quotas & Limits ─────────────────────────────────────────────────────
  getAiQuotas: async (): Promise<AiQuotaItem[] | null> => {
    if (!IS_TAURI) {
      return [
        {
          id: "claude",
          name: "Claude Code",
          provider: "Anthropic",
          icon: "claude",
          usedPercent: 42.5,
          remainingPercent: 57.5,
          usedTokens: 85000,
          limitTokens: 200000,
          resetInHours: 3.2,
          changedRecently: true,
          status: "normal",
          lastUpdated: "Just now",
        },
        {
          id: "codex",
          name: "Codex CLI",
          provider: "OpenAI",
          icon: "openai",
          usedPercent: 84.0,
          remainingPercent: 16.0,
          usedTokens: 126000,
          limitTokens: 150000,
          resetInHours: 1.5,
          changedRecently: true,
          status: "warning",
          lastUpdated: "Just now",
        },
        {
          id: "antigravity",
          name: "Antigravity",
          provider: "Google",
          icon: "antigravity",
          usedPercent: 22.0,
          remainingPercent: 78.0,
          usedTokens: 110000,
          limitTokens: 500000,
          resetInHours: 4.8,
          changedRecently: false,
          status: "normal",
          lastUpdated: "Just now",
        },
        {
          id: "windsurf",
          name: "Windsurf",
          provider: "Codeium",
          icon: "code",
          usedPercent: 92.0,
          remainingPercent: 8.0,
          usedTokens: 460,
          limitTokens: 500,
          resetInHours: 0.5,
          changedRecently: true,
          status: "critical",
          lastUpdated: "Just now",
        },
        {
          id: "cline",
          name: "Cline",
          provider: "Cline Bot",
          icon: "terminal",
          usedPercent: 53.0,
          remainingPercent: 47.0,
          usedTokens: 53000,
          limitTokens: 100000,
          resetInHours: 12.0,
          changedRecently: false,
          status: "normal",
          lastUpdated: "Just now",
        },
      ];
    }
    return call<AiQuotaItem[]>("get_ai_quotas");
  },
};

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
  if (!IS_TAURI) throw new Error("not running inside Coucou");
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
