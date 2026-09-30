// AI Limits & Quotas view for Coucou.
// Circular SVG meters showing real-time token/request usage across providers.

import { h, svg, dot, clear } from "./dom";
import { ICONS } from "./icons";
import { State } from "../core/state";
import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";
import type { ViewHost, ViewActions } from "./views";

export function createCircularProgress(
  percent: number,
  size = 46,
  strokeWidth = 4,
  color = "#3B82F6",
): SVGSVGElement {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svgEl.setAttribute("width", String(size));
  svgEl.setAttribute("height", String(size));
  svgEl.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svgEl.classList.add("quota-circular-meter");

  // Track circle (background)
  const track = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  track.setAttribute("cx", String(size / 2));
  track.setAttribute("cy", String(size / 2));
  track.setAttribute("r", String(radius));
  track.setAttribute("fill", "none");
  track.setAttribute("stroke", "rgba(255, 255, 255, 0.08)");
  track.setAttribute("stroke-width", String(strokeWidth));

  // Progress circle
  const progress = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  progress.setAttribute("cx", String(size / 2));
  progress.setAttribute("cy", String(size / 2));
  progress.setAttribute("r", String(radius));
  progress.setAttribute("fill", "none");
  progress.setAttribute("stroke", color);
  progress.setAttribute("stroke-width", String(strokeWidth));
  progress.setAttribute("stroke-dasharray", String(circumference));
  progress.setAttribute("stroke-dashoffset", String(offset));
  progress.setAttribute("stroke-linecap", "round");
  progress.setAttribute("transform", `rotate(-90 ${size / 2} ${size / 2})`);
  progress.style.transition = "stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)";

  svgEl.append(track, progress);
  return svgEl;
}

export function buildQuotasView(_actions: ViewActions): ViewHost {
  const card = h("div", { class: "card quotas-card" });
  const grid = h("div", { class: "quotas-grid" });

  async function refresh() {
    const list = await Bridge.getAiQuotas();
    if (list) {
      State.quotas = list;
      render();

      // Check for critical rate limit (>90%) to trigger Mochi sweat
      const hasCritical = list.some((item) => item.status === "critical");
      if (hasCritical) {
        State.stateOverride = "ratelimit";
      } else if (State.stateOverride === "ratelimit") {
        State.stateOverride = null;
      }
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case "critical":
        return "#EF4444";
      case "warning":
        return "#F59E0B";
      default:
        return "#10B981";
    }
  }

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
    return String(n);
  }

  function render() {
    clear(grid);
    const quotas = State.quotas;

    if (quotas.length === 0) {
      grid.append(
        h("div", { class: "quotas-empty", text: "Scanning active AI models and caches..." }),
      );
      return;
    }

    for (const item of quotas) {
      const color = getStatusColor(item.status);
      const iconKey = (item.icon in ICONS ? item.icon : "gauge") as keyof typeof ICONS;

      const meterWrap = h(
        "div",
        { class: "quota-meter-wrap" },
        createCircularProgress(item.usedPercent, 44, 3.5, color),
        h("div", { class: "quota-meter-label" }, svg(ICONS[iconKey], 14)),
      );

      const infoWrap = h(
        "div",
        { class: "quota-info" },
        h(
          "div",
          { class: "quota-row-top" },
          h("span", { class: "quota-name", text: item.name }),
          item.changedRecently
            ? h("span", { class: "quota-pill-changed", text: "CHANGED" })
            : null,
          h("span", { class: "quota-percent", style: `color: ${color}`, text: `${item.usedPercent}%` }),
        ),
        h(
          "div",
          { class: "quota-row-sub" },
          h("span", {
            class: "quota-tokens",
            text: `${formatTokens(item.usedTokens)} / ${formatTokens(item.limitTokens)} tokens`,
          }),
          item.resetInHours != null
            ? h("span", { class: "quota-reset", text: `Resets ~${item.resetInHours.toFixed(1)}h` })
            : null,
        ),
      );

      const row = h(
        "div",
        {
          class: item.changedRecently ? "quota-item highlight" : "quota-item",
          title: `${item.provider}: ${item.usedPercent}% used. Click to refresh.`,
          onclick: () => {
            Sound.play("blip");
            void refresh();
          },
        },
        meterWrap,
        infoWrap,
      );

      grid.append(row);
    }
  }

  // Header row
  const refreshBtn = h(
    "button",
    {
      class: "btn secondary quota-refresh-btn",
      title: "Refresh quotas",
      onclick: () => {
        Sound.play("blip");
        void refresh();
      },
    },
    svg(ICONS.star, 11),
    h("span", { text: "Refresh" }),
  );

  const head = h(
    "div",
    { class: "int-head quotas-head" },
    dot("#8B5CF6", 7),
    h("b", { text: "AI Limits & Quotas" }),
    h("span", { text: "Codenotch / CodexBar Local Engine" }),
    refreshBtn,
  );

  card.append(head, grid);
  const el = h("div", { class: "view quotas-view" }, card);

  return {
    el,
    sync: () => {
      render();
      void refresh();
    },
    focus: () => {
      void refresh();
    },
  };
}
