// AI Limits & Quotas view for Coucou.
// Uses Coucou's authentic Two-Card frosted glass layout (160px height).
// Circular SVG meters showing real-time token/request usage across AI providers.

import { h, svg, dot, clear } from "./dom";
import { ICONS } from "./icons";
import { State } from "../core/state";
import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";
import type { ViewHost, ViewActions } from "./views";

export function createCircularProgress(
  percent: number,
  size = 36,
  strokeWidth = 3,
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
  const leftWho = h("div", { class: "who" });
  const leftBody = h("div", { class: "quotas-left-body" });
  const leftCard = h(
    "div",
    { class: "card quotas-left-card" },
    h("div", { class: "card-body" }, leftWho, leftBody),
  );

  const rightGrid = h("div", { class: "quotas-right-grid" });
  const rightCard = h("div", { class: "card quotas-right-card" }, rightGrid);

  const el = h(
    "div",
    { class: "view overview quotas-view" },
    h("div", { class: "left" }, leftCard),
    h("div", { class: "right" }, rightCard),
  );

  async function refresh() {
    const list = await Bridge.getAiQuotas();
    if (list) {
      State.quotas = list;
      render();

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
    const quotas = State.quotas;
    const warningCount = quotas.filter((q) => q.status !== "normal").length;

    // Render left card
    clear(leftWho);
    leftWho.append(
      dot("#8B5CF6", 7),
      h("span", { class: "name", text: "Limites de IA" }),
      h("span", { class: "tool", text: "Codenotch" }),
    );

    const refreshBtn = h(
      "button",
      {
        class: "btn secondary quotas-refresh-btn",
        onclick: () => {
          Sound.play("blip");
          void refresh();
        },
      },
      svg(ICONS.gauge, 11),
      h("span", { text: "Atualizar" }),
    );

    clear(leftBody);
    leftBody.append(
      h(
        "div",
        { class: "quotas-summary-pill" },
        dot(warningCount > 0 ? "#F59E0B" : "#10B981", 6),
        h("span", {
          text: warningCount > 0
            ? `${warningCount} limite em alerta`
            : `${quotas.length} modelos normais`,
        }),
      ),
      h("div", { class: "apps-sub-hint", text: "Apenas cotas alteradas aparecem na barra" }),
      refreshBtn,
    );

    // Render right card (2x2 grid of circular progress cards)
    clear(rightGrid);
    if (quotas.length === 0) {
      rightGrid.append(
        h("div", { class: "quotas-empty", text: "Verificando limites de Claude, Codex e Antigravity…" }),
      );
      return;
    }

    const sortedQuotas = [...quotas]
      .sort((a, b) => {
        if (a.status !== "normal" && b.status === "normal") return -1;
        if (a.status === "normal" && b.status !== "normal") return 1;
        return b.usedPercent - a.usedPercent;
      })
      .slice(0, 4);

    for (const item of sortedQuotas) {
      const color = getStatusColor(item.status);
      const iconKey = (item.icon in ICONS ? item.icon : "gauge") as keyof typeof ICONS;

      const meterWrap = h(
        "div",
        { class: "quota-meter-wrap" },
        createCircularProgress(item.usedPercent, 32, 3, color),
        h("div", { class: "quota-meter-center-icon" }, svg(ICONS[iconKey], 12)),
      );

      const infoWrap = h(
        "div",
        { class: "quota-info" },
        h(
          "div",
          { class: "quota-row-top" },
          h("span", { class: "quota-name", text: item.name }),
          h("span", { class: "quota-percent", style: `color: ${color}`, text: `${Math.round(item.usedPercent)}%` }),
        ),
        h(
          "div",
          { class: "quota-row-sub" },
          h("span", {
            class: "quota-tokens",
            text: `${formatTokens(item.usedTokens)} / ${formatTokens(item.limitTokens)}`,
          }),
          item.resetInHours != null
            ? h("span", { class: "quota-reset", text: `~${item.resetInHours.toFixed(1)}h` })
            : null,
        ),
      );

      const card = h(
        "div",
        {
          class: item.changedRecently ? "quota-card-item highlight" : "quota-card-item",
          title: `${item.provider}: ${item.usedPercent}% usado. Clique para atualizar.`,
          onclick: () => {
            Sound.play("blip");
            void refresh();
          },
        },
        meterWrap,
        infoWrap,
      );

      rightGrid.append(card);
    }
  }

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
