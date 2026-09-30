# Novas Funcionalidades Integradas ao Mochi & Coucou Island

## Padrão Visual: Arquitetura Two-Card Glassmorphism
Todas as abas seguem rigidamente o sistema visual oficial do Coucou Windows:
- **Altura Padrão:** 160px fixos em todas as visualizações (`VIEW_LAYOUTS`).
- **Estrutura Two-Card:**
  - Card Esquerdo (`.left`, 322px de largura): Acomoda o Mochi renderizado em `cx: 68`, com cabeçalho `.who` e corpo com `margin-left: 108px` (garantindo que o Mochi nunca seja coberto ou colida com textos).
  - Card Direito (`.right`, flex auto): Área interativa para controles, grades, entradas e resultados.

---

## 1. Monitoramento de Limites e Cotas de IA (Codenotch & CodexBar)
- **Arquivo:** `windows/src/views/quotas.ts`
- **Cabeçalho Compacto:** Anéis de progresso SVG inteligentes (verde <80%, amarelo 80-90%, vermelho >90%) exibindo apenas provedores com cotas alteradas ou em alerta.
- **Painel Expandido:** Grade 2x2 com mini anéis circulares SVG de 32px, nomes dos provedores (Claude Code, Codex CLI, Antigravity, Windsurf), porcentagens, contagem de tokens e tempo restante para reset.
- **Reação do Mochi:** Expressão `ratelimit` com partículas de suor e olhos cansados quando qualquer provedor atinge >90% de uso.

## 2. Whisper Local Ultrarrápido (Voz para Texto Zero-Token)
- **Arquivos:** `windows/src/views/voice.ts` e `windows/src/island/voice.ts`
- **Card Esquerdo:** Status ao vivo ("Pronto para falar" / "Ouvindo (Xs)..."), seletor de modo com botões alternáveis:
  1. *[Digitar no Cursor]:* Utiliza Win32 `SendInput` com suporte total a Unicode e acentos (`ã, é, ç`) diretamente na janela ativa (VS Code, Notepad, Chrome).
  2. *[Copiar / IA]:* Copia o texto para a área de transferência e insere no prompt do Mochi.
- **Card Direito:** Botão de ação grande com glow ciano e transição para vermelho pulsante ao gravar, indicador de ondas sonoras animado (waveform), caixa de transcrição e botões de ação ("Copiar", "Digitar Novamente", "Limpar", "Simular Ditado").
- **Reação do Mochi:** Aura pulsante ciano e olhos atentos durante a escuta.

## 3. Tradutor Inteligente Zero-Token (Google GTX)
- **Arquivo:** `windows/src/views/translator.ts`
- **Card Esquerdo:** Status da detecção automática, botões para escolha do idioma de destino (`PT`, `EN`, `ES`, `FR`, `DE`) e botão de inverter idiomas (`⇄ Inverter`).
- **Card Direito:** Campo de entrada com tradução em tempo real (debounce de 350ms e resposta imediata ao colar), caixa de texto traduzido com destaque esmeralda, botão de cópia com confirmação animada ("Copiado!") e botão de limpar.

## 4. Atalhos de Aplicativos e Alternador de Janelas (Win32)
- **Arquivo:** `windows/src/views/apps.ts`
- **Card Esquerdo:** Indicador de contagem de aplicativos abertos em tempo real (`X abertos`) com ponto verde brilhante.
- **Card Direito:** Grade de 8 atalhos (Spotify, VS Code, Chrome, Terminal, Discord, Notion, Explorer, Edge) dispostos em 2 colunas com pílulas de 24px perfeitamente encaixadas (sem corte ou rolagem). Ponto verde neon para aplicativos em execução no Windows. Clique alterna o foco para a janela ou inicia o executável.

## 5. Integração Nativa Spotify Desktop
- **Arquivo:** `windows/src/views/spotify.ts`
- **Aba Dedicada no Cabeçalho:** Ícone oficial do Spotify com acesso direto ao player.
- **Card Esquerdo:** Status de reprodução do Spotify, indicador de ritmo e botão para alternar dança do Mochi (`🕺 Dançando ♪`).
- **Card Direito:** Player com capa do álbum em alta resolução, título da faixa, artista/álbum, botões de faixa anterior, play/pause circular verde neon com sombra brilhante, próxima faixa e controles de volume.
- **Reação do Mochi:** Dança no ritmo da música com notas musicais verdes (`♫`, `♪`) que flutuam harmoniosamente ao lado da cabeça do personagem.
