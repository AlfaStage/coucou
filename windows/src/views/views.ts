// Island views — DOM ports of IslandViewContent.swift. Paddings, font sizes,
// colours and wording are copied from the Swift views so both platforms read
// identically.

import { h, svg, clear, dot } from "./dom";
import { ICONS } from "./icons";
import { Ticker } from "./ticker";
import { State, type AgentTask } from "../core/state";
import { washRGBA, type IslandViewName, type Wash } from "../core/layout";
import { createMiniBot, pruneMiniBots } from "../mochi/minibots";
import { buildPrompt } from "./chat";
import { buildChoose, buildUpload, buildUploading } from "./upload";
import { renderIntegrationCard, type IntegrationCardHooks } from "./integrations";
import { buildAppsView } from "./apps";
import { buildTranslatorView } from "./translator";
import { buildQuotasView, createCircularProgress } from "./quotas";
import { buildSpotifyView } from "./spotify";
import { buildVoiceView } from "./voice";
import { segmented, setSay, setWho, toolShell } from "./tools";
import { buildClipboardView } from "./clipboard";
import { Bridge } from "../core/bridge";

export interface ViewActions {
  setView(v: IslandViewName): void;
  collapse(): void;
  setFocus(id: string): void;
  openTerminal(): void;
  /** The ↗ button: opens whatever the focused pill points at. */
  openTarget(): void;
  openUrl(url: string): void;
  decide(d: "allow" | "deny"): void;
  toggleSound(): void;
  setVolume(v: number): void;
  setAutoClose(seconds: number): void;
  openSettingsWindow(): void;
  blip(): void;
}

export interface ViewHost {
  el: HTMLElement;
  sync(): void;
  /** Called when the view becomes active, for views with a text field. */
  focus?(): void;
  /** Called every frame while the view is on screen. */
  tick?(nowMs: number): void;
}

// ── Shared pieces ─────────────────────────────────────────────────────────────

function card(wash: Wash, ...children: (Node | string)[]): HTMLElement {
  const el = h("div", { class: wash ? "card wash" : "card" }, ...children);
  if (wash) el.style.setProperty("--wash", washRGBA(wash));
  return el;
}

function btn(
  label: string,
  kind: "primary" | "secondary",
  onClick: () => void,
  kbd?: string,
): HTMLElement {
  return h(
    "button",
    { class: `btn ${kind}`, onclick: onClick },
    h("span", { text: label }),
    kbd ? h("span", { class: "kbd", text: kbd }) : null,
  );
}

/** AgentWho — coloured dot + task name + grey label. */
function agentWho(task: AgentTask | null, label: string): HTMLElement {
  const row = h("div", { class: "who-row" });
  if (task) {
    row.append(dot(task.color, 8), h("span", { class: "n", text: task.name }));
  }
  row.append(h("span", { text: label }));
  return row;
}

function stack(padLeft: number, padRight: number, ...children: Node[]): HTMLElement {
  const el = h("div", { class: "stack" }, ...children);
  el.style.padding = `4px ${padRight}px 4px ${padLeft}px`;
  return el;
}

// ── Header ────────────────────────────────────────────────────────────────────

interface TabDef {
  /** The views that light this tab up. */
  views: IslandViewName[];
  go: IslandViewName;
  icon: string;
  label: string;
}

// Ordered by how often people reach for them. The active tab shows its name.
const TABS: TabDef[] = [
  { views: ["overview", "empty"], go: "overview", icon: ICONS.house, label: "Início" },
  { views: ["prompt"], go: "prompt", icon: ICONS.bubble, label: "Perguntar" },
  { views: ["voice"], go: "voice", icon: ICONS.mic, label: "Ditar" },
  { views: ["translator"], go: "translator", icon: ICONS.translate, label: "Traduzir" },
  { views: ["clipboard"], go: "clipboard", icon: ICONS.clipboard, label: "Copiados" },
  { views: ["spotify"], go: "spotify", icon: ICONS.spotify, label: "Música" },
  { views: ["apps"], go: "apps", icon: ICONS.apps, label: "Apps" },
  { views: ["quotas"], go: "quotas", icon: ICONS.gauge, label: "Limites" },
  { views: ["upload", "uploading", "choose"], go: "upload", icon: ICONS.plus, label: "Arquivos" },
];

export function buildHeader(actions: ViewActions): ViewHost {
  const tabs = TABS.map((t) => ({
    def: t,
    el: h(
      "button",
      { class: "tab", title: t.label, onclick: () => go(t.go) },
      svg(t.icon, 13),
      h("span", { class: "tab-label", text: t.label }),
    ),
  }));

  const quotaPillsEl = h("div", { class: "header-quota-pills" });
  const gearBtn = h("button", { title: "Configurações", onclick: () => go("settings") }, svg(ICONS.gear, 14));
  const soundBtn = h("button", { title: "Sons", onclick: () => actions.toggleSound() }, svg(ICONS.speakerOn, 14));

  function go(v: IslandViewName) {
    actions.blip();
    actions.setView(v);
  }

  const el = h(
    "div",
    { id: "header" },
    h("div", { class: "tabs" }, ...tabs.map((t) => t.el)),
    h("div", { class: "header-actions" }, quotaPillsEl, gearBtn, soundBtn),
  );

  let quotaKey = "";

  return {
    el,
    sync() {
      const v = State.view;
      for (const t of tabs) t.el.classList.toggle("on", t.def.views.includes(v));
      gearBtn.classList.toggle("on", v === "settings");
      clear(gearBtn);
      gearBtn.append(svg(v === "settings" ? ICONS.gearFill : ICONS.gear, 14));
      clear(soundBtn);
      soundBtn.append(svg(State.settings.soundEnabled ? ICONS.speakerOn : ICONS.speakerOff, 14));

      // A ring for each provider whose real number just moved (or is in alert).
      // Nothing moved → nothing here, so the header stays calm.
      const changed = State.quotas.filter(
        (q) => q.availability === "live" && (q.changedRecently || q.status !== "normal"),
      );
      const key = changed.map((q) => `${q.id}:${Math.round(q.usedPercent)}`).join("|");
      if (key !== quotaKey) {
        quotaKey = key;
        clear(quotaPillsEl);
        for (const q of changed) {
          const color = q.status === "critical" ? "#F4505E" : q.status === "warning" ? "#F5A524" : "#34D399";
          quotaPillsEl.append(
            h(
              "button",
              {
                class: "header-quota-pill",
                title: `${q.name}: ${Math.round(q.usedPercent)}% usado. Ver limites.`,
                onclick: (e: Event) => {
                  e.stopPropagation();
                  go("quotas");
                },
              },
              createCircularProgress(q.usedPercent, 18, 2.5, color),
              h("span", { class: "quota-pill-text", text: `${Math.round(q.usedPercent)}%` }),
            ),
          );
        }
      }

      el.style.opacity = v === "confused" ? "0" : "1";
    },
  };
}

// ── Overview ──────────────────────────────────────────────────────────────────

/**
 * The Overview's right side: two stacked cards you can swap. In front, the tools
 * (shortcuts to Coucou's tabs); behind it, the integrations. Tap the card peeking
 * out behind, the dots, or scroll to bring the other one forward.
 */
function buildDeck(actions: ViewActions, integrations: HTMLElement): HTMLElement {
  const tools: { view: IslandViewName; icon: string; color: string; label: string }[] = [
    { view: "prompt", icon: ICONS.bubble, color: "#A78BFA", label: "Perguntar" },
    { view: "voice", icon: ICONS.mic, color: "#22D3EE", label: "Ditar" },
    { view: "translator", icon: ICONS.translate, color: "#34D399", label: "Traduzir" },
    { view: "clipboard", icon: ICONS.clipboard, color: "#818CF8", label: "Copiados" },
    { view: "spotify", icon: ICONS.spotify, color: "#1DB954", label: "Música" },
    { view: "apps", icon: ICONS.apps, color: "#60A5FA", label: "Apps" },
    { view: "quotas", icon: ICONS.gauge, color: "#F5A524", label: "Limites" },
    { view: "upload", icon: ICONS.plus, color: "#F472B6", label: "Arquivos" },
  ];
  const grid = h("div", { class: "tools-grid" });
  for (const t of tools) {
    grid.append(
      h(
        "button",
        { class: "tool-tile", title: t.label, onclick: () => actions.setView(t.view) },
        h("span", { class: "tool-tile-icon", style: `background:${t.color}26;color:${t.color}` }, svg(t.icon, 15)),
        h("span", { class: "tool-tile-label", text: t.label }),
      ),
    );
  }
  const toolsCard = card("soft", grid);
  toolsCard.classList.add("deck-card");
  integrations.classList.add("deck-card");

  let front: "tools" | "integrations" = "tools";
  const dotTools = h("i", { title: "Ferramentas", onclick: () => show("tools") });
  const dotInt = h("i", { title: "Integrações", onclick: () => show("integrations") });
  const dots = h("div", { class: "deck-dots" }, dotTools, dotInt);

  function show(which: "tools" | "integrations") {
    front = which;
    toolsCard.classList.toggle("front", which === "tools");
    toolsCard.classList.toggle("back", which !== "tools");
    integrations.classList.toggle("front", which === "integrations");
    integrations.classList.toggle("back", which !== "integrations");
    dotTools.classList.toggle("on", which === "tools");
    dotInt.classList.toggle("on", which === "integrations");
  }
  // A tap on whichever card is behind brings it forward; taps on the front one pass through.
  for (const [el, which] of [[toolsCard, "tools"], [integrations, "integrations"]] as const) {
    el.addEventListener("click", (e) => {
      if (front === which) return;
      e.stopPropagation();
      actions.blip();
      show(which);
    }, true);
  }
  const deck = h("div", { class: "deck" }, integrations, toolsCard, dots);
  deck.addEventListener("wheel", (e) => {
    e.preventDefault();
    const want = (e as WheelEvent).deltaY > 0 ? "integrations" : "tools";
    if (want !== front) show(want);
  }, { passive: false });
  show("tools");
  return deck;
}

function buildOverview(actions: ViewActions): ViewHost {
  const ticker = new Ticker();
  const who = h("div", { class: "who" });
  const tickerBody = h("div", { class: "card-body" }, who, ticker.el);
  const leftBody = h("div", { class: "left-body" });
  const jump = h(
    "button",
    { class: "icon-btn jump", title: "Abrir", onclick: () => actions.openTarget() },
    svg(ICONS.arrowUpRight, 8),
  );
  const left = card(null, leftBody, jump);
  const pills = h("div", { class: "pills" });
  const right = buildDeck(actions, card(null, pills));

  const el = h("div", { class: "view overview" },
    h("div", { class: "left" }, left),
    h("div", { class: "right" }, right),
  );

  let pillIds = "";
  let detailOpen = false;
  let lastFocus: string | null = null;
  let mode: "ticker" | "card" | null = null;
  let cardKey = "";

  const hooks: IntegrationCardHooks = {
    get detailOpen() {
      return detailOpen;
    },
    openDetail() {
      detailOpen = true;
      cardKey = "";
      State.notify();
    },
    closeDetail() {
      detailOpen = false;
      cardKey = "";
      State.notify();
    },
    openSettings: () => actions.openSettingsWindow(),
  };

  return {
    el,
    tick(nowMs: number) {
      if (mode === "ticker") ticker.tick(nowMs);
    },
    sync() {
      const task = State.focusTask;
      if (task?.id !== lastFocus) {
        lastFocus = task?.id ?? null;
        detailOpen = false;
        cardKey = "";
        mode = null;
      }

      // VS Code with a live Claude Code session keeps the ticker; every other
      // pill shows its own card, exactly like IntegrationCardView.
      const sessionActive =
        task?.id === "integration_claude" && (task.state !== "idle" || task.steps.length > 0);

      if (task && sessionActive) {
        if (mode !== "ticker") {
          clear(leftBody);
          leftBody.append(tickerBody);
          mode = "ticker";
          cardKey = "";
        }
        clear(who);
        who.append(
          dot(task.color, 7),
          h("span", { class: "name", text: task.name }),
          h("span", { class: "tool", text: task.source === "claudeCode" ? "Claude Code" : "n8n" }),
        );
        if (task.steps.length > 1) {
          who.append(h("span", {
            class: "count",
            text: `${Math.min(task.stepIndex + 1, task.steps.length)}/${task.steps.length}`,
          }));
        }
        ticker.sync(task);
      } else if (task) {
        const info = State.integrations[task.id];
        const key = [
          task.id, detailOpen, task.state, task.steps.join("|"),
          info?.loaded, info?.error, info?.configured,
          JSON.stringify(info?.data ?? {}),
        ].join("~");
        if (key !== cardKey) {
          cardKey = key;
          mode = "card";
          clear(leftBody);
          leftBody.append(renderIntegrationCard(task, hooks));
        }
      }

      jump.style.display = detailOpen ? "none" : "";

      const others = State.otherTasks.slice(0, 4);
      const pillKey = others.map((t) => `${t.id}:${t.pillBadge ?? ""}`).join("|");
      if (pillKey !== pillIds) {
        pillIds = pillKey;
        clear(pills);
        for (const t of others) pills.append(buildPill(t, actions));
        pruneMiniBots();
      }
    },
  };
}

function buildPill(task: AgentTask, actions: ViewActions): HTMLElement {
  const label = task.id === "integration_claude" ? "VS Code" : task.name;
  const canvas = createMiniBot(task, 24);
  const pill = h(
    "div",
    { class: "pill", onclick: () => actions.setFocus(task.id) },
    canvas,
    h("span", { class: "lbl", text: label }),
  );
  pill.style.borderColor = `${task.color}24`;
  pill.addEventListener("mouseenter", () => {
    pill.style.background = `${task.color}2e`;
    pill.style.borderColor = `${task.color}8c`;
    pill.style.boxShadow = `0 2px 10px ${task.color}59`;
    (pill.querySelector(".lbl") as HTMLElement).style.color = lighten(task.color, 0.3);
  });
  pill.addEventListener("mouseleave", () => {
    pill.style.background = "";
    pill.style.borderColor = `${task.color}24`;
    pill.style.boxShadow = "";
    (pill.querySelector(".lbl") as HTMLElement).style.color = "";
  });

  if (task.pillBadge) {
    const colors = { approval: "#F5A524", finished: "#22C55E", error: "#F4505E" } as const;
    const icons = { approval: ICONS.bang, finished: ICONS.check, error: ICONS.xmark } as const;
    const inner = h("i", { style: `background:${colors[task.pillBadge]}` }, svg(icons[task.pillBadge], 6, { stroke: task.pillBadge === "finished" ? 3 : 0 }));
    const badge = h("div", { class: "pill-badge" }, inner);
    badge.style.boxShadow = `0 0 4px ${colors[task.pillBadge]}99`;
    pill.append(badge);
  }
  return pill;
}

function lighten(hex: string, amount: number): string {
  const v = parseInt(hex.replace("#", ""), 16);
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) =>
    Math.min(255, Math.round(x + amount * 255)),
  );
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ── Empty ─────────────────────────────────────────────────────────────────────

/** The home screen when no AI session is running: a launcher, so the island is
 *  useful to someone who never opens a terminal. */
function buildEmpty(actions: ViewActions): ViewHost {
  const shell = toolShell("hub-view", "soft");
  const ask = h(
    "button",
    { class: "btn primary", onclick: () => actions.setView("prompt") },
    svg(ICONS.bubble, 11),
    h("span", { text: "Perguntar" }),
  );
  shell.foot.append(ask);

  const tiles: { view: IslandViewName; icon: string; color: string; label: string; sub: () => string }[] = [
    { view: "voice", icon: ICONS.mic, color: "#22D3EE", label: "Ditar", sub: () => "Fale, eu escrevo" },
    { view: "translator", icon: ICONS.translate, color: "#34D399", label: "Traduzir", sub: () => "Cole e traduza" },
    {
      view: "spotify",
      icon: ICONS.spotify,
      color: "#1DB954",
      label: "Música",
      sub: () => (State.spotify.isPlaying && State.spotify.title ? State.spotify.title : "Controle o Spotify"),
    },
    { view: "apps", icon: ICONS.apps, color: "#818CF8", label: "Apps", sub: () => "Abra ou volte a um app" },
  ];
  const grid = h("div", { class: "hub-grid" });
  const subs: HTMLElement[] = [];
  for (const t of tiles) {
    const sub = h("span", { class: "hub-sub" });
    subs.push(sub);
    grid.append(
      h(
        "button",
        { class: "hub-tile", onclick: () => actions.setView(t.view) },
        h("span", { class: "hub-icon", style: `background:${t.color}26;color:${t.color}` }, svg(t.icon, 14)),
        h("span", { class: "hub-text" }, h("span", { class: "hub-label", text: t.label }), sub),
      ),
    );
  }
  shell.rightCard.append(grid);

  return {
    el: shell.el,
    sync() {
      const now = new Date();
      const hr = now.getHours();
      const hello = hr < 5 ? "Boa madrugada" : hr < 12 ? "Bom dia" : hr < 18 ? "Boa tarde" : "Boa noite";
      setWho(shell, "#E6E9EE", "Coucou", "");
      setSay(shell, `${hello}! O que vamos fazer?`);
      tiles.forEach((t, i) => (subs[i].textContent = t.sub()));
    },
  };
}

// ── Approval ──────────────────────────────────────────────────────────────────

function buildApproval(actions: ViewActions): ViewHost {
  const who = h("div");
  const code = h("div", { class: "code" });
  const row = h("div", { class: "actions" });
  const el = h("div", { class: "view" }, card("amber", stack(116, 16, who, code, row)));
  let rowKey = "";
  return {
    el,
    sync() {
      clear(who);
      who.append(agentWho(State.focusTask, "precisa da sua permissão"));
      // The whole point of approving here rather than in the terminal: this line
      // is the command, the file path or the URL being authorised, not just the
      // name of the tool asking.
      code.textContent = State.pendingApproval?.command || State.pendingApproval?.tool || "…";
      // Two buttons, built once. Rebuilding them between a mouse-down and a
      // mouse-up would swallow the click, and there is nothing left to vary:
      // "Always" is gone until the remembered-rules list exists to back it.
      if (rowKey === "built") return;
      rowKey = "built";
      clear(row);
      row.append(
        btn("Negar", "secondary", () => actions.decide("deny"), "N"),
        btn("Permitir", "primary", () => actions.decide("allow"), "Y"),
      );
    },
  };
}

// ── Question ──────────────────────────────────────────────────────────────────

function buildQuestion(): ViewHost {
  const who = h("div");
  const title = h("div", { class: "title" });
  const row = h("div", { class: "actions" });
  const el = h("div", { class: "view" }, card("cyan", stack(116, 16, who, title, row)));
  return {
    el,
    sync() {
      clear(who);
      who.append(agentWho(State.focusTask, "Claude Code is asking a question"));
      const task = State.focusTask;
      title.textContent = task?.steps.at(-1) ?? "Claude needs an answer.";
      clear(row);
      row.append(h("div", { class: "sub", text: "Responda no terminal — o Coucou ainda não responde por você." }));
    },
  };
}

// ── Error ─────────────────────────────────────────────────────────────────────

function buildError(actions: ViewActions): ViewHost {
  const who = h("div");
  const title = h("div", { class: "title", text: "O fluxo parou." });
  const detail = h("div", { class: "detail" });
  const row = h("div", { class: "actions" },
    btn("Tentar de novo", "primary", () => actions.setView(State.defaultView())),
    btn("Abrir no n8n", "secondary", () => actions.openUrl("")),
  );
  const el = h("div", { class: "view" }, card("red", stack(116, 16, who, title, detail, row)));
  return {
    el,
    sync() {
      const task = State.focusTask;
      clear(who);
      who.append(agentWho(task, task?.source === "n8n" ? "n8n" : "Claude Code"));
      title.textContent = task?.source === "n8n" ? "O fluxo parou." : "A sessão parou com um erro.";
      detail.textContent = task?.steps.at(-1) ?? "Sem detalhes.";
    },
  };
}

// ── Finished ──────────────────────────────────────────────────────────────────

function buildFinished(actions: ViewActions): ViewHost {
  const who = h("div");
  const title = h("div", { class: "title" });
  const row = h("div", { class: "actions" },
    btn("Abrir terminal", "primary", () => actions.openTerminal()),
    btn("OK", "secondary", () => actions.collapse()),
  );
  const el = h("div", { class: "view" }, card("green", stack(116, 16, who, title, row)));
  return {
    el,
    sync() {
      clear(who);
      who.append(agentWho(State.focusTask, "Claude Code terminou"));
      title.textContent = State.focusTask?.steps.at(-1) ?? "Sessão concluída";
    },
  };
}

// ── Confused ──────────────────────────────────────────────────────────────────

function buildConfused(): ViewHost {
  const body = h(
    "div",
    { class: "stack", style: "padding:0 18px 0 128px" },
    h("div", { class: "title", text: "Calma, muitos cliques!" }),
    h("div", { class: "sub", text: "Me dá um segundinho — volto ao trabalho em três segundos." }),
  );
  return { el: h("div", { class: "view" }, card("pink", body)), sync() {} };
}

// ── Note ──────────────────────────────────────────────────────────────────────

function buildNote(): ViewHost {
  const title = h("div", { class: "title" });
  const c = card("soft", h("div", { class: "stack", style: "padding:0 18px 0 98px" }, title));
  const el = h("div", { class: "view" }, c);
  return {
    el,
    sync() {
      title.textContent = State.noteMessage ?? "";
      // Amber / red when Mochi is warning about something, neutral otherwise.
      const tone = State.noteTone === "danger" ? "red" : State.noteTone === "warn" ? "amber" : "soft";
      c.style.setProperty("--wash", washRGBA(tone));
    },
  };
}

// ── In-island settings ────────────────────────────────────────────────────────
// The handful of things people change while working. Everything else lives in the
// full settings window (the gear at the bottom).

function buildSettings(actions: ViewActions): ViewHost {
  const shell = toolShell("settings-view", "soft");
  setWho(shell, "#E6E9EE", "Ajustes rápidos", "");
  setSay(shell, "Só o essencial. O resto fica em Todas as configurações.");

  const claudeBadge = h("span", { class: "status-badge" });
  const openAll = h(
    "button",
    { class: "btn secondary", onclick: () => actions.openSettingsWindow() },
    svg(ICONS.gear, 11),
    h("span", { text: "Mais ajustes" }),
  );
  shell.foot.append(claudeBadge, openAll);

  const save = () => void Bridge.saveSettings(State.settings);

  const soundSwitch = h("button", { class: "switch", onclick: () => actions.toggleSound() });
  const volume = h("input", {
    type: "range", min: "0", max: "0.2", step: "0.005",
    oninput: (e: Event) => actions.setVolume(Number((e.target as HTMLInputElement).value)),
  }) as HTMLInputElement;

  const autoSeg = h("div", { class: "seg tool-seg" });
  const notchSwitch = h("button", {
    class: "switch",
    title: "Mantém o notch na tela; passe o mouse para abrir",
    onclick: () => {
      State.settings.notchAlwaysVisible = !State.settings.notchAlwaysVisible;
      save();
      State.notify();
    },
  });
  const danceSwitch = h("button", {
    class: "switch",
    onclick: () => {
      State.danceEnabled = !State.danceEnabled;
      try {
        localStorage.setItem("coucou.dance", State.danceEnabled ? "1" : "0");
      } catch {
        // storage blocked: lasts until restart
      }
      State.notify();
    },
  });
  const modeHolder = h("div", {});
  const keys = h("span", { class: "settings-keys" });

  const row = (label: string, ...controls: (Node | null)[]) =>
    h("div", { class: "qs-row" }, h("span", { class: "qs-label", text: label }), h("div", { class: "qs-controls" }, ...controls));

  shell.rightCard.append(
    h(
      "div",
      { class: "qs-list" },
      row("Sons", soundSwitch, volume),
      row("Fechar sozinho", autoSeg),
      row("Notch sempre visível", notchSwitch),
      row("Mochi dança", danceSwitch),
      row("Ditado", modeHolder),
      row("Atalhos", keys),
    ),
  );

  let lastKey = "";

  return {
    el: shell.el,
    sync() {
      const s = State.settings;
      const key = JSON.stringify([s.soundEnabled, s.soundVolume, s.autoCloseInterval, s.notchAlwaysVisible, s.hotkeyToggle, s.hotkeyDictate, s.hooksInstalled, State.danceEnabled, State.whisper.mode, State.whisper.lang]);
      if (key === lastKey) return;
      lastKey = key;

      soundSwitch.classList.toggle("on", s.soundEnabled);
      volume.value = String(s.soundVolume);
      volume.style.opacity = s.soundEnabled ? "1" : "0.4";
      notchSwitch.classList.toggle("on", s.notchAlwaysVisible);
      danceSwitch.classList.toggle("on", State.danceEnabled);

      clear(autoSeg);
      for (const secs of [10, 15, 30, 60]) {
        autoSeg.append(
          h("button", {
            class: s.autoCloseInterval === secs ? "on" : "",
            text: `${secs}s`,
            onclick: () => actions.setAutoClose(secs),
          }),
        );
      }

      clear(modeHolder);
      modeHolder.append(
        segmented(
          [
            { value: "type", label: "Digitar", title: "Escreve onde o cursor estiver" },
            { value: "copy", label: "Copiar", title: "Só copia" },
          ],
          State.whisper.mode,
          (m) => {
            State.whisper.mode = m;
            State.notify();
          },
        ),
      );

      keys.textContent = `${s.hotkeyToggle} abre · ${s.hotkeyDictate} dita`;
      clear(claudeBadge);
      claudeBadge.append(dot(s.hooksInstalled ? "#22C55E" : "#F4505E", 6), h("span", { text: "Claude Code" }));
    },
  };
}

// ── Placeholders filled in later stages ───────────────────────────────────────

function buildPlaceholder(title: string, sub: string): ViewHost {
  const body = h(
    "div",
    { class: "stack", style: "padding:0 18px 0 118px" },
    h("div", { class: "title", text: title }),
    h("div", { class: "sub", text: sub }),
  );
  return { el: h("div", { class: "view" }, card(null, body)), sync() {} };
}

// ── Registry ──────────────────────────────────────────────────────────────────

export function buildViews(
  actions: ViewActions,
  onChatHeightChange: () => void,
): Map<IslandViewName, ViewHost> {
  const map = new Map<IslandViewName, ViewHost>();
  map.set("overview", buildOverview(actions));
  map.set("empty", buildEmpty(actions));
  map.set("approval", buildApproval(actions));
  map.set("question", buildQuestion());
  map.set("error", buildError(actions));
  map.set("finished", buildFinished(actions));
  map.set("confused", buildConfused());
  map.set("note", buildNote());
  map.set("settings", buildSettings(actions));
  map.set("prompt", buildPrompt(onChatHeightChange));
  map.set("apps", buildAppsView(actions));
  map.set("spotify", buildSpotifyView(actions));
  map.set("translator", buildTranslatorView(actions));
  map.set("quotas", buildQuotasView(actions));
  map.set("voice", buildVoiceView(actions));
  map.set("clipboard", buildClipboardView(actions));
  map.set("upload", buildUpload());
  map.set("uploading", buildUploading());
  map.set("choose", buildChoose(actions));
  // Not in the Windows v1: sending a file by email, window attach + web result.
  map.set("mail", buildPlaceholder("Sending by email isn't in this version.", ""));
  map.set("searching", buildPlaceholder("Claude is searching…", ""));
  map.set("result", buildPlaceholder("Result", ""));
  return map;
}
