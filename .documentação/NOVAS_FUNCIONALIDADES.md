# Novas Funcionalidades Integradas ao Mochi

## 1. Monitoramento de Limites e Cotas de IA (Estilo Codenotch & CodexBar)
- **Provedores:** Claude Code (`~/.claude`), Cursor (`state.vscdb`), OpenAI Codex, Antigravity e provedores configurados.
- **Visualização Inteligente:** Na barra compacta, apenas os provedores com cotas alteradas recentemente ou alertas de limite (>80%) aparecem como pílulas com anéis circulares de progresso SVG. O painel expandido exibe todos os provedores com contagem regressiva para renovação da cota.
- **Reação do Mochi:** Expressão exausta (`ratelimit` com partículas de suor e olhos cansados) ao aproximar-se do limite de tokens; celebração alegre ao renovar cotas.

## 2. Whisper Local Ultrarrápido (Voz para Texto Zero-Token)
- **Captura e Transcrição:** Utiliza modelo local quantizado de baixo consumo executado na CPU, sem envio para servidores e sem consumo de tokens de IA.
- **Dois Modos de Saída:**
  1. *Modo Digitação Direta (SendInput):* Digita o texto transcrito diretamente no aplicativo em foco (VS Code, Word, navegador, chat).
  2. *Modo Caixa de Texto Mochi:* Insere o texto na caixa de entrada do Mochi para fácil cópia ou pesquisa com IA.
- **Reação do Mochi:** Aura pulsante ciano/violeta e olhos atentos de escuta enquanto o usuário dita.

## 3. Tradutor Inteligente com Detecção Automática
- **Detecção de Idioma:** Identifica automaticamente a língua do texto colado na área de transferência ou digitado.
- **Regra de Direcionamento:**
  - Texto em idioma estrangeiro -> traduz para o idioma padrão do sistema operacional (ex: Português pt-BR).
  - Texto já no idioma do sistema -> traduz para Inglês (en-US) por padrão, permitindo troca manual para qualquer outro idioma.
- **Zero-Token:** Realiza traduções via motor determinístico leve sem gastar tokens de LLM.
- **Reação do Mochi:** Animação de estudo/leitura com foco visual e botão de cópia rápida em 1 clique.

## 4. Aba de Atalhos de Aplicativos e Alternador de Janelas
- **Painel em Grade:** Grade responsiva de ícones para aplicativos essenciais (Spotify, Chrome, VS Code, Discord, Terminal, etc.).
- **Detecção de Janelas Abertas:**
  - Se a janela já estiver aberta: traz imediatamente para primeiro plano (`SetForegroundWindow` / restaurar minimizada).
  - Se o aplicativo não estiver aberto: executa o aplicativo em segundo plano.
- **Reação do Mochi:** Aceno de boas-vindas e olhar direcionado para o aplicativo selecionado.

## 5. Integração Nativa com Spotify Desktop
- **Controle Nativo via Windows GSMTC:** Lê título da música, artista, álbum, arte da capa e status de reprodução diretamente do processo do Spotify no Windows (sem depender de conta de desenvolvedor do Spotify ou tokens de API remotos).
- **Controles de Mídia:** Play/Pause, Próxima faixa, Faixa anterior e controle de volume.
- **Reação do Mochi:** Mochi dança no ritmo da música com balanço de cabeça (`bounces: true`), olhos felizes e notas musicais flutuantes.
