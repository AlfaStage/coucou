// App Shortcuts & Window Switcher view for Coucou.
// Allows instantaneous window focusing if open, or launching if closed.

import { h, svg, dot, clear } from "./dom";
import { ICONS } from "./icons";
import { State } from "../core/state";
import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";
import type { ViewHost, ViewActions } from "./views";

export function buildAppsView(_actions: ViewActions): ViewHost {
  const card = h("div", { class: "card apps-card" });
  const grid = h("div", { class: "apps-grid" });

  async function refresh() {
    const list = await Bridge.listAppShortcuts();
    if (list) {
      State.shortcuts = list;
      render();
    }
  }

  function render() {
    clear(grid);
    const shortcuts = State.shortcuts;

    for (const item of shortcuts) {
      const iconKey = (item.icon in ICONS ? item.icon : "apps") as keyof typeof ICONS;
      const isOpen = item.isOpen;

      const tile = h(
        "button",
        {
          class: isOpen ? "app-tile open" : "app-tile",
          title: isOpen
            ? `${item.name} (Running: ${item.windowTitle || "Open"}) — Click to switch`
            : `${item.name} — Click to launch`,
          onclick: async () => {
            Sound.play(isOpen ? "focus" : "blip");
            await Bridge.launchOrFocusApp(item.id);
            // Refresh shortcuts after a short delay to reflect the launched/focused window
            setTimeout(() => void refresh(), 600);
          },
        },
        h(
          "div",
          { class: "app-tile-icon-wrap" },
          svg(ICONS[iconKey], 20),
          isOpen ? dot("#22C55E", 6) : null,
        ),
        h("span", { class: "app-tile-name", text: item.name }),
      );

      grid.append(tile);
    }
  }

  // Header row
  const head = h(
    "div",
    { class: "int-head apps-head" },
    dot("#3B82F6", 7),
    h("b", { text: "Shortcuts & Switcher" }),
    h("span", { text: "Click to focus or launch" }),
  );

  card.append(head, grid);

  return {
    el: card,
    sync: () => {
      render();
      void refresh();
    },
    focus: () => {
      void refresh();
    },
  };
}
