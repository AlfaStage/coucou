// Shared shell for the tool tabs (Ditar, Traduzir, Música, Apps, Limites).
//
// Every one of them follows the original overview layout: Mochi's card on the
// left, the working card on the right. The left card is where Mochi talks — one
// short sentence about what is happening — so the character stays the centre of
// the feature instead of decorating it.

import { h, dot, clear } from "./dom";
import { washRGBA, type Wash } from "../core/layout";

export interface ToolShell {
  /** The `.view` element to hand back as ViewHost.el. */
  el: HTMLElement;
  leftCard: HTMLElement;
  who: HTMLElement;
  say: HTMLElement;
  foot: HTMLElement;
  rightCard: HTMLElement;
}

export function toolShell(cls: string, wash: Wash): ToolShell {
  const who = h("div", { class: "who" });
  const say = h("div", { class: "tool-say" });
  const foot = h("div", { class: "tool-foot" });
  const leftCard = h(
    "div",
    { class: "card wash tool-left" },
    h("div", { class: "card-body" }, who, say, foot),
  );
  const rightCard = h("div", { class: "card tool-right" });
  const el = h(
    "div",
    { class: `view overview tool-view ${cls}` },
    h("div", { class: "left" }, leftCard),
    h("div", { class: "right" }, rightCard),
  );
  const shell = { el, leftCard, who, say, foot, rightCard };
  setWash(shell, wash);
  return shell;
}

export function setWash(shell: ToolShell, wash: Wash) {
  shell.leftCard.style.setProperty("--wash", washRGBA(wash));
}

export function setWho(shell: ToolShell, color: string, name: string, tag: string) {
  clear(shell.who);
  shell.who.append(dot(color, 7), h("span", { class: "name", text: name }));
  if (tag) shell.who.append(h("span", { class: "tool", text: tag }));
}

/** Mochi's sentence. Only touches the DOM when the words change, so a poll
 *  that re-renders every second never restarts the fade. */
export function setSay(shell: ToolShell, text: string) {
  if (shell.say.textContent === text) return;
  shell.say.textContent = text;
  shell.say.classList.remove("swap");
  void shell.say.offsetWidth; // restart the CSS animation
  shell.say.classList.add("swap");
}

/** "1 h 35", "42 min", "3 d" — a reset time a person can read at a glance. */
export function formatReset(minutes?: number | null): string {
  if (minutes == null) return "";
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const hr = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${hr} h ${String(m).padStart(2, "0")}` : `${hr} h`;
  }
  const d = Math.floor(minutes / 1440);
  const hr = Math.floor((minutes % 1440) / 60);
  return hr ? `${d} d ${hr} h` : `${d} d`;
}

/** Copies text even when the webview doesn't hold keyboard focus (the island never steals it). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h("textarea", { style: "position:fixed;opacity:0;pointer-events:none" }) as HTMLTextAreaElement;
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** A two-or-more option segmented control, styled like the settings `seg`. */
export function segmented<T extends string>(
  options: { value: T; label: string; title?: string }[],
  current: T,
  onChange: (v: T) => void,
): HTMLElement {
  return h(
    "div",
    { class: "seg tool-seg" },
    ...options.map((o) =>
      h("button", {
        class: o.value === current ? "on" : "",
        title: o.title ?? "",
        text: o.label,
        onclick: () => onChange(o.value),
      }),
    ),
  );
}
