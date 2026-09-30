import { defineConfig, type Plugin } from "vite";
import { existsSync, mkdirSync, readdirSync, copyFileSync, createReadStream } from "node:fs";
import { resolve, join, extname } from "node:path";

// ───────────────────────────────────────────────────────────────────────────────
// THE one and only place the shared sound folder is declared.
// The 28 WAVs live in the macOS app and are NOT duplicated in the repo; when they
// move to `shared/sounds/`, change this single line.
export const SOUNDS_DIR = resolve(__dirname, "../NotchBuddy/Resources/sounds");
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Serves SOUNDS_DIR at /sounds/*.wav in dev, and copies it into dist/sounds on build.
 * Keeps the WAVs out of windows/ while still shipping them inside the installer.
 */
function sharedSounds(): Plugin {
  const prefix = "/sounds/";
  return {
    name: "coucou-shared-sounds",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(prefix)) return next();
        const name = decodeURIComponent(req.url.slice(prefix.length).split("?")[0]);
        if (name.includes("/") || name.includes("\\") || extname(name) !== ".wav") return next();
        const file = join(SOUNDS_DIR, name);
        if (!existsSync(file)) return next();
        res.setHeader("Content-Type", "audio/wav");
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      const out = resolve(__dirname, "dist/sounds");
      if (!existsSync(SOUNDS_DIR)) {
        this.warn(`sounds not found at ${SOUNDS_DIR} — the build will ship without audio`);
        return;
      }
      mkdirSync(out, { recursive: true });
      for (const f of readdirSync(SOUNDS_DIR)) {
        if (extname(f) === ".wav") copyFileSync(join(SOUNDS_DIR, f), join(out, f));
      }
    },
  };
function devApi(): Plugin {
  return {
    name: "coucou-dev-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/dev/")) return next();
        const url = new URL(req.url, "http://localhost:1420");
        const pathname = url.pathname;

        res.setHeader("Content-Type", "application/json");

        if (pathname === "/api/dev/quotas") {
          try {
            const os = require("node:os");
            const { statSync } = require("node:fs");
            const home = os.homedir();
            const quotas = [];

            // 1. Claude
            const claudeDir = join(home, ".claude");
            let claudeUsed = 42000;
            let claudeReset = 3.2;
            if (existsSync(claudeDir)) {
              let totalBytes = 0;
              const sess = join(claudeDir, "sessions");
              if (existsSync(sess)) {
                for (const f of readdirSync(sess)) {
                  try { totalBytes += statSync(join(sess, f)).size; } catch {}
                }
              }
              if (totalBytes > 0) {
                claudeUsed = Math.min(195000, Math.max(10000, Math.floor(totalBytes / 4)));
              }
              const settingsFile = join(claudeDir, "settings.json");
              if (existsSync(settingsFile)) {
                const diffHours = (Date.now() - statSync(settingsFile).mtimeMs) / 3600000;
                claudeReset = Math.max(0.5, 5.0 - (diffHours % 5.0));
              }
            }
            const claudePct = Math.min(100, Math.round((claudeUsed / 200000) * 1000) / 10);
            quotas.push({
              id: "claude",
              name: "Claude Code",
              provider: "Anthropic",
              icon: "claude",
              usedPercent: claudePct,
              remainingPercent: Math.round((100 - claudePct) * 10) / 10,
              usedTokens: claudeUsed,
              limitTokens: 200000,
              resetInHours: Math.round(claudeReset * 10) / 10,
              changedRecently: true,
              status: claudePct >= 90 ? "critical" : (claudePct >= 80 ? "warning" : "normal"),
              lastUpdated: "Just now",
            });

            // 2. Codex
            const codexDir = join(home, ".codex");
            let codexUsed = 68500;
            let codexReset = 1.8;
            if (existsSync(codexDir)) {
              const stateFile = join(codexDir, ".codex-global-state.json");
              if (existsSync(stateFile)) {
                try {
                  const stat = statSync(stateFile);
                  codexUsed = Math.min(145000, Math.max(15000, Math.floor(stat.size * 12)));
                  const diffHours = (Date.now() - stat.mtimeMs) / 3600000;
                  codexReset = Math.max(0.2, 4.0 - (diffHours % 4.0));
                } catch {}
              }
            }
            const codexPct = Math.min(100, Math.round((codexUsed / 150000) * 1000) / 10);
            quotas.push({
              id: "codex",
              name: "Codex CLI",
              provider: "OpenAI",
              icon: "openai",
              usedPercent: codexPct,
              remainingPercent: Math.round((100 - codexPct) * 10) / 10,
              usedTokens: codexUsed,
              limitTokens: 150000,
              resetInHours: Math.round(codexReset * 10) / 10,
              changedRecently: codexPct >= 80,
              status: codexPct >= 90 ? "critical" : (codexPct >= 80 ? "warning" : "normal"),
              lastUpdated: "Just now",
            });

            // 3. Antigravity
            const agDir = join(home, ".gemini", "antigravity-ide");
            let agUsed = 112000;
            let agReset = 4.5;
            if (existsSync(agDir)) {
              try {
                let totalBytes = 0;
                for (const f of readdirSync(agDir)) {
                  try { totalBytes += statSync(join(agDir, f)).size; } catch {}
                }
                if (totalBytes > 0) {
                  agUsed = Math.min(480000, Math.max(25000, Math.floor(totalBytes / 3)));
                }
              } catch {}
            }
            const agPct = Math.min(100, Math.round((agUsed / 500000) * 1000) / 10);
            quotas.push({
              id: "antigravity",
              name: "Antigravity",
              provider: "Google",
              icon: "antigravity",
              usedPercent: agPct,
              remainingPercent: Math.round((100 - agPct) * 10) / 10,
              usedTokens: agUsed,
              limitTokens: 500000,
              resetInHours: Math.round(agReset * 10) / 10,
              changedRecently: false,
              status: agPct >= 90 ? "critical" : (agPct >= 80 ? "warning" : "normal"),
              lastUpdated: "Just now",
            });

            // 4. Windsurf
            quotas.push({
              id: "windsurf",
              name: "Windsurf",
              provider: "Codeium",
              icon: "code",
              usedPercent: 88.0,
              remainingPercent: 12.0,
              usedTokens: 440,
              limitTokens: 500,
              resetInHours: 0.8,
              changedRecently: true,
              status: "warning",
              lastUpdated: "Just now",
            });

            // 5. Cline
            quotas.push({
              id: "cline",
              name: "Cline",
              provider: "Cline Bot",
              icon: "terminal",
              usedPercent: 35.0,
              remainingPercent: 65.0,
              usedTokens: 35000,
              limitTokens: 100000,
              resetInHours: 8.5,
              changedRecently: false,
              status: "normal",
              lastUpdated: "Just now",
            });

            res.end(JSON.stringify(quotas));
            return;
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e?.message || "error" }));
            return;
          }
        }

        if (pathname === "/api/dev/apps") {
          try {
            const { execSync } = require("node:child_process");
            const tasklist = execSync("tasklist /FO CSV", { encoding: "utf8" }).toLowerCase();
            const isRunning = (stem: string) => tasklist.includes(stem.toLowerCase());

            const apps = [
              { id: "spotify", name: "Spotify", icon: "spotify", exeStem: "spotify", isOpen: isRunning("spotify.exe"), windowTitle: "Spotify Premium" },
              { id: "code", name: "VS Code", icon: "code", exeStem: "code", isOpen: isRunning("code.exe"), windowTitle: "coucou — Visual Studio Code" },
              { id: "chrome", name: "Chrome", icon: "chrome", exeStem: "chrome", isOpen: isRunning("chrome.exe"), windowTitle: "Google Chrome" },
              { id: "terminal", name: "Terminal", icon: "terminal", exeStem: "wt", isOpen: isRunning("windowsterminal.exe") || isRunning("wt.exe") || isRunning("powershell.exe"), windowTitle: "Windows PowerShell" },
              { id: "discord", name: "Discord", icon: "discord", exeStem: "discord", isOpen: isRunning("discord.exe") },
              { id: "notion", name: "Notion", icon: "notion", exeStem: "notion", isOpen: isRunning("notion.exe") },
              { id: "explorer", name: "Explorer", icon: "folder", exeStem: "explorer", isOpen: isRunning("explorer.exe"), windowTitle: "Explorador de Arquivos" },
              { id: "edge", name: "Edge", icon: "globe", exeStem: "msedge", isOpen: isRunning("msedge.exe") },
            ];
            res.end(JSON.stringify(apps));
            return;
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e?.message || "error" }));
            return;
          }
        }

        if (pathname === "/api/dev/spotify") {
          try {
            const { execSync } = require("node:child_process");
            const tasklist = execSync("tasklist /FO CSV", { encoding: "utf8" }).toLowerCase();
            const spotifyRunning = tasklist.includes("spotify.exe");
            res.end(JSON.stringify({
              isAvailable: spotifyRunning,
              isPlaying: spotifyRunning,
              title: spotifyRunning ? "Blinding Lights" : "Nenhuma faixa ativa",
              artist: spotifyRunning ? "The Weeknd" : "Spotify Pausado",
              album: spotifyRunning ? "After Hours" : "",
              albumArtBase64: null,
              appName: "Spotify",
              nextTrackTitle: "Save Your Tears",
              nextTrackArtist: "The Weeknd",
            }));
            return;
          } catch (e: any) {
            res.end(JSON.stringify({ isAvailable: false, isPlaying: false, title: "Spotify Indisponível" }));
            return;
          }
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [sharedSounds(), devApi()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: "127.0.0.1" },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "chrome110",
    minify: "esbuild",
    sourcemap: false,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        island: resolve(__dirname, "index.html"),
        settings: resolve(__dirname, "settings.html"),
      },
    },
  },
});
