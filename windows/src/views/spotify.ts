// Native Spotify Desktop Media Player view for Coucou.
// Uses Coucou's authentic Two-Card frosted glass layout (160px height).
// Full playback controls (play, pause, next, prev, volume) and cover art.

import { h, svg, dot, clear } from "./dom";
import { ICONS } from "./icons";
import { State } from "../core/state";
import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";
import type { ViewHost, ViewActions } from "./views";

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
      h(
        "div",
        { style: "font: 400 11px var(--font); color: var(--dim-2); margin-top: 2px;" },
        artist,
      ),
    ),
  );
}

export function buildSpotifyView(_actions: ViewActions): ViewHost {
  const leftWho = h("div", { class: "who" });
  const leftBody = h("div", { class: "spotify-left-body" });
  const leftCard = h(
    "div",
    { class: "card spotify-left-card" },
    h("div", { class: "card-body" }, leftWho, leftBody),
  );

  const playerBody = h("div", { class: "spotify-player-body" });
  const rightCard = h("div", { class: "card spotify-right-card" }, playerBody);

  const el = h(
    "div",
    { class: "view overview spotify-view" },
    h("div", { class: "left" }, leftCard),
    h("div", { class: "right" }, rightCard),
  );

  let pollTimer: number | null = null;

  async function pollState() {
    const s = await Bridge.spotifyGetState();
    if (s) {
      State.spotify = s;
      State.isDancing = s.isPlaying;
      render();
    }
  }

  function render() {
    const sp = State.spotify;
    const isPlaying = sp.isPlaying;

    // Render left card
    clear(leftWho);
    leftWho.append(
      dot("#1DB954", 7),
      h("span", { class: "name", text: "Spotify Desktop" }),
      h("span", { class: "tool", text: isPlaying ? "Reproduzindo" : "Pausado" }),
    );

    const danceToggleBtn = h(
      "button",
      {
        class: isPlaying ? "btn secondary spotify-dance-btn on" : "btn secondary spotify-dance-btn",
        title: "Alternar animação de dança do Mochi",
        onclick: () => {
          State.isDancing = !State.isDancing;
          Sound.play("blip");
          render();
        },
      },
      h("span", { text: State.isDancing ? "🕺 Dançando ♪" : "💤 Parar Dança" }),
    );

    clear(leftBody);
    leftBody.append(
      h(
        "div",
        { class: "spotify-status-pill" },
        dot(isPlaying ? "#1DB954" : "#6B7280", 6),
        h("span", { text: isPlaying ? "Mochi no Ritmo ♪" : "Música em Pausa" }),
      ),
      h("div", { class: "apps-sub-hint", text: "Controle nativo via GSMTC" }),
      danceToggleBtn,
    );

    // Render right card (Media Player)
    clear(playerBody);

    if (sp.title) {
      // Album cover art thumbnail or fallback record vinyl
      const coverEl = sp.albumArtBase64
        ? h("img", {
            class: "spotify-cover-img",
            src: `data:image/jpeg;base64,${sp.albumArtBase64}`,
            alt: "Album Art",
          })
        : h(
            "div",
            { class: "spotify-cover-placeholder" },
            svg(ICONS.spotify, 24),
          );

      const titleEl = h("div", { class: "spotify-track-title", text: sp.title });
      const artistEl = h("div", {
        class: "spotify-track-artist",
        text: sp.artist ? `${sp.artist}${sp.album ? ` • ${sp.album}` : ""}` : "Spotify",
      });

      const trackInfo = h("div", { class: "spotify-track-info" }, titleEl, artistEl);

      // Playback Control Buttons
      const prevBtn = h(
        "button",
        {
          class: "spotify-ctrl-btn",
          title: "Faixa Anterior",
          onclick: async () => {
            Sound.play("blip");
            await Bridge.spotifyPrev();
            setTimeout(() => void pollState(), 400);
          },
        },
        svg(ICONS.skipBack, 14),
      );

      const playPauseBtn = h(
        "button",
        {
          class: "spotify-play-btn",
          title: isPlaying ? "Pausar" : "Reproduzir",
          onclick: async () => {
            Sound.play("blip");
            await Bridge.spotifyPlayPause();
            setTimeout(() => void pollState(), 400);
          },
        },
        svg(isPlaying ? ICONS.pause : ICONS.play, 15),
      );

      const nextBtn = h(
        "button",
        {
          class: "spotify-ctrl-btn",
          title: "Próxima Faixa",
          onclick: async () => {
            Sound.play("blip");
            await Bridge.spotifyNext();
            setTimeout(() => void pollState(), 400);
          },
        },
        svg(ICONS.skipForward, 14),
      );

      const volDownBtn = h(
        "button",
        {
          class: "spotify-vol-btn",
          title: "Diminuir Volume",
          onclick: () => {
            Sound.play("blip");
            void Bridge.spotifyVolumeDown();
          },
        },
        svg(ICONS.speakerOff, 11),
      );

      const volUpBtn = h(
        "button",
        {
          class: "spotify-vol-btn",
          title: "Aumentar Volume",
          onclick: () => {
            Sound.play("blip");
            void Bridge.spotifyVolumeUp();
          },
        },
        svg(ICONS.speakerOn, 11),
      );

      const controlsRow = h(
        "div",
        { class: "spotify-controls-row" },
        prevBtn,
        playPauseBtn,
        nextBtn,
        h("div", { class: "spotify-vol-group" }, volDownBtn, volUpBtn),
      );

      const topRow = h("div", { class: "spotify-top-row" }, coverEl, trackInfo);

      playerBody.append(topRow, controlsRow);
    } else {
      // Empty / Inactive Spotify State
      const emptyMsg = h("div", {
        class: "spotify-empty-msg",
        text: "Nenhuma música tocando no Spotify agora.",
      });

      const playBtn = h(
        "button",
        {
          class: "btn primary",
          onclick: async () => {
            Sound.play("blip");
            await Bridge.spotifyPlayPause();
            setTimeout(() => void pollState(), 600);
          },
        },
        svg(ICONS.play, 12),
        h("span", { text: "Iniciar Reprodução" }),
      );

      const openBtn = h(
        "button",
        {
          class: "btn secondary",
          onclick: async () => {
            Sound.play("blip");
            await Bridge.launchOrFocusApp("spotify");
          },
        },
        svg(ICONS.spotify, 12),
        h("span", { text: "Abrir Spotify" }),
      );

      const demoBtn = h(
        "button",
        {
          class: "btn secondary spotify-demo-btn",
          title: "Demonstração de música para teste",
          onclick: () => {
            State.spotify = {
              isAvailable: true,
              isPlaying: true,
              title: "Bohemian Rhapsody",
              artist: "Queen",
              album: "A Night at the Opera",
              albumArtBase64: null,
              appName: "Spotify",
            };
            State.isDancing = true;
            Sound.play("finish");
            render();
          },
        },
        h("span", { text: "Simular Faixa" }),
      );

      const emptyActions = h("div", { class: "spotify-empty-actions" }, playBtn, openBtn, demoBtn);
      playerBody.append(emptyMsg, emptyActions);
    }
  }

  return {
    el,
    sync: () => {
      render();
      void pollState();
      if (!pollTimer) {
        pollTimer = window.setInterval(() => void pollState(), 2500);
      }
    },
    focus: () => {
      void pollState();
    },
  };
}
