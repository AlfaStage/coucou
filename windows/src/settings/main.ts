// Settings window — the place where anything that writes to disk is confirmed.
// Stage 2 covers the Claude Code hooks and the general preferences; API keys and
// integrations land here too in a later stage.

import "./settings.css";
import { Bridge, onEvent, type HookStatus } from "../core/bridge";
import { DEFAULT_SETTINGS, type Settings } from "../core/state";
import { h, clear } from "../views/dom";

let settings: Settings = { ...DEFAULT_SETTINGS };
let version = "";

const root = document.getElementById("settings-root")!;

async function save() {
  await Bridge.saveSettings(settings);
}

// ── Reusable bits ─────────────────────────────────────────────────────────────

function toggle(on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const el = h("button", { class: on ? "switch on" : "switch", "aria-pressed": on });
  el.addEventListener("click", () => {
    const next = !el.classList.contains("on");
    el.classList.toggle("on", next);
    onChange(next);
  });
  return el;
}

function statusDot(ok: boolean): HTMLElement {
  return h("i", { class: "dot", style: `background:${ok ? "#22c55e" : "#f4505e"}` });
}

function renderDiff(text: string): HTMLElement {
  const box = h("div", { class: "diff" });
  for (const line of text.split("\n")) {
    const cls = line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : "ctx";
    box.append(h("div", { class: cls, text: line }));
  }
  return box;
}

// ── Claude Code section ───────────────────────────────────────────────────────

function claudeSection(status: HookStatus): HTMLElement {
  const body = h("div", { style: "display:flex;flex-direction:column;gap:12px" });
  const section = h(
    "section",
    {},
    h("h2", {}, statusDot(status.installed), h("span", { text: "Claude Code" })),
    body,
  );

  const rebuild = async () => {
    const fresh = await Bridge.hooksStatus();
    if (fresh) Object.assign(status, fresh);
    clear(body);
    draw();
    const head = section.querySelector("h2")!;
    clear(head);
    head.append(statusDot(status.installed), h("span", { text: "Claude Code" }));
  };

  function draw() {
    body.append(
      h("div", {
        class: "hint",
        text: status.installed
          ? "Coucou is hooked into your Claude Code sessions. Tool calls, questions and permission requests show up in the island, and you can answer them there."
          : "Install the hooks to see your Claude Code sessions in the island and approve permissions without leaving what you are doing.",
      }),
      h("div", { class: "row" },
        h("label", { text: "settings.json" }),
        h("span", { class: "path", text: status.settingsPath }),
      ),
      h("div", { class: "row" },
        h("label", { text: "Relay" }),
        h("span", { class: "path", text: status.hookPath }),
        statusDot(status.hookReady),
      ),
    );

    if (!status.hookReady) {
      body.append(h("div", {
        class: "notice warn",
        text: "coucou-hook.exe is not in place yet. Restart Coucou; if it still fails, build it with `cargo build -p coucou-hook`.",
      }));
    }

    const actions = h("div", { class: "row" });
    const install = h("button", {
      class: "primary",
      text: status.installed ? "Reinstall hooks…" : "Install hooks…",
      onclick: () => showPreview(true),
    });
    // Writing hook commands that point at a relay which isn't there would give
    // every Claude Code session a broken hook and nothing to show for it.
    if (!status.hookReady) {
      install.disabled = true;
      install.title = "The relay isn't installed yet.";
    }
    actions.append(install);
    if (status.installed) {
      actions.append(h("button", {
        class: "danger",
        text: "Uninstall hooks…",
        onclick: () => showPreview(false),
      }));
    }
    body.append(actions);
  }

  async function showPreview(install: boolean) {
    let preview;
    try {
      preview = await Bridge.hooksPreview(install);
    } catch (err) {
      // An unreadable or invalid settings.json stops here rather than being
      // treated as empty and written over.
      clear(body);
      body.append(
        h("div", { class: "notice err", text: String(err).replace(/^Error:\s*/, "") }),
        h("div", { class: "row" }, h("button", {
          text: "Back",
          onclick: () => { clear(body); draw(); },
        })),
      );
      return;
    }
    if (!preview) return;
    clear(body);
    body.append(
      h("div", {
        class: "hint",
        text: install
          ? "This is exactly what will change in your settings.json. Your own hooks are left untouched."
          : "This removes Coucou's entries only. Your own hooks are left untouched.",
      }),
      renderDiff(preview.diff),
      h("div", { class: "row" },
        h("span", { class: "path", text: `Backup → ${preview.backup}` }),
      ),
    );
    const confirm = h("button", {
      class: install ? "primary" : "danger",
      text: install ? "Back up and write" : "Back up and remove",
    });
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      try {
        const backup = await Bridge.hooksApply(install, preview.fingerprint);
        clear(body);
        body.append(h("div", {
          class: "notice ok",
          text: `Done. Previous settings saved as ${backup}. Open a new Claude Code session to pick the hooks up.`,
        }));
        window.setTimeout(() => void rebuild(), 2600);
      } catch (err) {
        confirm.disabled = false;
        body.append(h("div", { class: "notice err", text: `Could not write: ${String(err)}` }));
      }
    });
    body.append(h("div", { class: "row" }, confirm, h("button", {
      text: "Cancel",
      onclick: () => { clear(body); draw(); },
    })));
  }

  draw();
  return section;
}

// ── Claude API section ────────────────────────────────────────────────────────

const MODELS: [string, string][] = [
  ["claude-opus-5", "Claude Opus 5"],
  ["claude-sonnet-5", "Claude Sonnet 5"],
  ["claude-haiku-4-5", "Claude Haiku 4.5"],
];

function apiSection(hasKey: boolean): HTMLElement {
  const dot = statusDot(hasKey);
  const state = h("span", { class: "hint", text: hasKey ? "Key saved in the Windows Credential Manager." : "No key yet — the chat needs one." });

  const field = h("input", {
    type: "password",
    placeholder: hasKey ? "••••••••••••  (stored)" : "sk-ant-...",
    style: "flex:1 1 auto;min-width:0",
    autocomplete: "off",
    spellcheck: "false",
  }) as HTMLInputElement;

  const saveBtn = h("button", { class: "primary", text: "Save key" });
  const clearBtn = h("button", { class: "danger", text: "Remove" });
  const feedback = h("div", {});

  async function refresh() {
    const present = (await Bridge.secretPresent("anthropic-api-key")) ?? false;
    dot.style.background = present ? "#22c55e" : "#f4505e";
    state.textContent = present
      ? "Key saved in the Windows Credential Manager."
      : "No key yet — the chat needs one.";
    field.placeholder = present ? "••••••••••••  (stored)" : "sk-ant-...";
    clearBtn.style.display = present ? "" : "none";
  }

  saveBtn.addEventListener("click", async () => {
    const value = field.value.trim();
    if (!value) return;
    clear(feedback);
    try {
      await Bridge.secretSet("anthropic-api-key", value);
      field.value = "";
      feedback.append(h("div", { class: "notice ok", text: "Saved. It never touches disk." }));
      await refresh();
    } catch (err) {
      feedback.append(h("div", { class: "notice err", text: `Could not save: ${String(err)}` }));
    }
  });

  clearBtn.addEventListener("click", async () => {
    clear(feedback);
    try {
      await Bridge.secretClear("anthropic-api-key");
      feedback.append(h("div", { class: "notice ok", text: "Key removed." }));
      await refresh();
    } catch (err) {
      feedback.append(h("div", { class: "notice err", text: `Could not remove: ${String(err)}` }));
    }
  });

  const model = h("select", {}) as HTMLSelectElement;
  for (const [id, label] of MODELS) model.append(h("option", { value: id, text: label }));
  if (!MODELS.some(([id]) => id === settings.model)) {
    model.append(h("option", { value: settings.model, text: settings.model }));
  }
  model.value = settings.model;
  model.addEventListener("change", () => {
    settings.model = model.value;
    void save();
  });

  clearBtn.style.display = hasKey ? "" : "none";

  return h(
    "section",
    {},
    h("h2", {}, dot, h("span", { text: "Claude" })),
    state,
    h("div", { class: "row" }, h("label", { text: "API key" }), field, saveBtn, clearBtn),
    h("div", { class: "row" }, h("label", { text: "Model" }), model),
    feedback,
  );
}

// ── Integrations section ──────────────────────────────────────────────────────

interface IntegrationDef {
  id: string;
  name: string;
  color: string;
  /** Credential Manager keys, in the order they are shown. */
  fields: { key: string; label: string; placeholder: string; secret: boolean }[];
}

const INTEGRATIONS: IntegrationDef[] = [
  { id: "integration_stripe", name: "Stripe", color: "#0570DE",
    fields: [{ key: "stripe-api-key", label: "Secret key", placeholder: "sk_live_…", secret: true }] },
  { id: "integration_github", name: "GitHub", color: "#F4505E",
    fields: [{ key: "github-token", label: "Token", placeholder: "ghp_…", secret: true }] },
  { id: "integration_vercel", name: "Vercel", color: "#7C5CFF",
    fields: [{ key: "vercel-token", label: "Token", placeholder: "…", secret: true }] },
  { id: "integration_n8n", name: "n8n", color: "#F29B38",
    fields: [
      { key: "n8n-url", label: "Instance URL", placeholder: "https://n8n.example.com", secret: false },
      { key: "n8n-api-key", label: "API key", placeholder: "…", secret: true },
    ] },
  { id: "integration_resend", name: "Resend", color: "#22C55E",
    fields: [{ key: "resend-api-key", label: "API key", placeholder: "re_…", secret: true }] },
  { id: "integration_notion", name: "Notion", color: "#8C8C8C",
    fields: [{ key: "notion-api-key", label: "Integration token", placeholder: "ntn_…", secret: true }] },
  { id: "integration_calcom", name: "Cal.com", color: "#C9956A",
    fields: [{ key: "calcom-api-key", label: "API key", placeholder: "cal_…", secret: true }] },
];

const MAX_ACTIVE = 4;

function integrationsSection(present: Record<string, boolean>): HTMLElement {
  const note = h("div", { class: "hint" });
  const list = h("div", { style: "display:flex;flex-direction:column;gap:14px" });

  function updateNote() {
    const used = settings.activeIntegrations.length;
    note.textContent = `Pick up to ${MAX_ACTIVE} pills to show next to Mochi — ${used}/${MAX_ACTIVE} in use. Keys are stored in the Windows Credential Manager, never on disk.`;
  }

  for (const def of INTEGRATIONS) {
    const active = settings.activeIntegrations.includes(def.id);
    const sw = h("button", { class: active ? "switch on" : "switch" });
    sw.addEventListener("click", () => {
      const on = settings.activeIntegrations.includes(def.id);
      if (on) {
        settings.activeIntegrations = settings.activeIntegrations.filter((x) => x !== def.id);
      } else {
        if (settings.activeIntegrations.length >= MAX_ACTIVE) return;
        settings.activeIntegrations = [...settings.activeIntegrations, def.id];
      }
      sw.classList.toggle("on", !on);
      updateNote();
      void save();
    });

    const rows = h("div", { style: "display:flex;flex-direction:column;gap:6px;flex:1 1 auto;min-width:0" });
    for (const field of def.fields) {
      const input = h("input", {
        type: field.secret ? "password" : "text",
        placeholder: present[field.key] ? "••••••••  (stored)" : field.placeholder,
        autocomplete: "off",
        spellcheck: "false",
        style: "flex:1 1 auto;min-width:0",
      }) as HTMLInputElement;
      const saveBtn = h("button", { text: "Save" });
      const dotEl = statusDot(present[field.key] ?? false);
      saveBtn.addEventListener("click", async () => {
        const value = input.value.trim();
        try {
          await Bridge.secretSet(field.key, value);
          present[field.key] = value.length > 0;
          input.value = "";
          input.placeholder = value ? "••••••••  (stored)" : field.placeholder;
          dotEl.style.background = value ? "#22c55e" : "#f4505e";
        } catch {
          dotEl.style.background = "#f5a524";
        }
      });
      rows.append(
        h("div", { class: "row" },
          h("label", { style: "min-width:104px", text: field.label }),
          input, saveBtn, dotEl,
        ),
      );
    }

    list.append(
      h("div", { style: "display:flex;gap:12px;align-items:flex-start" },
        h("div", { style: "display:flex;align-items:center;gap:8px;min-width:132px;padding-top:4px" },
          sw,
          h("i", { class: "dot", style: `background:${def.color}` }),
          h("span", { style: "font-size:12.5px", text: def.name }),
        ),
        rows,
      ),
    );
  }

  updateNote();
  return h("section", {}, h("h2", {}, h("span", { text: "Integrations" })), note, list);
}

// ── Shortcuts ─────────────────────────────────────────────────────────────────

/** "KeyD" → "D", "ArrowUp" → "Up"… the spelling the Rust side understands. */
function keyName(e: KeyboardEvent): string | null {
  const c = e.code;
  if (/^Key[A-Z]$/.test(c)) return c.slice(3);
  if (/^Digit\d$/.test(c)) return c.slice(5);
  if (/^F\d{1,2}$/.test(c)) return c;
  const named: Record<string, string> = {
    Space: "Space", Enter: "Enter", Tab: "Tab", Backspace: "Backspace", Insert: "Insert", Delete: "Delete",
    Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
    Semicolon: ";", Equal: "=", Comma: ",", Minus: "-", Period: ".", Slash: "/",
    Backquote: "`", BracketLeft: "[", Backslash: "\\", BracketRight: "]", Quote: "'",
  };
  return named[c] ?? null;
}

/** A field that records the combination you press. */
function shortcutField(initial: string, onChange: (combo: string) => void): HTMLInputElement {
  const input = h("input", {
    type: "text",
    readonly: true,
    value: initial,
    placeholder: "Clique e pressione as teclas",
    style: "width:190px;text-align:center;font-family:var(--mono)",
  }) as HTMLInputElement;
  input.addEventListener("keydown", (e) => {
    e.preventDefault();
    if (e.key === "Escape") {
      input.blur();
      return;
    }
    const key = keyName(e);
    if (!key) return; // a lone modifier: keep waiting for the real key
    const parts: string[] = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Win");
    parts.push(key);
    input.value = parts.join("+");
    onChange(input.value);
    input.blur();
  });
  return input;
}

function shortcutsSection(): HTMLElement {
  let toggleCombo = settings.hotkeyToggle;
  let dictateCombo = settings.hotkeyDictate;
  const toggleMsg = h("span", { class: "hint" });
  const dictateMsg = h("span", { class: "hint" });

  const show = (msg: HTMLElement, state: { ok: boolean; error?: string | null; combo: string } | undefined, what: string) => {
    if (!state || !state.combo) {
      msg.textContent = "Desativado.";
      msg.style.color = "";
    } else if (state.ok) {
      msg.textContent = `${what}: ${state.combo} ativo.`;
      msg.style.color = "#22c55e";
    } else {
      msg.textContent = state.error ?? "Não consegui registrar.";
      msg.style.color = "#f4505e";
    }
  };

  const apply = async () => {
    const res = await Bridge.setHotkeys(toggleCombo, dictateCombo);
    if (!res) return;
    show(toggleMsg, res.toggle, "Abrir");
    show(dictateMsg, res.dictate, "Ditar");
    // A refused shortcut is not saved; show the one that is still in force.
    if (!res.toggle.ok && settings.hotkeyToggle) toggleMsg.append(` Continua valendo ${settings.hotkeyToggle}.`);
    if (!res.dictate.ok && settings.hotkeyDictate) dictateMsg.append(` Continua valendo ${settings.hotkeyDictate}.`);
  };

  const toggleField = shortcutField(toggleCombo, (c) => {
    toggleCombo = c;
    void apply();
  });
  const dictateField = shortcutField(dictateCombo, (c) => {
    dictateCombo = c;
    void apply();
  });

  void Bridge.hotkeyStatus().then((st) => {
    if (!st) return;
    show(toggleMsg, st.toggle, "Abrir");
    show(dictateMsg, st.dictate, "Ditar");
  });

  return h(
    "section",
    {},
    h("h2", {}, h("span", { text: "Atalhos de teclado" })),
    h("div", { class: "hint", text: "Funcionam em qualquer app. Se outro programa já usa a combinação, o Windows recusa — escolha outra." }),
    h("div", { class: "row" }, h("label", { text: "Abrir o Coucou" }), toggleField, toggleMsg),
    h("div", { class: "row" }, h("label", { text: "Ditar" }), dictateField, dictateMsg),
  );
}

// ── Assistant, dictation and tools ────────────────────────────────────────────

function featuresSection(): HTMLElement {
  // ── Chat assistant ──
  const provider = h("select", {}) as HTMLSelectElement;
  provider.append(
    h("option", { value: "claude", text: "Claude" }),
    h("option", { value: "chatgpt", text: "ChatGPT (em breve — entrar com a conta)", disabled: true }),
  );
  provider.value = settings.chatProvider === "chatgpt" ? "claude" : settings.chatProvider;
  provider.addEventListener("change", () => {
    settings.chatProvider = provider.value as Settings["chatProvider"];
    void save();
  });

  // ── Dictation engine (checked for real, not assumed) ──
  const whisperDot = h("i", { class: "dot", style: "background:#6b7079" });
  const whisperHint = h("span", { class: "hint", text: "Verificando o motor de voz…" });
  const whisperBtn = h("button", { text: "Baixar agora" });
  whisperBtn.style.display = "none";
  whisperBtn.addEventListener("click", () => {
    whisperBtn.style.display = "none";
    whisperHint.textContent = "Baixando…";
    void Bridge.whisperSetup();
  });
  const paintEngine = (state: string, mb: number) => {
    const ok = state === "ready";
    whisperDot.style.background = ok ? "#22c55e" : state === "setting_up" ? "#f5a524" : "#f4505e";
    whisperHint.textContent = ok
      ? "Ditado offline pronto — nada para instalar."
      : state === "setting_up"
        ? "Baixando o motor de voz…"
        : `Baixa sozinho no primeiro uso (${mb || 68} MB, uma vez).`;
    whisperBtn.style.display = state === "needs_setup" ? "" : "none";
  };
  void Bridge.whisperStatus().then((st) => st && paintEngine(st.state, st.downloadMb));
  void onEvent<{ stage: string; percent: number; message?: string }>("whisper-setup", (p) => {
    if (p.stage === "done") paintEngine("ready", 0);
    else if (p.stage === "error") {
      paintEngine("needs_setup", 68);
      whisperHint.textContent = p.message ?? "Não consegui baixar.";
    } else whisperHint.textContent = `Baixando o motor de voz… ${p.percent}%`;
  });

  const claudeLive = toggle(settings.quotaClaudeLive, (v) => {
    settings.quotaClaudeLive = v;
    void save();
  });

  const resetPins = h("button", { text: "Restaurar" });
  resetPins.addEventListener("click", () => {
    settings.pinnedApps = [];
    void save();
  });

  return h(
    "section",
    {},
    h("h2", {}, h("span", { text: "Assistente e ferramentas" })),
    h("div", { class: "row" },
      h("label", { text: "Chat" }),
      provider,
      h("span", { class: "hint", text: "Quem responde em Perguntar" }),
    ),
    h("div", { class: "row" },
      h("label", { text: "Ditado" }),
      whisperDot,
      whisperHint,
      whisperBtn,
    ),
    h("div", { class: "row" },
      h("label", { text: "Uso do Claude" }),
      claudeLive,
      h("span", { class: "hint", text: "Lê o login do Claude Code e consulta o uso real na Anthropic" }),
    ),
    h("div", { class: "row" },
      h("label", { text: "Apps fixados" }),
      resetPins,
      h("span", { class: "hint", text: "Volta aos apps padrão da aba Apps" }),
    ),
  );
}

// ── General section ───────────────────────────────────────────────────────────

function generalSection(): HTMLElement {
  const volume = h("input", {
    type: "range", min: "0", max: "0.2", step: "0.005",
    value: String(settings.soundVolume),
  }) as HTMLInputElement;
  volume.addEventListener("input", () => {
    settings.soundVolume = Number(volume.value);
    void save();
  });

  const autoClose = h("input", {
    type: "number", min: "5", max: "120", step: "1",
    value: String(Math.round(settings.autoCloseInterval)),
    style: "width:72px",
  }) as HTMLInputElement;
  autoClose.addEventListener("change", () => {
    settings.autoCloseInterval = Math.max(5, Math.min(120, Number(autoClose.value) || 15));
    autoClose.value = String(settings.autoCloseInterval);
    void save();
  });

  const screen = h("select", {}) as HTMLSelectElement;
  screen.append(
    h("option", { value: "primary", text: "Tela principal" }),
    h("option", { value: "cursor", text: "Tela onde está o mouse" }),
  );
  screen.value = settings.screen;
  screen.addEventListener("change", () => {
    settings.screen = screen.value as Settings["screen"];
    void save();
  });

  return h(
    "section",
    {},
    h("h2", {}, h("span", { text: "Geral" })),
    h("div", { class: "row" },
      h("label", { text: "Sons" }),
      toggle(settings.soundEnabled, (v) => { settings.soundEnabled = v; void save(); }),
      volume,
    ),
    h("div", { class: "row" },
      h("label", { text: "Fechar sozinho" }),
      autoClose,
      h("span", { class: "hint", text: "segundos depois que você sai de cima" }),
    ),
    h("div", { class: "row" },
      h("label", { text: "Notch sempre visível" }),
      toggle(settings.notchAlwaysVisible, (v) => { settings.notchAlwaysVisible = v; void save(); }),
      h("span", { class: "hint", text: "Desligado: some por completo; passe o mouse no topo, no centro de qualquer tela, para ele aparecer" }),
    ),
    h("div", { class: "row" },
      h("label", { text: "Ilha aparece em" }),
      screen,
      h("span", { class: "hint", text: "Ao passar o mouse no topo de outra tela, ela vai para lá" }),
    ),
    h("div", { class: "row" },
      h("label", { text: "Abrir com o Windows" }),
      toggle(settings.autostart, (v) => { settings.autostart = v; void save(); }),
    ),
  );
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function main() {
  const boot = await Bridge.boot();
  if (boot) {
    settings = { ...settings, ...boot.settings };
    version = boot.version;
  }
  const status = (await Bridge.hooksStatus()) ?? {
    installed: false, settingsPath: "", hookPath: "", hookReady: false,
  };

  const hasKey = (await Bridge.secretPresent("anthropic-api-key")) ?? false;

  const keys = [
    "stripe-api-key", "github-token", "vercel-token",
    "n8n-url", "n8n-api-key", "resend-api-key", "notion-api-key", "calcom-api-key",
  ];
  const present: Record<string, boolean> = {};
  for (const k of keys) present[k] = (await Bridge.secretPresent(k)) ?? false;

  clear(root);
  root.append(
    h("h1", {}, h("span", { text: "Coucou" }), h("span", { class: "version", text: version })),
    claudeSection(status),
    apiSection(hasKey),
    integrationsSection(present),
    shortcutsSection(),
    featuresSection(),
    generalSection(),
    h("div", {
      class: "hint",
      text: "Sem telemetria. Só há conexões com os serviços que você configurou, o Google (tradutor) e o download único do motor de voz.",
    }),
  );

  void onEvent<Settings>("settings-changed", (s) => {
    settings = { ...settings, ...s };
  });
}

void main();
