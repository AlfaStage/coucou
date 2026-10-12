// Copiados — the Windows clipboard history (Win+V) inside the island.
//
// The list is Windows' own; Coucou stores nothing. Tapping an item pastes it into
// the window you were typing in: the island never takes focus, so Ctrl+V lands
// where your cursor already is.

import { h, svg, clear } from "./dom";
import { ICONS } from "./icons";
import { State } from "../core/state";
import { Bridge, type ClipboardItem } from "../core/bridge";
import { Sound } from "../core/sound";
import { setSay, setWash, setWho, toolShell } from "./tools";
import type { ViewHost, ViewActions } from "./views";

/** "agora", "há 5 min", "há 2 h", "ontem", "há 3 d". */
function ago(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 45) return "agora";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  if (s < 172800) return "ontem";
  return `há ${Math.floor(s / 86400)} d`;
}

export function buildClipboardView(actions: ViewActions): ViewHost {
  const shell = toolShell("clip-view", "indigo");
  setWho(shell, "#818CF8", "Copiados", "");

  const settingsBtn = h(
    "button",
    {
      class: "btn secondary",
      onclick: () => {
        Sound.play("blip");
        actions.openUrl("ms-settings:clipboard");
      },
    },
    h("span", { text: "Abrir ajustes do Windows" }),
  );
  settingsBtn.style.display = "none";
  shell.foot.append(settingsBtn);

  const list = h("div", { class: "clip-list" });
  shell.rightCard.append(list);

  let items: ClipboardItem[] = [];
  let problem: string | null = null;
  let lastKey = "";
  let pasting = false;

  async function refresh() {
    try {
      items = await Bridge.clipboardHistory();
      problem = null;
    } catch (err) {
      items = [];
      problem = String(err).replace(/^Error:\s*/, "");
    }
    render();
  }

  async function paste(item: ClipboardItem) {
    if (pasting) return;
    pasting = true;
    Sound.play("blip");
    try {
      await Bridge.clipboardPaste(item.id);
      State.emote?.("wink");
      actions.collapse();
    } catch (err) {
      problem = String(err).replace(/^Error:\s*/, "");
      Sound.play("error");
      render();
    } finally {
      pasting = false;
    }
  }

  function row(item: ClipboardItem): HTMLElement {
    const isText = item.kind === "text";
    const preview = isText ? item.text.replace(/\s+/g, " ").trim() : item.text;
    return h(
      "button",
      { class: "clip-row", title: isText ? item.text.slice(0, 400) : item.text, onclick: () => void paste(item) },
      h("span", { class: `clip-icon ${item.kind}` }, svg(isText ? ICONS.doc : ICONS.clipboard, 13)),
      h("span", { class: "clip-text", text: preview || "(vazio)" }),
      h("span", { class: "clip-when", text: ago(item.copiedAt) }),
    );
  }

  function render() {
    const key = JSON.stringify([items.map((i) => [i.id, Math.floor(i.copiedAt / 60000)]), problem]);
    if (key === lastKey) return;
    lastKey = key;

    settingsBtn.style.display = problem && problem.includes("desligado") ? "" : "none";
    if (problem) {
      setSay(shell, "Não consegui ver o que você copiou.");
      setWash(shell, "red");
    } else if (items.length === 0) {
      setSay(shell, "Nada copiado ainda. Copie algo e ele aparece aqui.");
      setWash(shell, "soft");
    } else {
      setSay(shell, `${items.length} ${items.length === 1 ? "item copiado" : "itens copiados"}. Toque para colar.`);
      setWash(shell, "indigo");
    }

    clear(list);
    if (problem) {
      list.append(h("div", { class: "tool-empty", text: problem }));
      return;
    }
    if (items.length === 0) {
      list.append(h("div", { class: "tool-empty", text: "O histórico da área de transferência está vazio." }));
      return;
    }
    for (const item of items.slice(0, 30)) list.append(row(item));
  }

  let timer: number | null = null;

  return {
    el: shell.el,
    sync: () => {
      render();
      if (timer == null) {
        // Windows gives no change notification to apps like this one: look again
        // every couple of seconds, and only while the tab is on screen.
        timer = window.setInterval(() => {
          if (shell.el.classList.contains("on")) void refresh();
        }, 2000);
      }
    },
    focus: () => {
      void refresh();
    },
  };
}
