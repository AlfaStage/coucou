// Smart multi-language clipboard and quick translator view for Coucou.
// Uses Coucou's authentic Two-Card frosted glass layout (160px height).

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
];

export function buildTranslatorView(_actions: ViewActions): ViewHost {
  const leftWho = h("div", { class: "who" });
  const leftBody = h("div", { class: "translator-left-body" });
  const leftCard = h(
    "div",
    { class: "card translator-left-card" },
    h("div", { class: "card-body" }, leftWho, leftBody),
  );

  let targetLang = "pt";
  let sourceLang = "auto";
  let debounceTimer: number | null = null;

  void Bridge.getSystemLanguage().then((lang) => {
    if (lang) {
      targetLang = lang;
      renderLeft();
    }
  });

  const langPills = h("div", { class: "translator-targets" });

  function renderLeft() {
    clear(leftWho);
    leftWho.append(
      dot("#10B981", 7),
      h("span", { class: "name", text: "Tradutor" }),
      h("span", { class: "tool", text: `${sourceLang === "auto" ? "Auto" : sourceLang.toUpperCase()} → ${targetLang.toUpperCase()}` }),
    );

    clear(langPills);
    for (const opt of LANG_OPTIONS) {
      const btn = h("button", {
        class: opt.code === targetLang ? "lang-pill-btn on" : "lang-pill-btn",
        text: opt.label,
        onclick: () => {
          targetLang = opt.code;
          renderLeft();
          void runTranslation();
        },
      });
      langPills.append(btn);
    }

    const swapBtn = h(
      "button",
      {
        class: "translator-swap-btn",
        title: "Inverter idiomas",
        onclick: () => {
          if (targetLang === "pt") targetLang = "en";
          else targetLang = "pt";
          renderLeft();
          void runTranslation();
        },
      },
      svg(ICONS.arrowLeftRight, 10),
      h("span", { text: "Inverter" }),
    );

    clear(leftBody);
    leftBody.append(
      h("div", { class: "translator-target-row" }, h("span", { class: "hint", text: "Idioma de destino:" }), langPills),
      h("div", { class: "translator-sub-row" }, swapBtn, h("span", { class: "apps-sub-hint", text: "Zero-Token GTX" })),
    );
  }

  // Right card: input and live translation
  const inputEl = h("textarea", {
    class: "translator-input",
    placeholder: "Cole ou digite o texto para traduzir…",
    rows: 2,
    spellcheck: "false",
  }) as HTMLTextAreaElement;

  const outputEl = h("div", {
    class: "translator-output",
    text: "A tradução aparecerá aqui automaticamente…",
  });

  const copyBtn = h(
    "button",
    {
      class: "btn secondary copy-btn",
      title: "Copiar tradução",
      onclick: async () => {
        const text = State.translation.translatedText;
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          Sound.play("finish");
          clear(copyBtn);
          copyBtn.append(svg(ICONS.check, 10), h("span", { text: "Copiado!" }));
          setTimeout(() => {
            clear(copyBtn);
            copyBtn.append(svg(ICONS.copy, 10), h("span", { text: "Copiar" }));
          }, 1500);
        } catch {
          // ignore clipboard errors
        }
      },
    },
    svg(ICONS.copy, 10),
    h("span", { text: "Copiar" }),
  );

  const clearBtn = h(
    "button",
    {
      class: "btn secondary clear-btn",
      title: "Limpar texto",
      onclick: () => {
        inputEl.value = "";
        State.translation.sourceText = "";
        State.translation.translatedText = "";
        outputEl.textContent = "A tradução aparecerá aqui automaticamente…";
        outputEl.classList.remove("has-content");
      },
    },
    svg(ICONS.xmark, 9),
    h("span", { text: "Limpar" }),
  );

  const statusLabel = h("span", { class: "translator-status-label", text: "Pronto" });
  const actionsRow = h("div", { class: "translator-actions-row" }, statusLabel, clearBtn, copyBtn);
  const rightCard = h(
    "div",
    { class: "card translator-right-card" },
    inputEl,
    outputEl,
    actionsRow,
  );

  const el = h(
    "div",
    { class: "view overview translator-view" },
    h("div", { class: "left" }, leftCard),
    h("div", { class: "right" }, rightCard),
  );

  async function runTranslation() {
    const text = inputEl.value.trim();
    if (!text) {
      outputEl.textContent = "A tradução aparecerá aqui automaticamente…";
      outputEl.classList.remove("has-content");
      statusLabel.textContent = "Pronto";
      State.translation.translatedText = "";
      return;
    }

    outputEl.textContent = "Traduzindo…";
    outputEl.classList.add("has-content");
    statusLabel.textContent = "Traduzindo…";
    State.translation.isTranslating = true;

    const res = await Bridge.translateText(text, sourceLang === "auto" ? undefined : sourceLang, targetLang);
    State.translation.isTranslating = false;

    if (res && res.translatedText) {
      State.translation.translatedText = res.translatedText;
      outputEl.textContent = res.translatedText;
      statusLabel.textContent = res.detectedSourceLang ? `Detectado: ${res.detectedSourceLang.toUpperCase()}` : "Traduzido";
      if (res.detectedSourceLang && res.detectedSourceLang !== "auto" && res.detectedSourceLang !== sourceLang) {
        sourceLang = res.detectedSourceLang;
        renderLeft();
      }
      Sound.play("blip");
    } else {
      outputEl.textContent = "Não foi possível traduzir. Verifique a conexão.";
      statusLabel.textContent = "Erro de rede";
    }
  }

  inputEl.addEventListener("paste", () => {
    setTimeout(() => void runTranslation(), 60);
  });

  inputEl.addEventListener("input", () => {
    if (debounceTimer != null) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => void runTranslation(), 350);
  });

  renderLeft();

  return {
    el,
    sync: () => {
      renderLeft();
    },
    focus: () => {
      inputEl.focus();
    },
  };
}
