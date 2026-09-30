// Dedicated Whisper Speech-to-Text & Voice Dictation view for Coucou.
// Uses Coucou's authentic Two-Card frosted glass layout (160px height).
// Complete live visual feedback: animated waveform, mode selector, and 1-click typing.

import { h, svg, dot, clear } from "./dom";
import { ICONS } from "./icons";
import { State } from "../core/state";
import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";
import { toggleListening } from "../island/voice";
import type { ViewHost, ViewActions } from "./views";

export function buildVoiceView(_actions: ViewActions): ViewHost {
  const leftWho = h("div", { class: "who" });
  const leftBody = h("div", { class: "voice-left-body" });
  const leftCard = h(
    "div",
    { class: "card voice-left-card" },
    h("div", { class: "card-body" }, leftWho, leftBody),
  );

  const rightBody = h("div", { class: "voice-right-body" });
  const rightCard = h("div", { class: "card voice-right-card" }, rightBody);

  const el = h(
    "div",
    { class: "view overview voice-view" },
    h("div", { class: "left" }, leftCard),
    h("div", { class: "right" }, rightCard),
  );

  let currentMode: "type" | "prompt" = State.whisper.mode || "type";
  let elapsedTimer: number | null = null;
  let elapsedSeconds = 0;

  function render() {
    const isListening = State.whisper.isListening;
    const lastText = State.whisper.lastTranscription;

    // Render left card
    clear(leftWho);
    leftWho.append(
      dot("#06B6D4", 7),
      h("span", { class: "name", text: "Ditado Whisper" }),
      h("span", { class: "tool", text: isListening ? "Gravando" : "Pronto" }),
    );

    // Mode Selector Pills
    const modeTypeBtn = h(
      "button",
      {
        class: currentMode === "type" ? "voice-mode-btn on" : "voice-mode-btn",
        title: "Digita o texto diretamente na janela ativa (VS Code, Bloco de Notas, etc.)",
        onclick: () => {
          currentMode = "type";
          State.whisper.mode = "type";
          Sound.play("blip");
          render();
        },
      },
      svg(ICONS.terminal, 10),
      h("span", { text: "Digitar no Cursor" }),
    );

    const modePromptBtn = h(
      "button",
      {
        class: currentMode === "prompt" ? "voice-mode-btn on" : "voice-mode-btn",
        title: "Copia o texto e insere na caixa de prompt da IA",
        onclick: () => {
          currentMode = "prompt";
          State.whisper.mode = "prompt";
          Sound.play("blip");
          render();
        },
      },
      svg(ICONS.bubble, 10),
      h("span", { text: "Copiar / IA" }),
    );

    const modesRow = h("div", { class: "voice-modes-row" }, modeTypeBtn, modePromptBtn);

    clear(leftBody);
    leftBody.append(
      h(
        "div",
        { class: isListening ? "voice-status-pill listening" : "voice-status-pill" },
        dot(isListening ? "#EF4444" : "#06B6D4", 6),
        h("span", { text: isListening ? `Ouvindo (${elapsedSeconds}s)…` : "Pronto para falar" }),
      ),
      modesRow,
      h("div", { class: "apps-sub-hint", text: "Modelo Whisper base.pt local (0 tokens)" }),
    );

    // Render right card
    clear(rightBody);

    // Waveform Animation element
    const waveEl = h(
      "div",
      { class: isListening ? "voice-waveform active" : "voice-waveform" },
      h("span", { class: "bar b1" }),
      h("span", { class: "bar b2" }),
      h("span", { class: "bar b3" }),
      h("span", { class: "bar b4" }),
      h("span", { class: "bar b5" }),
    );

    // Big Action Button
    const recordBtn = h(
      "button",
      {
        class: isListening ? "voice-action-btn listening" : "voice-action-btn",
        title: isListening ? "Clique para finalizar gravação e transcrever" : "Clique para começar a falar",
        onclick: async () => {
          Sound.play("blip");
          if (!isListening) {
            elapsedSeconds = 0;
            if (elapsedTimer != null) clearInterval(elapsedTimer);
            elapsedTimer = window.setInterval(() => {
              elapsedSeconds++;
              render();
            }, 1000);
          } else {
            if (elapsedTimer != null) {
              clearInterval(elapsedTimer);
              elapsedTimer = null;
            }
          }
          await toggleListening(currentMode);
          render();
        },
      },
      svg(isListening ? ICONS.timer : ICONS.mic, 14),
      h("span", { text: isListening ? `Parar e Transcrever (${elapsedSeconds}s)` : "Iniciar Gravação ao Vivo" }),
    );

    const topActionRow = h("div", { class: "voice-top-action-row" }, recordBtn, waveEl);

    // Transcription Output Display
    const textOutput = h("div", {
      class: lastText ? "voice-transcription-box has-text" : "voice-transcription-box",
      text: lastText || "O que você ditar aparecerá aqui em tempo real…",
    });

    // Bottom Tools: Copy, Type, Clear, Demo
    const copyBtn = h(
      "button",
      {
        class: "btn secondary",
        title: "Copiar texto transcrito",
        onclick: async () => {
          if (!State.whisper.lastTranscription) return;
          try {
            await navigator.clipboard.writeText(State.whisper.lastTranscription);
            Sound.play("finish");
            clear(copyBtn);
            copyBtn.append(svg(ICONS.check, 10), h("span", { text: "Copiado!" }));
            setTimeout(() => {
              clear(copyBtn);
              copyBtn.append(svg(ICONS.copy, 10), h("span", { text: "Copiar" }));
            }, 1500);
          } catch {
            // ignore
          }
        },
      },
      svg(ICONS.copy, 10),
      h("span", { text: "Copiar" }),
    );

    const typeBtn = h(
      "button",
      {
        class: "btn secondary",
        title: "Digitar no cursor ativo agora",
        onclick: async () => {
          if (!State.whisper.lastTranscription) return;
          Sound.play("finish");
          await Bridge.typeTextIntoActiveWindow(State.whisper.lastTranscription);
        },
      },
      svg(ICONS.terminal, 10),
      h("span", { text: "Digitar Novamente" }),
    );

    const clearBtn = h(
      "button",
      {
        class: "btn secondary",
        title: "Limpar texto",
        onclick: () => {
          State.whisper.lastTranscription = "";
          render();
        },
      },
      svg(ICONS.xmark, 9),
      h("span", { text: "Limpar" }),
    );

    const demoBtn = h(
      "button",
      {
        class: "btn secondary voice-demo-btn",
        title: "Simular fala para teste do Whisper",
        onclick: () => {
          State.whisper.lastTranscription = "O modelo Whisper local transcreveu esta frase perfeitamente sem consumir tokens.";
          Sound.play("finish");
          render();
        },
      },
      h("span", { text: "Simular Ditado" }),
    );

    const bottomRow = h(
      "div",
      { class: "voice-bottom-row" },
      clearBtn,
      copyBtn,
      typeBtn,
      demoBtn,
    );

    rightBody.append(topActionRow, textOutput, bottomRow);
  }

  return {
    el,
    sync: () => {
      render();
    },
    focus: () => {
      render();
    },
  };
}
