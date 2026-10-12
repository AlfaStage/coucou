// Música — Spotify (or whatever is playing) controlled from the island.
//
// Everything comes from Windows' media session: title, artist, cover, play/pause,
// next/previous. Volume moves Spotify's own slider in the Windows mixer, not the
// master volume. Mochi dances to it while you are on this tab.

import { h, svg, dot, clear } from "./dom";
import { ICONS } from "./icons";
import { State } from "../core/state";
import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";
import { setSay, setWash, setWho, toolShell } from "./tools";
import type { ViewHost, ViewActions } from "./views";

/** The small card the Overview shows for the Spotify pill. */
export function renderSpotifyCard(): HTMLElement {
  const sp = State.spotify;
  const isPlaying = sp.isPlaying;
  const title = sp.title || (isPlaying ? "Spotify" : "Pausado");
  const artist = sp.artist || (isPlaying ? "Reproduzindo" : "Nenhuma faixa ativa");

  return h(
    "div",
    { class: "spotify-integration-card" },
    h(
      "div",
      { class: "who" },
      dot("#1DB954", 7),
      h("span", { class: "name", text: "Spotify" }),
      h("span", { class: "tool", text: isPlaying ? "Tocando" : "Pausado" }),
    ),
    h(
      "div",
      { style: "padding: 8px 12px 0 108px" },
      h(
        "div",
        {
          style:
            "font: 600 12px var(--font); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;",
        },
        title,
      ),
      h("div", { style: "font: 400 11px var(--font); color: var(--dim-2); margin-top: 2px;" }, artist),
    ),
  );
}

export function buildSpotifyView(_actions: ViewActions): ViewHost {
  const shell = toolShell("spotify-view", "green");
  setWho(shell, "#1DB954", "Música", "");

  const danceSwitch = h("button", {
    class: "switch",
    title: "Mochi dança no ritmo",
    onclick: () => {
      State.danceEnabled = !State.danceEnabled;
      try {
        localStorage.setItem("coucou.dance", State.danceEnabled ? "1" : "0");
      } catch {
        // storage blocked: the choice just lasts until the island restarts
      }
      Sound.play("blip");
      State.notify();
    },
  });
  shell.foot.append(danceSwitch, h("span", { class: "tool-foot-label", text: "Mochi dança" }));

  const cover = h("div", { class: "sp-cover" });
  const title = h("div", { class: "sp-title" });
  const artist = h("div", { class: "sp-artist" });
  const next = h("div", { class: "sp-next" });

  const prevBtn = h("button", { class: "sp-btn", title: "Anterior", onclick: () => control(Bridge.spotifyPrev) }, svg(ICONS.skipBack, 14));
  const playBtn = h("button", { class: "sp-play", onclick: () => control(Bridge.spotifyPlayPause) });
  const nextBtn = h("button", { class: "sp-btn", title: "Próxima", onclick: () => control(Bridge.spotifyNext) }, svg(ICONS.skipForward, 14));

  const slider = h("input", { type: "range", min: "0", max: "100", step: "1", class: "sp-volume" }) as HTMLInputElement;
  const volIcon = h("span", { class: "sp-vol-icon" }, svg(ICONS.speakerOn, 13));
  const volume = h("div", { class: "sp-vol-row" }, volIcon, slider);

  const emptyMsg = h("div", { class: "tool-empty" });
  const openBtn = h(
    "button",
    {
      class: "btn primary",
      onclick: async () => {
        Sound.play("blip");
        await Bridge.launchOrFocusApp("spotify");
      },
    },
    svg(ICONS.spotify, 12),
    h("span", { text: "Abrir Spotify" }),
  );
  const empty = h("div", { class: "sp-empty" }, emptyMsg, openBtn);
  const player = h(
    "div",
    { class: "sp-player" },
    cover,
    h(
      "div",
      { class: "sp-main" },
      title,
      artist,
      next,
      h("div", { class: "sp-controls" }, prevBtn, playBtn, nextBtn),
      volume,
    ),
  );
  shell.rightCard.append(player, empty);

  let dragging = false;
  let throttle = 0;

  async function control(fn: () => Promise<boolean>) {
    Sound.play("blip");
    await fn();
    window.setTimeout(() => void refreshState(), 450);
  }

  async function refreshState() {
    const s = await Bridge.spotifyGetState();
    if (s) {
      State.spotify = s;
      State.notify();
    }
  }

  function paintSlider() {
    slider.style.setProperty("--fill", `${slider.value}%`);
  }

  async function refreshVolume() {
    if (dragging) return;
    const v = await Bridge.spotifyGetVolume();
    slider.disabled = v == null;
    slider.title = v == null ? "Dê play para ajustar o volume" : "Volume do Spotify";
    if (v != null) {
      slider.value = String(Math.round(v * 100));
      paintSlider();
    }
  }

  slider.addEventListener("pointerdown", () => (dragging = true));
  slider.addEventListener("pointerup", () => (dragging = false));
  slider.addEventListener("input", () => {
    paintSlider();
    const now = performance.now();
    if (now - throttle < 60) return;
    throttle = now;
    void Bridge.spotifySetVolume(Number(slider.value) / 100);
  });
  slider.addEventListener("change", () => void Bridge.spotifySetVolume(Number(slider.value) / 100));

  let lastKey = "";

  function render() {
    const sp = State.spotify;
    danceSwitch.classList.toggle("on", State.danceEnabled);

    const hasTrack = sp.isAvailable && !!sp.title;
    player.style.display = hasTrack ? "" : "none";
    empty.style.display = hasTrack ? "none" : "";

    if (!hasTrack) {
      setWash(shell, "soft");
      setSay(shell, sp.isAvailable ? "Nada tocando. Dê play e eu danço!" : "Abra o Spotify e eu controlo daqui.");
      emptyMsg.textContent = sp.isAvailable ? "Nenhuma música no momento." : "O Spotify não está aberto.";
      return;
    }

    setWash(shell, sp.isPlaying ? "green" : "soft");
    setSay(shell, sp.isPlaying ? "Bora! Essa está boa." : "Pausado. Quando quiser, é só dar play.");
    const app = sp.appName && sp.appName.toLowerCase() !== "spotify" ? sp.appName : "Música";
    setWho(shell, "#1DB954", app, sp.isPlaying ? "tocando" : "pausado");

    const key = [sp.title, sp.artist, sp.album, sp.isPlaying, sp.albumArtBase64?.length ?? 0, sp.nextTrackTitle].join("|");
    if (key === lastKey) return;
    lastKey = key;

    clear(cover);
    cover.classList.toggle("playing", sp.isPlaying);
    if (sp.albumArtBase64) {
      cover.append(h("img", { src: sp.albumArtBase64.startsWith("data:") ? sp.albumArtBase64 : `data:image/jpeg;base64,${sp.albumArtBase64}`, alt: "", draggable: "false" }));
    } else {
      cover.append(svg(ICONS.spotify, 28));
    }
    title.textContent = sp.title;
    artist.textContent = [sp.artist, sp.album].filter(Boolean).join(" · ");
    next.textContent = sp.nextTrackTitle
      ? `A seguir: ${sp.nextTrackTitle}${sp.nextTrackArtist ? ` — ${sp.nextTrackArtist}` : ""}`
      : "";
    next.style.display = sp.nextTrackTitle ? "" : "none";
    clear(playBtn);
    playBtn.append(svg(sp.isPlaying ? ICONS.pause : ICONS.play, 15));
    playBtn.title = sp.isPlaying ? "Pausar" : "Tocar";
  }

  let volumeTimer: number | null = null;

  return {
    el: shell.el,
    sync: () => {
      render();
      if (volumeTimer == null) {
        // Only while this tab is on screen: no work the rest of the time.
        volumeTimer = window.setInterval(() => {
          if (shell.el.classList.contains("on")) void refreshVolume();
        }, 2500);
      }
    },
    focus: () => {
      void refreshState();
      void refreshVolume();
    },
  };
}
