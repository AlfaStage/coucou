// Ditar — local dictation. Tap the mic (or press the dictation shortcut), talk,
// and the words appear where your cursor is, or land on the clipboard. Mochi
// listens with you: the waveform is his, and he leans into the sound while you
// speak. The speech engine downloads itself the first time — nothing to install.

import { h, svg, clear } from "./dom";
import { ICONS } from "./icons";
import { State } from "../core/state";
import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";
import { startSetup, toggleListening, watchWhisperSetup } from "../island/voice";
import { copyText, segmented, setSay, setWash, setWho, toolShell } from "./tools";
import type { ViewHost, ViewActions } from "./views";

const BARS = 18;

export function buildVoiceView(actions: ViewActions): ViewHost {
  const shell = toolShell("voice-view", "cyan");
  setWho(shell, "#22D3EE", "Ditar", "offline");
  watchWhisperSetup();

  // ── Left foot: where the words go, and in which language ──
  const modeHolder = h("div", { class: "tool-foot-row" });
  const langHolder = h("div", { class: "tool-foot-row" });
  shell.foot.append(modeHolder, langHolder);

  // Language spoken. Auto-detect guesses wrong on short clips, so the default is the
  // system language; English and Auto are one tap away.
  let systemLang = "pt";
  void Bridge.getSystemLanguage().then((l) => {
    if (l) systemLang = l.split("-")[0].toLowerCase();
    if (!State.whisper.lang) State.whisper.lang = systemLang;
    lastKey = "";
    State.notify();
  });

  // ── Right card ──
  const micBtn = h("button", { class: "voice-mic", onclick: () => void onMic() });
  const timer = h("span", { class: "voice-timer" });
  const bars = Array.from({ length: BARS }, () => h("i"));
  const wave = h("div", { class: "voice-wave" }, ...bars);
  const status = h("div", { class: "voice-status" });
  const progress = h("div", { class: "voice-progress" }, h("i"));
  const topRow = h(
    "div",
    { class: "voice-top" },
    micBtn,
    h("div", { class: "voice-top-main" }, wave, progress, h("div", { class: "voice-status-row" }, status, timer)),
  );

  const box = h("div", { class: "voice-box" });
  const copyBtn = h("button", { class: "btn secondary", onclick: () => void onCopy() }, svg(ICONS.copy, 10), h("span", { text: "Copiar" }));
  const askBtn = h("button", { class: "btn secondary", onclick: () => onAsk() }, svg(ICONS.bubble, 10), h("span", { text: "Perguntar à IA" }));
  const typeBtn = h("button", { class: "btn secondary", onclick: () => void onRetype() }, svg(ICONS.terminal, 10), h("span", { text: "Digitar" }));
  const clearBtn = h("button", { class: "btn secondary icon-only", title: "Limpar", onclick: () => onClear() }, svg(ICONS.xmark, 9));
  const actionRow = h("div", { class: "voice-actions" }, copyBtn, askBtn, typeBtn, clearBtn);
  shell.rightCard.append(topRow, box, actionRow);
  shell.rightCard.classList.add("voice-right");

  let lastKey = "";

  async function refreshEngine() {
    const st = await Bridge.whisperStatus();
    if (st && State.whisper.engine !== "setting_up") {
      State.whisper.engine = st.state;
      State.whisper.downloadMb = st.downloadMb;
      State.notify();
    }
  }

  async function onMic() {
    Sound.play("blip");
    if (State.whisper.engine === "setting_up") return;
    if (State.whisper.engine === "needs_setup") {
      await startSetup();
      return;
    }
    await toggleListening();
  }

  async function onCopy() {
    if (!State.whisper.lastTranscription) return;
    const ok = await copyText(State.whisper.lastTranscription);
    flash(copyBtn, ok ? "Copiado" : "Não consegui", ICONS.check);
    if (ok) Sound.play("finish");
  }

  async function onRetype() {
    if (!State.whisper.lastTranscription) return;
    Sound.play("blip");
    await Bridge.typeTextIntoActiveWindow(State.whisper.lastTranscription);
  }

  function onAsk() {
    if (!State.whisper.lastTranscription) return;
    State.chatDraft = State.whisper.lastTranscription;
    actions.setView("prompt");
  }

  function onClear() {
    State.whisper.lastTranscription = "";
    State.whisper.error = null;
    State.notify();
  }

  function flash(btn: HTMLElement, label: string, icon: string) {
    const original = Array.from(btn.childNodes);
    clear(btn);
    btn.append(svg(icon, 10), h("span", { text: label }));
    window.setTimeout(() => {
      clear(btn);
      btn.append(...original);
    }, 1400);
  }

  function render() {
    const w = State.whisper;
    const key = [w.phase, w.mode, w.lang, w.lastTranscription, w.error, w.engine, Math.round(w.setupPercent)].join("|");
    if (key === lastKey) return;
    lastKey = key;

    clear(modeHolder);
    modeHolder.append(
      segmented(
        [
          { value: "type", label: "Digitar", title: "Escreve onde o cursor estiver" },
          { value: "copy", label: "Copiar", title: "Só copia para você colar" },
        ],
        w.mode,
        (m) => {
          State.whisper.mode = m;
          Sound.play("blip");
          State.notify();
        },
      ),
    );

    clear(langHolder);
    const langs: { value: string; label: string; title: string }[] = [
      { value: systemLang, label: systemLang.toUpperCase(), title: "Idioma do sistema" },
    ];
    if (systemLang !== "en") langs.push({ value: "en", label: "EN", title: "Inglês" });
    langs.push({ value: "auto", label: "Auto", title: "Detectar o idioma (pode errar em frases curtas)" });
    langHolder.append(
      segmented(langs, w.lang || systemLang, (l) => {
        State.whisper.lang = l;
        try {
          localStorage.setItem("coucou.whisperLang", l);
        } catch {
          // storage blocked: lasts until restart
        }
        Sound.play("blip");
        State.notify();
      }),
    );

    const listening = w.phase === "listening";
    const busy = w.phase === "transcribing";
    const settingUp = w.engine === "setting_up";
    const needsSetup = w.engine === "needs_setup";
    micBtn.className = listening ? "voice-mic listening" : busy || settingUp ? "voice-mic busy" : "voice-mic";
    micBtn.title = listening ? "Parar e transcrever" : needsSetup ? "Baixar o motor de voz" : "Falar";
    clear(micBtn);
    micBtn.append(svg(listening ? ICONS.check : needsSetup ? ICONS.arrowUp : ICONS.mic, 20));
    wave.classList.toggle("on", listening);
    progress.classList.toggle("on", settingUp);
    (progress.firstElementChild as HTMLElement).style.width = `${w.setupPercent}%`;
    wave.style.display = settingUp ? "none" : "";

    let say = "Toque no microfone e fale. Eu escrevo para você.";
    let wash: "cyan" | "red" | "indigo" | "green" = "cyan";
    let line = w.mode === "type" ? "Escrevo onde o cursor estiver." : "Copio o texto para você colar.";
    if (settingUp) {
      say = "Preparando o ditado… só na primeira vez!";
      line = `Baixando o motor de voz (${w.downloadMb || 68} MB) · ${Math.round(w.setupPercent)}%`;
      wash = "indigo";
    } else if (needsSetup) {
      say = "Antes de ouvir, preciso baixar o motor de voz. É uma vez só.";
      line = `Toque no botão para baixar (${w.downloadMb || 68} MB).`;
      wash = "indigo";
    } else if (listening) {
      say = "Estou ouvindo! Toque de novo quando terminar.";
      line = "Ouvindo…";
    } else if (busy) {
      say = "Hmm, deixa eu escrever isso…";
      line = "Transcrevendo no seu PC…";
      wash = "indigo";
    } else if (w.error) {
      say = "Ops. Não deu dessa vez.";
      line = w.error;
      wash = "red";
    } else if (w.lastTranscription) {
      say = w.mode === "type" ? "Pronto! Já escrevi lá." : "Pronto! Copiei para você.";
      line = `${w.lastTranscription.split(/\s+/).length} palavras`;
      wash = "green";
    }
    setSay(shell, say);
    setWash(shell, wash);
    status.textContent = line;
    status.classList.toggle("error", !!w.error && !listening && !settingUp);

    box.classList.toggle("has-text", !!w.lastTranscription);
    box.textContent = w.lastTranscription || "O que você ditar aparece aqui.";

    const has = !!w.lastTranscription;
    for (const b of [copyBtn, askBtn, typeBtn, clearBtn]) (b as HTMLButtonElement).disabled = !has;
    typeBtn.style.display = w.mode === "type" ? "" : "none";
  }

  return {
    el: shell.el,
    sync: render,
    focus: () => {
      void refreshEngine();
    },
    tick: (now: number) => {
      const w = State.whisper;
      if (w.phase === "listening") {
        const secs = Math.floor((now - w.startedAt) / 1000);
        timer.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
        bars.forEach((b, i) => {
          // Centre bars move most; a little phase keeps it alive when the room is quiet.
          const centre = 1 - Math.abs(i - (BARS - 1) / 2) / (BARS / 2);
          const v = 0.12 + w.level * centre * 1.1 + 0.05 * Math.sin(now / 140 + i);
          b.style.transform = `scaleY(${Math.min(1, Math.max(0.1, v))})`;
        });
      } else if (timer.textContent) {
        timer.textContent = "";
        bars.forEach((b) => (b.style.transform = ""));
      }
    },
  };
}
