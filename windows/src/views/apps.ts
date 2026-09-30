// App Shortcuts & Window Switcher view for Coucou.
// Uses Coucou's authentic Two-Card frosted glass layout (160px height).

import { h, svg, dot, clear } from "./dom";
import { ICONS } from "./icons";
import { State } from "../core/state";
import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";
import type { ViewHost, ViewActions } from "./views";

export function buildAppsView(_actions: ViewActions): ViewHost {
  const leftWho = h("div", { class: "who" });
  const leftStatus = h("div", { class: "apps-left-status" });
  const leftCard = h(
    "div",
    { class: "card apps-left-card" },
    h("div", { class: "card-body" }, leftWho, leftStatus),
  );

  const pillsGrid = h("div", { class: "apps-pills-grid" });
  const rightCard = h("div", { class: "card apps-right-card" }, pillsGrid);

  const el = h(
    "div",
    { class: "view overview apps-view" },
    h("div", { class: "left" }, leftCard),
    h("div", { class: "right" }, rightCard),
  );

  async function refresh() {
    const list = await Bridge.listAppShortcuts();
    if (list) {
      State.shortcuts = list;
      render();
    }
  }

  function render() {
    const shortcuts = State.shortcuts;
    const runningCount = shortcuts.filter((s) => s.isOpen).length;

    // Render left card
    clear(leftWho);
    leftWho.append(
      dot("#3B82F6", 7),
      h("span", { class: "name", text: "Atalhos & Janelas" }),
      h("span", { class: "tool", text: "Win32" }),
    );

    clear(leftStatus);
    leftStatus.append(
      h(
        "div",
        { class: "apps-count-pill" },
        dot("#22C55E", 6),
        h("span", { text: `${runningCount} ${runningCount === 1 ? "aberto" : "abertos"}` }),
      ),
      h("div", { class: "apps-sub-hint", text: "Clique para alternar janela ou iniciar app" }),
    );

    // Render right card with Coucou 2-column pills grid
    clear(pillsGrid);
    for (const item of shortcuts) {
      const iconKey = (item.icon in ICONS ? item.icon : "apps") as keyof typeof ICONS;
      const isOpen = item.isOpen;

      const pill = h(
        "button",
        {
          class: isOpen ? "app-pill open" : "app-pill",
          title: isOpen
            ? `${item.name} (${item.windowTitle || "Em execução"}) — Focar janela`
            : `${item.name} — Iniciar aplicativo`,
          onclick: async () => {
            Sound.play(isOpen ? "focus" : "blip");
            await Bridge.launchOrFocusApp(item.id);
            setTimeout(() => void refresh(), 600);
          },
        },
        h("div", { class: "app-pill-icon" }, svg(ICONS[iconKey], 13)),
        h("span", { class: "app-pill-name", text: item.name }),
        isOpen ? h("span", { class: "app-pill-dot" }) : null,
      );

      pillsGrid.append(pill);
    }
  }

  return {
    el,
    sync: () => {
      render();
      void refresh();
    },
    focus: () => {
      void refresh();
    },
  };
}
