// Spotify desktop integration card for Coucou.
// Controls playback, volume and displays current track, artist and album art cover.

import { h, svg, dot } from "./dom";
import { ICONS } from "./icons";
import { State } from "../core/state";
import { Bridge } from "../core/bridge";

export function renderSpotifyCard(): HTMLElement {
  const spotify = State.spotify;
  const isPlaying = spotify.isPlaying;
  const hasTrack = spotify.isAvailable && spotify.title.length > 0;

  const card = h("div", { class: "int-card spotify-card" });

  // 1. Header
  const statusColor = isPlaying ? "#1DB954" : hasTrack ? "#EAB308" : "#8C8C8C";
  const statusText = isPlaying ? "Playing" : hasTrack ? "Paused" : "Idle";
  const head = h(
    "div",
    { class: "int-head" },
    dot(statusColor, 7),
    h("b", { text: "Spotify" }),
    h("span", { text: statusText }),
  );
  card.append(head);

  // 2. Track & Media Content
  const content = h("div", { class: "spotify-content" });

  // Album art cover / vinyl fallback
  const artContainer = h("div", { class: "spotify-art-wrap" });
  if (spotify.albumArtBase64) {
    const img = h("img", {
      class: isPlaying ? "spotify-art playing" : "spotify-art",
      src: spotify.albumArtBase64,
      alt: spotify.title || "Album Art",
    });
    artContainer.append(img);
  } else {
    const vinyl = h(
      "div",
      { class: isPlaying ? "spotify-vinyl spinning" : "spotify-vinyl" },
      svg(ICONS.spotify, 18, { fill: "#1DB954" }),
    );
    artContainer.append(vinyl);
  }
  content.append(artContainer);

  // Track info
  const info = h("div", { class: "spotify-info" });
  if (hasTrack) {
    const titleEl = h("div", { class: "spotify-title", text: spotify.title, title: spotify.title });
    const artistText = spotify.album ? `${spotify.artist} · ${spotify.album}` : spotify.artist;
    const artistEl = h("div", { class: "spotify-artist", text: artistText, title: artistText });
    info.append(titleEl, artistEl);
  } else {
    info.append(
      h("div", { class: "spotify-title", text: "No music playing" }),
      h("div", { class: "spotify-artist", text: "Open Spotify to start playback" }),
    );
  }
  content.append(info);
  card.append(content);

  // 3. Playback Controls Bar
  const controls = h("div", { class: "spotify-controls" });

  const prevBtn = h(
    "button",
    {
      class: "media-btn",
      title: "Previous Track",
      onclick: () => void Bridge.spotifyPrev(),
    },
    svg(ICONS.skipBack, 14),
  );

  const playBtn = h(
    "button",
    {
      class: "media-btn play-pause-btn",
      title: isPlaying ? "Pause" : "Play",
      onclick: () => void Bridge.spotifyPlayPause(),
    },
    svg(isPlaying ? ICONS.pause : ICONS.play, 16),
  );

  const nextBtn = h(
    "button",
    {
      class: "media-btn",
      title: "Next Track",
      onclick: () => void Bridge.spotifyNext(),
    },
    svg(ICONS.skipForward, 14),
  );

  const volDownBtn = h(
    "button",
    {
      class: "media-btn vol-btn",
      title: "Volume Down",
      onclick: () => void Bridge.spotifyVolumeDown(),
    },
    svg(ICONS.speakerOff, 12),
  );

  const volUpBtn = h(
    "button",
    {
      class: "media-btn vol-btn",
      title: "Volume Up",
      onclick: () => void Bridge.spotifyVolumeUp(),
    },
    svg(ICONS.speakerOn, 12),
  );

  controls.append(prevBtn, playBtn, nextBtn, volDownBtn, volUpBtn);
  card.append(controls);

  return card;
}
