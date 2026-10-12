// Apps — jump to an open window or launch any app on the PC.
//
// The grid shows the apps you pinned (open ones first, with a dot). The search
// box looks through everything installed plus what is open right now, so the
// whole PC is one keystroke away; the star pins or unpins.

import { h, svg, clear } from "./dom";
import { ICONS } from "./icons";
import { State } from "../core/state";
import type { AppShortcutItem } from "../core/state";
import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";
import { setSay, setWash, setWho, toolShell } from "./tools";
import type { ViewHost, ViewActions } from "./views";

/** A tile icon: the known glyph, or the app's initial on a colour picked from its name. */
function appIcon(item: AppShortcutItem, size: number): HTMLElement {
  if (item.icon in ICONS && item.icon !== "apps") {
    return h("span", { class: "app-glyph" }, svg(ICONS[item.icon as keyof typeof ICONS], size));
  }
  let hash = 0;
  for (const c of item.name) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return h("span", {
    class: "app-glyph letter",
    style: `background:hsl(${hue} 45% 32%);color:hsl(${hue} 80% 88%)`,
    text: item.name.trim().charAt(0).toUpperCase(),
  });
}

/** Short label for a tile: "Google Chrome" → "Chrome", "Visual Studio Code" → "VS Code". */
function shortName(name: string): string {
  const fixed: Record<string, string> = {
    "visual studio code": "VS Code",
    "explorador de arquivos": "Arquivos",
    "windows terminal": "Terminal",
  };
  const hit = fixed[name.toLowerCase()];
  if (hit) return hit;
  return name.replace(/^(google|microsoft|windows|adobe)\s+/i, "");
}

export function buildAppsView(_actions: ViewActions): ViewHost {
  const shell = toolShell("apps-view", "indigo");
  setWho(shell, "#6366F1", "Apps", "");
  shell.foot.append(h("span", { class: "tool-foot-label", text: "Busque qualquer app do PC e fixe com ★" }));

  const search = h("input", {
    class: "apps-search",
    type: "text",
    placeholder: "Buscar app ou janela…",
    spellcheck: "false",
  }) as HTMLInputElement;
  const grid = h("div", { class: "apps-grid" });
  const results = h("div", { class: "apps-results" });
  shell.rightCard.append(search, grid, results);
  shell.rightCard.classList.add("apps-right");

  let pinned: AppShortcutItem[] = [];
  let found: AppShortcutItem[] = [];
  let query = "";
  let timer: number | null = null;
  let searchSeq = 0;

  async function open(item: AppShortcutItem) {
    Sound.play(item.isOpen ? "focus" : "blip");
    await Bridge.launchOrFocusApp(item.id);
    window.setTimeout(() => void refresh(), 700);
  }

  async function togglePin(item: AppShortcutItem, e: Event) {
    e.stopPropagation();
    Sound.play("blip");
    await Bridge.togglePinApp(item.id);
    await refresh();
  }

  async function refresh() {
    const list = await Bridge.listAppShortcuts();
    if (list) {
      pinned = list;
      State.shortcuts = list;
    }
    if (query) found = await Bridge.searchApps(query);
    render();
  }

  function tile(item: AppShortcutItem): HTMLElement {
    return h(
      "button",
      {
        class: item.isOpen ? "app-tile open" : "app-tile",
        title: item.isOpen ? `${item.name} — ${item.windowTitle || "aberto"}` : `${item.name} — abrir`,
        onclick: () => void open(item),
      },
      appIcon(item, 18),
      h("span", { class: "app-tile-name", text: shortName(item.name) }),
      item.isOpen ? h("i", { class: "app-tile-dot" }) : null,
      h("span", { class: "app-tile-pin", title: "Desafixar", onclick: (e: Event) => void togglePin(item, e) }, "×"),
    );
  }

  function row(item: AppShortcutItem): HTMLElement {
    return h(
      "button",
      { class: "app-row", onclick: () => void open(item) },
      appIcon(item, 14),
      h("span", { class: "app-row-name", text: item.name }),
      item.isOpen ? h("span", { class: "app-row-open", text: "aberto" }) : h("span", { class: "app-row-open off", text: "abrir" }),
      h(
        "span",
        {
          class: item.pinned ? "app-row-star on" : "app-row-star",
          title: item.pinned ? "Desafixar" : "Fixar",
          onclick: (e: Event) => void togglePin(item, e),
        },
        "★",
      ),
    );
  }

  function render() {
    const searching = query.length > 0;
    grid.style.display = searching ? "none" : "";
    results.style.display = searching ? "" : "none";

    const openCount = pinned.filter((p) => p.isOpen).length;
    setSay(
      shell,
      searching
        ? found.length
          ? "Achei! Toque para abrir ou ir até a janela."
          : "Não achei nada com esse nome."
        : openCount
          ? `${openCount} ${openCount === 1 ? "app aberto" : "apps abertos"}. Toque para ir até a janela.`
          : "Nada aberto por aqui. Toque num app para abrir.",
    );
    setWash(shell, "indigo");

    clear(grid);
    for (const item of pinned.slice(0, 12)) grid.append(tile(item));

    clear(results);
    if (searching) {
      if (found.length === 0) results.append(h("div", { class: "tool-empty", text: "Nenhum app encontrado." }));
      for (const item of found) results.append(row(item));
    }
  }

  search.addEventListener("input", () => {
    query = search.value.trim();
    if (timer != null) window.clearTimeout(timer);
    const mine = ++searchSeq;
    timer = window.setTimeout(async () => {
      if (!query) {
        found = [];
        render();
        return;
      }
      const res = await Bridge.searchApps(query);
      if (mine === searchSeq) {
        found = res;
        render();
      }
    }, 120);
    if (!query) render();
  });
  search.addEventListener("keydown", (e) => {
    e.stopPropagation(); // Esc closes the island, not the field
    if (e.key === "Enter" && found[0]) void open(found[0]);
    if (e.key === "Escape") {
      search.value = "";
      query = "";
      render();
    }
  });

  let poll: number | null = null;

  return {
    el: shell.el,
    sync: () => {
      render();
      if (poll == null) {
        // Window list refresh, only while this tab is on screen.
        poll = window.setInterval(() => {
          if (shell.el.classList.contains("on") && !query) void refresh();
        }, 3000);
      }
    },
    focus: () => {
      void refresh();
    },
  };
}
