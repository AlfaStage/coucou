// Smart multi-language clipboard and quick translator view for Coucou.
// Translates foreign text to system default language (e.g. pt-BR) or English if already in system language.

import { h, svg, dot, clear } from "./dom";
import { ICONS } from "./icons";
import { State } from "../core/state";
import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";
import type { ViewHost, ViewActions } from "./views";

const LANG_OPTIONS = [
  { code: "pt", label: "PT" },
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "fr", label: "FR" },
  { code: "de", label: "DE" },
  { code: "ja", label: "JA" },
];

export function buildTranslatorView(_actions: ViewActions): ViewHost {
  const card = h("div", { class: "card translator-card" });

  let targetLang = "pt";
  let sourceLang = "auto";
  let debounceTimer: number | null = null;

  // Initialize system language
  void Bridge.getSystemLanguage().then((lang) => {
    if (lang) {
      targetLang = lang;
      renderLangPills();
    }
  });

  // 1. Header with Language Selector Pills
  const head = h("div", { class: "int-head translator-head" });
  const langPills = h("div", { class: "translator-lang-pills" });

  function renderLangPills() {
    clear(langPills);
    const srcLabel = sourceLang === "auto" ? "Auto" : sourceLang.toUpperCase();
    const srcBtn = h("span", { class: "lang-pill", text: srcLabel });
    const arrow = svg(ICONS.chevronRight, 9, { stroke: 2 });

    const targetSelect = h("div", { class: "lang-targets" });
    for (const opt of LANG_OPTIONS) {
      const btn = h("button", {
        class: opt.code === targetLang ? "lang-btn on" : "lang-btn",
        text: opt.label,
        onclick: () => {
          targetLang = opt.code;
          renderLangPills();
          void runTranslation();
        },
      });
      targetSelect.append(btn);
    }

    langPills.append(srcBtn, arrow, targetSelect);
  }

  head.append(dot("#10B981", 7), h("b", { text: "Smart Translator" }), langPills);

  // 2. Input and Output Panels
  const inputEl = h("textarea", {
    class: "translator-input",
    placeholder: "Paste or type text to translate...",
    rows: 3,
  }) as HTMLTextAreaElement;

  const outputEl = h("div", {
    class: "translator-output",
    text: "Translation will appear here...",
  });

  const actionsRow = h("div", { class: "translator-actions" });

  const copyBtn = h(
    "button",
    {
      class: "btn secondary copy-btn",
      title: "Copy translation",
      onclick: async () => {
        const text = State.translation.translatedText;
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          Sound.play("finish");
          clear(copyBtn);
          copyBtn.append(svg(ICONS.check, 12), h("span", { text: "Copied!" }));
          setTimeout(() => {
            clear(copyBtn);
            copyBtn.append(svg(ICONS.copy, 12), h("span", { text: "Copy" }));
          }, 1500);
        } catch {
          // ignore clipboard errors
        }
      },
    },
    svg(ICONS.copy, 12),
    h("span", { text: "Copy" }),
  );

  const clearBtn = h(
    "button",
    {
      class: "btn secondary",
      title: "Clear",
      onclick: () => {
        inputEl.value = "";
        State.translation.sourceText = "";
        State.translation.translatedText = "";
        outputEl.textContent = "Translation will appear here...";
      },
    },
    svg(ICONS.xmark, 10),
    h("span", { text: "Clear" }),
  );

  actionsRow.append(clearBtn, copyBtn);

  async function runTranslation() {
    const text = inputEl.value.trim();
    if (!text) {
      outputEl.textContent = "Translation will appear here...";
      State.translation.translatedText = "";
      return;
    }

    outputEl.textContent = "Translating…";
    State.translation.isTranslating = true;

    const res = await Bridge.translateText(text, sourceLang === "auto" ? undefined : sourceLang, targetLang);
    State.translation.isTranslating = false;

    if (res && res.translatedText) {
      State.translation.translatedText = res.translatedText;
      outputEl.textContent = res.translatedText;
      if (res.detectedSourceLang && res.detectedSourceLang !== "auto") {
        sourceLang = res.detectedSourceLang;
        renderLangPills();
      }
      Sound.play("blip");
    } else {
      outputEl.textContent = "Could not translate. Check connection.";
    }
  }

  // Auto-translate on paste or debounced typing
  inputEl.addEventListener("paste", () => {
    setTimeout(() => void runTranslation(), 60);
  });

  inputEl.addEventListener("input", () => {
    if (debounceTimer != null) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => void runTranslation(), 500);
  });

  card.append(head, inputEl, outputEl, actionsRow);
  const el = h("div", { class: "view translator-view" }, card);
  renderLangPills();

  return {
    el,
    sync: () => {
      renderLangPills();
    },
    focus: () => {
      inputEl.focus();
    },
  };
}
