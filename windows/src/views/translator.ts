// Traduzir — paste a text and Mochi translates it.
//
// Default target is the system language. If what you paste is already in the
// system language, it goes to English instead; pick any other language and that
// choice sticks until you change it back ("Auto").

import { h, svg } from "./dom";
import { ICONS } from "./icons";
import { State } from "../core/state";
import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";
import { copyText, setSay, setWash, setWho, toolShell } from "./tools";
import type { ViewHost, ViewActions } from "./views";

const LANGS: [string, string][] = [
  ["pt", "Português"], ["en", "Inglês"], ["es", "Espanhol"], ["fr", "Francês"],
  ["de", "Alemão"], ["it", "Italiano"], ["nl", "Holandês"], ["ja", "Japonês"],
  ["zh-CN", "Chinês"], ["ko", "Coreano"], ["ru", "Russo"], ["ar", "Árabe"],
  ["hi", "Hindi"], ["tr", "Turco"], ["pl", "Polonês"], ["uk", "Ucraniano"],
];

function langName(code: string): string {
  const base = code.toLowerCase();
  const hit = LANGS.find(([c]) => c.toLowerCase() === base) ?? LANGS.find(([c]) => base.startsWith(c.toLowerCase().split("-")[0]));
  return hit ? hit[1] : code.toUpperCase();
}

const same = (a: string, b: string) => a.toLowerCase().split("-")[0] === b.toLowerCase().split("-")[0];

export function buildTranslatorView(_actions: ViewActions): ViewHost {
  const shell = toolShell("translator-view", "green");
  setWho(shell, "#34D399", "Traduzir", "");
  shell.foot.append(h("span", { class: "tool-foot-label", text: "Traduz pelo Google — o texto é enviado." }));

  let systemLang = "pt";
  let userTarget: string | null = null; // null = automatic
  let detected = "";
  let shownTarget = "";
  let seq = 0;
  let debounce: number | null = null;
  let lastError = false;

  void Bridge.getSystemLanguage().then((l) => {
    if (l) systemLang = l;
    paintBar();
  });

  // ── Language bar ──
  const fromChip = h("span", { class: "tr-from" });
  const swapBtn = h("button", { class: "tr-swap", title: "Inverter idiomas", onclick: () => swap() }, svg(ICONS.arrowLeftRight, 11));
  const toBtn = h("button", { class: "tr-to", onclick: () => toggleMenu() });
  const autoBtn = h("button", { class: "tr-auto", title: "Voltar ao automático", onclick: () => setTarget(null) }, h("span", { text: "Auto" }));
  const bar = h("div", { class: "tr-bar" }, fromChip, swapBtn, toBtn, autoBtn);

  const menu = h("div", { class: "tr-menu" });
  for (const [code, name] of LANGS) {
    menu.append(h("button", { text: name, onclick: () => setTarget(code) }));
  }

  // ── Text areas ──
  const input = h("textarea", {
    class: "tr-input",
    placeholder: "Cole ou digite o texto…",
    rows: 2,
    spellcheck: "false",
  }) as HTMLTextAreaElement;
  const pasteBtn = h("button", { class: "tr-icon", title: "Colar", onclick: () => void paste() }, svg(ICONS.doc, 12));
  const inputWrap = h("div", { class: "tr-input-wrap" }, input, pasteBtn);

  const output = h("div", { class: "tr-output" });
  const copyBtn = h("button", { class: "tr-icon tr-copy", title: "Copiar tradução", onclick: () => void copy() }, svg(ICONS.copy, 12));
  const outputWrap = h("div", { class: "tr-output-wrap" }, output, copyBtn);

  shell.rightCard.append(bar, inputWrap, outputWrap, menu);
  shell.rightCard.classList.add("tr-right");

  function paintBar() {
    fromChip.textContent = detected ? langName(detected) : "Detectar";
    fromChip.classList.toggle("dim", !detected);
    toBtn.textContent = `${langName(userTarget ?? (shownTarget || systemLang))} ▾`;
    autoBtn.style.display = userTarget ? "" : "none";
  }

  function toggleMenu(force?: boolean) {
    menu.classList.toggle("open", force ?? !menu.classList.contains("open"));
  }

  function setTarget(code: string | null) {
    userTarget = code;
    toggleMenu(false);
    Sound.play("blip");
    paintBar();
    void run();
  }

  function swap() {
    // Send the translation back the other way: its language becomes the target.
    if (!detected) return;
    const out = output.textContent ?? "";
    if (output.classList.contains("has-content") && out) input.value = out;
    setTarget(detected);
  }

  async function paste() {
    try {
      input.value = await navigator.clipboard.readText();
      void run();
    } catch {
      input.focus();
      setSay(shell, "Não consegui ler a área de transferência. Cole com Ctrl+V.");
    }
  }

  async function copy() {
    const text = State.translation.translatedText;
    if (!text) return;
    if (await copyText(text)) {
      Sound.play("finish");
      copyBtn.classList.add("done");
      window.setTimeout(() => copyBtn.classList.remove("done"), 1200);
    }
  }

  async function run() {
    const text = input.value.trim();
    const mine = ++seq;
    lastError = false;
    if (!text) {
      State.translation.translatedText = "";
      State.translation.isTranslating = false;
      detected = "";
      shownTarget = "";
      output.textContent = "";
      output.classList.remove("has-content");
      paintBar();
      State.notify();
      return;
    }

    State.translation.isTranslating = true;
    output.classList.add("has-content", "loading");
    if (!output.textContent) output.textContent = "…";
    State.notify();

    let res = await Bridge.translateText(text, "auto", userTarget ?? systemLang);
    // Already in the system language? Then the useful translation is English.
    if (!userTarget && res && same(res.detectedSourceLang, systemLang) && !same(systemLang, "en")) {
      res = await Bridge.translateText(text, "auto", "en");
    }
    if (mine !== seq) return; // a newer keystroke superseded this one

    State.translation.isTranslating = false;
    output.classList.remove("loading");
    if (res && res.translatedText) {
      State.translation.translatedText = res.translatedText;
      output.textContent = res.translatedText;
      detected = res.detectedSourceLang && res.detectedSourceLang !== "auto" ? res.detectedSourceLang : "";
      shownTarget = res.targetLang;
      Sound.play("blip");
    } else {
      lastError = true;
      output.textContent = "Sem conexão com o tradutor.";
    }
    paintBar();
    State.notify();
  }

  input.addEventListener("paste", () => window.setTimeout(() => void run(), 60));
  input.addEventListener("input", () => {
    if (debounce != null) window.clearTimeout(debounce);
    debounce = window.setTimeout(() => void run(), 400);
  });
  input.addEventListener("keydown", (e) => e.stopPropagation()); // Esc closes the island, not the field

  function render() {
    const has = !!input.value.trim();
    if (State.translation.isTranslating) {
      setSay(shell, "Traduzindo…");
      setWash(shell, "indigo");
    } else if (lastError) {
      setSay(shell, "Sem internet? Eu tento de novo quando você mexer no texto.");
      setWash(shell, "red");
    } else if (has && detected && State.translation.translatedText) {
      setSay(shell, `Do ${langName(detected).toLowerCase()} para o ${langName(shownTarget).toLowerCase()}.`);
      setWash(shell, "green");
    } else {
      setSay(shell, "Cole um texto e eu traduzo na hora.");
      setWash(shell, "green");
    }
    paintBar();
    copyBtn.style.display = State.translation.translatedText ? "" : "none";
  }

  paintBar();

  return {
    el: shell.el,
    sync: render,
    focus: () => {
      window.setTimeout(() => input.focus(), 120);
    },
  };
}
