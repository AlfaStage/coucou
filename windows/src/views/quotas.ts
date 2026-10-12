// Limites de IA — how close each assistant is to its usage limit.
//
// Only real numbers are drawn (see src-tauri/src/quotas.rs). Mochi summarises in
// one sentence and the right card shows one ring per provider. Providers whose
// number hasn't moved stay quiet everywhere else: the header only shows a ring
// for the ones that changed, and a threshold crossing pops up by itself.

import { h, svg, clear } from "./dom";
import { ICONS } from "./icons";
import { State, type AiQuotaItem } from "../core/state";
import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";
import type { Wash } from "../core/layout";
import { formatReset, setSay, setWash, setWho, toolShell } from "./tools";
import type { ViewHost, ViewActions } from "./views";

const COLORS = { normal: "#34D399", warning: "#F5A524", critical: "#F4505E" } as const;

export function createCircularProgress(
  percent: number,
  size = 36,
  strokeWidth = 3,
  color = "#3B82F6",
): SVGSVGElement {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const target = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  const ns = "http://www.w3.org/2000/svg";
  const svgEl = document.createElementNS(ns, "svg");
  svgEl.setAttribute("width", String(size));
  svgEl.setAttribute("height", String(size));
  svgEl.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svgEl.classList.add("quota-circular-meter");

  const ring = (stroke: string) => {
    const c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", String(size / 2));
    c.setAttribute("cy", String(size / 2));
    c.setAttribute("r", String(radius));
    c.setAttribute("fill", "none");
    c.setAttribute("stroke", stroke);
    c.setAttribute("stroke-width", String(strokeWidth));
    return c;
  };
  const track = ring("rgba(255, 255, 255, 0.08)");
  const progress = ring(color);
  progress.setAttribute("stroke-dasharray", String(circumference));
  progress.setAttribute("stroke-dashoffset", String(circumference));
  progress.setAttribute("stroke-linecap", "round");
  progress.setAttribute("transform", `rotate(-90 ${size / 2} ${size / 2})`);
  progress.style.transition = "stroke-dashoffset 0.7s cubic-bezier(0.3, 0.9, 0.3, 1)";
  svgEl.append(track, progress);
  // Fill from empty so the ring sweeps in instead of appearing.
  requestAnimationFrame(() => progress.setAttribute("stroke-dashoffset", String(target)));
  return svgEl;
}

export function buildQuotasView(_actions: ViewActions): ViewHost {
  const shell = toolShell("quotas-view", "soft");
  const grid = h("div", { class: "quota-grid" });
  shell.rightCard.append(grid);

  const refreshBtn = h(
    "button",
    {
      class: "btn secondary",
      onclick: () => {
        Sound.play("blip");
        void refresh();
      },
    },
    svg(ICONS.gauge, 11),
    h("span", { text: "Atualizar" }),
  );
  shell.foot.append(refreshBtn);

  let lastKey = "";

  async function refresh() {
    const list = await Bridge.getAiQuotas();
    if (list) {
      State.quotas = list;
      render();
      State.notify();
    }
  }

  async function enableClaude() {
    Sound.play("finish");
    State.settings.quotaClaudeLive = true;
    await Bridge.saveSettings(State.settings);
    void refresh();
  }

  function summary(quotas: AiQuotaItem[]): { text: string; wash: Wash } {
    const live = quotas.filter((q) => q.availability === "live");
    if (quotas.length === 0) {
      return { text: "Não achei nenhuma IA instalada por aqui.", wash: "soft" };
    }
    if (live.length === 0) {
      return { text: "Posso ver o uso do Claude Code? É só tocar em Ativar.", wash: "indigo" };
    }
    const worst = [...live].sort((a, b) => b.usedPercent - a.usedPercent)[0];
    const pct = Math.round(worst.usedPercent);
    const reset = formatReset(worst.resetInMinutes);
    if (worst.status === "critical") {
      return { text: `${worst.name} está quase no limite (${pct}%). Melhor ir com calma!`, wash: "red" };
    }
    if (worst.status === "warning") {
      return { text: `${worst.name} em ${pct}%.${reset ? ` Reseta em ${reset}.` : ""}`, wash: "amber" };
    }
    return { text: "Tudo tranquilo. Nenhum limite por perto.", wash: "green" };
  }

  function tile(q: AiQuotaItem): HTMLElement {
    const iconKey = (q.icon in ICONS ? q.icon : "gauge") as keyof typeof ICONS;
    const icon = h("div", { class: "quota-icon" }, svg(ICONS[iconKey], 13));

    if (q.availability !== "live") {
      const consent = q.availability === "needs_consent";
      return h(
        "div",
        { class: "quota-tile muted" },
        h("div", { class: "quota-ring empty" }, icon),
        h(
          "div",
          { class: "quota-info" },
          h("div", { class: "quota-name", text: q.name }),
          h("div", { class: "quota-sub", text: q.note ?? "Sem dados agora." }),
        ),
        consent ? h("button", { class: "quota-enable", text: "Ativar", onclick: () => void enableClaude() }) : null,
      );
    }

    const color = COLORS[q.status];
    const reset = formatReset(q.resetInMinutes);
    const weekly = q.weeklyPercent != null ? Math.round(q.weeklyPercent) : null;
    return h(
      "div",
      {
        class: q.changedRecently ? "quota-tile changed" : "quota-tile",
        title: `${q.name}: ${Math.round(q.usedPercent)}% usado na janela de ${q.windowLabel}. Toque para atualizar.`,
        onclick: () => {
          Sound.play("blip");
          void refresh();
        },
      },
      h(
        "div",
        { class: "quota-ring" },
        createCircularProgress(q.usedPercent, 40, 4, color),
        h("span", { class: "quota-pct", style: `color:${color}`, text: String(Math.round(q.usedPercent)) }),
      ),
      h(
        "div",
        { class: "quota-info" },
        h("div", { class: "quota-name", text: q.name }),
        h("div", { class: "quota-sub", text: [q.windowLabel, reset ? `reseta em ${reset}` : ""].filter(Boolean).join(" · ") }),
      ),
      weekly != null
        ? h(
            "div",
            { class: "quota-week", title: `Uso da semana: ${weekly}%` },
            h("span", { text: `Semana ${weekly}%` }),
            h("span", { class: "quota-week-bar" }, h("i", { style: `width:${weekly}%;background:${COLORS[weekly >= 90 ? "critical" : weekly >= 75 ? "warning" : "normal"]}` })),
          )
        : null,
    );
  }

  function render() {
    const quotas = State.quotas;
    // Re-render only when something visible changed; polls run every minute.
    const key = JSON.stringify(quotas);
    if (key === lastKey) return;
    lastKey = key;

    const s = summary(quotas);
    setWho(shell, "#8B5CF6", "Limites de IA", "");
    setSay(shell, s.text);
    setWash(shell, s.wash);

    clear(grid);
    if (quotas.length === 0) {
      grid.append(h("div", { class: "tool-empty", text: "Instale o Claude Code ou o Codex e eu acompanho o uso." }));
      return;
    }
    // Live providers first, the most used on top.
    const ordered = [...quotas].sort((a, b) => {
      if ((a.availability === "live") !== (b.availability === "live")) return a.availability === "live" ? -1 : 1;
      return b.usedPercent - a.usedPercent;
    });
    const shown = ordered.slice(0, 4);
    // One or two providers get a full row each (room for the weekly meter);
    // three or four share two columns.
    grid.classList.toggle("cols-2", shown.length > 2);
    for (const q of shown) grid.append(tile(q));
  }

  return {
    el: shell.el,
    sync: () => {
      render();
    },
    focus: () => {
      void refresh();
    },
  };
}
