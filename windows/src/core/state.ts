// App state — mirror of AppState.swift (the parts the island needs).

import type { BotEmoteName, BotStateName, IslandMode, IslandViewName } from "./layout";
import type { EyeShape } from "../mochi/engine";

export type AgentSource = "claudeCode" | "n8n";
export type PillBadge = "approval" | "finished" | "error";

export interface AgentTask {
  id: string;
  name: string;
  color: string;
  state: BotStateName;
  stepIndex: number;
  steps: string[];
  source: AgentSource;
  isIntegration: boolean;
  emote?: BotEmoteName | null;
  miniEye?: EyeShape | null;
  pillBadge?: PillBadge | null;
  sessionCwd?: string | null;
}

export interface ApprovalInfo {
  requestId: string;
  sessionId: string;
  tool: string;
  command: string;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
}

export type PromptContext =
  | { kind: "window"; appName: string; title: string; url?: string }
  | { kind: "file"; name: string; path?: string };

export interface ResultItem {
  label: string;
  detail: string;
  url?: string;
}

export interface SearchResult {
  title: string;
  items: ResultItem[];
  note?: string;
}

export interface TranslationItem {
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  isTranslating: boolean;
  error?: string | null;
}

export interface WhisperState {
  isListening: boolean;
  /** type = write where the cursor is · copy = only put it on the clipboard. */
  mode: "type" | "copy";
  /** What Mochi is doing right now. */
  phase: "idle" | "listening" | "transcribing";
  /** Smoothed microphone loudness, 0–1, while listening. */
  level: number;
  /** Speech engine: downloaded once, the first time. */
  engine: "ready" | "needs_setup" | "setting_up";
  downloadMb: number;
  setupPercent: number;
  /** performance.now() when the recording started. */
  startedAt: number;
  /** Language spoken: a code ("pt", "en"…) or "auto". Auto misfires on short clips, so the default is the system language. */
  lang: string;
  lastTranscription: string;
  /** Last problem, in plain language. */
  error: string | null;
}

export interface AiQuotaItem {
  id: string;
  name: string;
  provider: string;
  icon: string;
  /** Short window (the one that runs out first), 0–100. */
  usedPercent: number;
  /** "5 h", "Semana", "Mês"… */
  windowLabel: string;
  resetInMinutes?: number | null;
  weeklyPercent?: number | null;
  weeklyResetInMinutes?: number | null;
  changedRecently: boolean;
  status: "normal" | "warning" | "critical";
  /** live = real number · needs_consent = waiting for the user · unavailable = no data. */
  availability: "live" | "needs_consent" | "unavailable";
  note?: string | null;
}

export interface AppShortcutItem {
  id: string;
  name: string;
  icon: string;
  isOpen: boolean;
  pinned: boolean;
  hwnd?: number | null;
  windowTitle?: string | null;
}

export interface SpotifyPlaybackState {
  isAvailable: boolean;
  isPlaying: boolean;
  title: string;
  artist: string;
  album: string;
  albumArtBase64: string | null;
  appName: string;
  nextTrackTitle?: string | null;
  nextTrackArtist?: string | null;
}

const task = (
  id: string, name: string, color: string, source: AgentSource,
): AgentTask => ({
  id, name, color, state: "idle", stepIndex: 0, steps: [], source, isIntegration: true,
});

/** AgentTask.integrationAgents — same ids, names and colours as macOS. */
export const INTEGRATION_AGENTS: AgentTask[] = [
  task("integration_claude", "VS Code", "#F5F6F8", "claudeCode"),
  task("integration_spotify", "Spotify", "#1DB954", "n8n"),
  task("integration_resend", "Resend", "#22C55E", "n8n"),
  task("integration_n8n", "n8n", "#F29B38", "n8n"),
  task("integration_vercel", "Vercel", "#7C5CFF", "n8n"),
  task("integration_github", "GitHub", "#F4505E", "n8n"),
  task("integration_notion", "Notion", "#8C8C8C", "n8n"),
  task("integration_calcom", "Cal.com", "#C9956A", "n8n"),
  task("integration_stripe", "Stripe", "#0570DE", "n8n"),
];

export const TOGGLEABLE_INTEGRATION_IDS = [
  "integration_spotify", "integration_resend", "integration_n8n", "integration_vercel", "integration_github",
  "integration_notion", "integration_calcom", "integration_stripe",
];

/** What an integration poller last reported. */
export interface IntegrationInfo {
  data: Record<string, unknown>;
  error: string | null;
  loaded: boolean;
  configured: boolean;
}

export interface Settings {
  soundEnabled: boolean;
  soundVolume: number;
  autoCloseInterval: number;
  absenceInterval: number;
  activeIntegrations: string[];
  screen: "primary" | "cursor";
  autostart: boolean;
  hooksInstalled: boolean;
  /** Claude model used by the chat. */
  model: string;
  /** Who answers the chat. "chatgpt" is reserved for the account login. */
  chatProvider: "claude" | "chatgpt";
  /** Opt-in: read real Claude usage with the Claude Code login. */
  quotaClaudeLive: boolean;
  /** Apps pinned on the Apps tab (lower-case names). Empty = defaults. */
  pinnedApps: string[];
  /** Global shortcut that opens/closes the island, e.g. "Ctrl+Alt+Space". */
  hotkeyToggle: string;
  /** Global shortcut that starts/stops dictation. */
  hotkeyDictate: string;
  /** Keep a slim notch on screen instead of hiding completely. */
  notchAlwaysVisible: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  soundEnabled: true,
  soundVolume: 0.12,
  autoCloseInterval: 15,
  absenceInterval: 180,
  activeIntegrations: [
    "integration_spotify", "integration_resend", "integration_n8n", "integration_vercel", "integration_github",
  ],
  screen: "primary",
  autostart: false,
  hooksInstalled: false,
  model: "claude-opus-5",
  chatProvider: "claude",
  quotaClaudeLive: false,
  pinnedApps: [],
  hotkeyToggle: "Ctrl+Alt+Space",
  hotkeyDictate: "Ctrl+Alt+D",
  notchAlwaysVisible: true,
};

type Listener = () => void;

class AppState {
  mode: IslandMode = "hidden";
  view: IslandViewName = "overview";

  tasks: AgentTask[] = [];
  focusId: string | null = null;

  stateOverride: BotStateName | null = null;

  /** Cursor in logical screen pixels, origin top-left (like AppState.mousePosition). */
  mouse = { x: 0, y: 0 };
  /** Cursor relative to the island's top-left corner. */
  mouseInIsland = { x: 0, y: 0 };

  isPinned = false;
  paused = false;
  isDancing = false;
  /** Mochi dances on the Música tab. A viewer preference, remembered in localStorage. */
  danceEnabled = (() => {
    try {
      return localStorage.getItem("coucou.dance") !== "0";
    } catch {
      return true;
    }
  })();

  uploadProgress = 0;
  uploadDuration = 2.4;
  fileDragOver = false;

  promptContext: PromptContext | null = null;
  droppedFile: { name: string; path: string } | null = null;
  noteMessage: string | null = null;
  /** Colours the note card: warn = amber, danger = red. */
  noteTone: "warn" | "danger" | "info" | null = null;
  searchResult: SearchResult | null = null;
  chatHistory: ChatMessage[] = [];
  pendingApproval: ApprovalInfo | null = null;

  spotify: SpotifyPlaybackState = {
    isAvailable: false,
    isPlaying: false,
    title: "",
    artist: "",
    album: "",
    albumArtBase64: null,
    appName: "Spotify",
  };

  shortcuts: AppShortcutItem[] = [];

  translation: TranslationItem = {
    sourceText: "",
    translatedText: "",
    sourceLang: "auto",
    targetLang: "pt",
    isTranslating: false,
    error: null,
  };

  whisper: WhisperState = {
    isListening: false,
    mode: "type",
    phase: "idle",
    level: 0,
    engine: "ready",
    downloadMb: 0,
    setupPercent: 0,
    startedAt: 0,
    lang: (() => {
      try {
        return localStorage.getItem("coucou.whisperLang") || "";
      } catch {
        return "";
      }
    })(),
    lastTranscription: "",
    error: null,
  };

  /** Text handed to the chat box (dictation → "Perguntar à IA"). Consumed once. */
  chatDraft = "";

  /** Set by the island: a short message from Mochi that works even when he is closed. */
  /** Set by the island: makes Mochi show an emote (a wink after pasting…). */
  emote: ((name: BotEmoteName) => void) | null = null;

  toast: ((message: string, tone: "warn" | "danger" | "info") => void) | null = null;

  quotas: AiQuotaItem[] = [];

  integrations: Record<string, IntegrationInfo> = {};

  lastActivity = performance.now();

  settings: Settings = { ...DEFAULT_SETTINGS };

  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Marks the UI dirty; the island re-renders on the next frame. */
  notify() {
    for (const fn of this.listeners) fn();
  }

  get focusTask(): AgentTask | null {
    return this.tasks.find((t) => t.id === this.focusId) ?? this.tasks[0] ?? null;
  }

  /**
   * What Mochi's face shows. One signal at a time, most urgent first: a forced
   * state (alert, thinking), then real work, then the mood of the tab you are on.
   * A maxed-out quota only makes Mochi sweat on the Limites tab — it never leaks
   * onto Spotify or the translator.
   */
  get effectiveState(): BotStateName {
    if (this.stateOverride) return this.stateOverride;
    const task = this.focusTask?.state;
    if (task && task !== "idle") return task;
    if (this.mode === "expanded") {
      if (this.whisper.phase === "transcribing") return "thinking";
      if (this.translation.isTranslating) return "searching";
      if (this.view === "quotas" && this.quotas.some((q) => q.availability === "live" && q.status === "critical")) {
        return "ratelimit";
      }
    }
    return "idle";
  }

  get otherTasks(): AgentTask[] {
    return this.tasks.filter((t) => t.id !== this.focusId);
  }

  setFocus(id: string) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    this.focusId = id;
    t.pillBadge = null;
    this.notify();
  }

  updateTask(id: string, state: BotStateName) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    t.state = state;
    this.notify();
  }

  appendStep(id: string, step: string) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    t.steps.push(step);
    if (t.steps.length > 20) t.steps.shift();
    t.stepIndex = t.steps.length - 1;
    this.notify();
  }

  setPillBadge(id: string, badge: PillBadge | null) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    t.pillBadge = badge;
    this.notify();
  }

  /** loadIntegrationTasks() — VS Code always on, the rest opt-in (max 4). */
  loadIntegrationTasks() {
    for (const proto of INTEGRATION_AGENTS) {
      const shouldLoad =
        proto.id === "integration_claude" || this.settings.activeIntegrations.includes(proto.id);
      const idx = this.tasks.findIndex((t) => t.id === proto.id);
      if (shouldLoad && idx < 0) this.tasks.push({ ...proto, steps: [] });
      if (!shouldLoad && idx >= 0) this.tasks.splice(idx, 1);
    }
    // Keep the declared order so pills never shuffle.
    const order = INTEGRATION_AGENTS.map((t) => t.id);
    this.tasks.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    if (!this.focusId) this.focusId = "integration_claude";
    this.notify();
  }

  toggleIntegration(id: string) {
    if (id === "integration_claude") return;
    const active = this.settings.activeIntegrations;
    if (active.includes(id)) {
      this.settings.activeIntegrations = active.filter((x) => x !== id);
      if (this.focusId === id) this.focusId = "integration_claude";
    } else {
      if (active.length >= 4) return;
      this.settings.activeIntegrations = [...active, id];
    }
    this.loadIntegrationTasks();
  }

  /**
   * Home. The Overview is for people who run AI sessions or connected services;
   * anyone else lands on the launcher hub ("empty"), so the island is useful
   * without a terminal.
   */
  defaultView(): IslandViewName {
    const working = this.tasks.some((t) => t.state !== "idle");
    const connected = this.tasks.some(
      (t) => t.id !== "integration_claude" && t.id !== "integration_spotify" && this.integrations[t.id]?.configured,
    );
    return working || connected || this.settings.hooksInstalled ? "overview" : "empty";
  }
}

export const State = new AppState();
