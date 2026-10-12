# Funcionalidades do Coucou (Windows) — Início, Ditar, Traduzir, Música, Apps, Limites

Princípios (valem para todas as abas):

1. **O Mochi é o centro.** O card da esquerda é sempre dele: ele fala uma frase curta sobre o que está acontecendo e muda de cor/cara conforme a função. O card da direita é a ferramenta.
2. **Um sinal de cada vez.** O rosto do Mochi segue uma prioridade (`State.effectiveState`): alerta/pensando → trabalho real → humor da aba atual. Limite de IA estourado só faz o Mochi suar na aba **Limites**; dançar só acontece na aba **Música**.
3. **Só dados reais.** Nada de porcentagem estimada ou inventada. Sem dado, a tela diz isso.
4. **Nada de tokens quando dá para evitar.** Voz, apps e música são 100 % locais. O tradutor usa o Google (o texto é enviado; a tela avisa).
5. **Tudo em PT-BR**, sem termos internos (GSMTC, GTX, Codenotch…).

## Estrutura visual

- Mesmo shell do Overview original: card do Mochi à esquerda (280 px nas abas de ferramentas), card de trabalho à direita. Helper: `windows/src/views/tools.ts` (`toolShell`, `setSay`, `setWash`, `segmented`, `copyText`, `formatReset`).
- O voile colorido do card do Mochi segue a paleta da `docs/SPEC.md` (ciano, verde, âmbar, vermelho, índigo).
- Alturas por aba em `VIEW_LAYOUTS` (`core/layout.ts`); o Mochi tem `botY` explícito em cada uma.
- **Cabeçalho:** a aba ativa mostra o nome; as outras ficam só com ícone. Ordem por uso: Início · Perguntar · Ditar · Traduzir · Música · Apps · Limites · Arquivos. O microfone do canto inicia/para o ditado sem trocar de aba.

## Início (`views.ts → buildEmpty`)
Hub para quem **não** usa IA: saudação por horário e quatro atalhos (Ditar, Traduzir, Música com a faixa atual, Apps) + "Perguntar". Quem tem hooks do Claude Code instalados ou serviços conectados continua vendo o Overview original (`State.defaultView`).

## Limites de IA (`views/quotas.ts`, `src-tauri/src/quotas.rs`)
- **Codex:** lido do bloco `rate_limits` que o próprio Codex grava em `~/.codex/sessions/**/rollout-*.jsonl` (janela e reset reais, semana quando existe). 100 % local.
- **Claude Code:** consulta o endpoint de uso da Anthropic com o login que o Claude Code já guardou. Como isso lê uma credencial, **fica desligado** até o usuário tocar em **Ativar** (ou ligar em Configurações → Assistente → "Uso do Claude"). Se o login expirou, a tela pede para abrir o Claude Code uma vez.
- Só aparecem provedores **instalados** e com número real. Windsurf, Cline e Antigravity foram removidos até existir fonte real de dados.
- **Sem abrir nada:** o anel no cabeçalho só aparece para quem mudou (≥ 1 ponto nos últimos 5 min) ou está em alerta; quando um limite **cruza** 75 % ou 90 %, o Mochi abre sozinho com um aviso âmbar/vermelho por ~4 s (`Island.toast`) e fecha de novo. Não interrompe quem já está com a ilha aberta.

## Ditar (`views/voice.ts`, `island/voice.ts`, `src-tauri/src/whisper.rs`)
- **Nada para instalar.** Na primeira vez o Coucou baixa sozinho (com barra de progresso) o motor `whisper.cpp` (prebuilt, 8 MB) e o modelo `ggml-base-q5_1` (60 MB) para `%LOCALAPPDATA%\Coucou\whisper`. Os dois arquivos são conferidos por SHA-256 fixado no código. Depois disso tudo é offline. Sem Python.
- O áudio é gravado já em WAV 16 kHz mono no próprio webview (sem ffmpeg, sem conversão) e transcrito em ~2 s para uma frase de 6 s.
- Atalho global configurável (padrão **Ctrl+Alt+D**): inicia/para o ditado com a ilha fechada; o Mochi aparece pequeno com um brilho ciano enquanto ouve.
- Idioma padrão = idioma do sistema (auto-detecção erra em frases curtas); EN e Auto a um toque.
- Modos: **Digitar** (escreve onde o cursor está, via `SendInput` Unicode) ou **Copiar**. "Perguntar à IA" leva o texto para o chat.
- Onda de voz real (nível do microfone), cronômetro, Mochi se inclina com o som e fica "pensando" ao transcrever. Limite de 90 s por gravação.

## Traduzir (`views/translator.ts`)
- Cole e traduz na hora (Google; o texto é enviado — avisado na tela).
- Destino padrão = idioma do sistema; se o texto já estiver nele, vai para **inglês**. Escolher outro idioma (16 opções) fixa a escolha; **Auto** volta ao padrão. Botão de inverter idiomas, colar e copiar.

## Música (`views/spotify.ts`, `src-tauri/src/spotify.rs`, `volume.rs`)
- Capa, título, artista, play/pause, anterior/próxima via sessão de mídia do Windows.
- **Volume do próprio Spotify** (slider) pela API de sessões de áudio do Windows — não mexe no volume geral.
- "A seguir" só aparece se o Windows informar (o Spotify normalmente não informa).
- Capa do álbum vinda da sessão de mídia do Windows. O Mochi dança **em qualquer aba** enquanto há música tocando e nada mais está acontecendo no rosto dele (alerta, ditado, carinho…). Dá para desligar.

## Apps (`views/apps.ts`, `src-tauri/src/apps.rs`)
- Lista **todos** os apps instalados (atalhos do Menu Iniciar) e as janelas abertas de verdade (associadas pelo executável, ignorando janelas ocultas/de sistema).
- Grade de apps fixados (abertos com ponto verde; toque = ir para a janela ou abrir). Busca no topo encontra qualquer app; ★ fixa/desafixa. Fixados ficam em `pinnedApps` nas configurações.

## Chat e ChatGPT (futuro)
`settings.chatProvider` decide quem responde (`chat_send` em `lib.rs`). Hoje só `claude`; `chatgpt` está reservado (login com a conta ChatGPT, não só chave de API) e já aparece desabilitado em Configurações → Assistente. Ao implementar, basta plugar o cliente no `match` de `chat_send`.

## Copiados (`views/clipboard.ts`, `src-tauri/src/clipboard.rs`)
- Mostra o histórico da área de transferência do Windows (o mesmo do Win+V) — o Coucou não guarda nada.
- Tocar num item o coloca de volta na área de transferência e envia Ctrl+V para a janela em que você estava digitando (a ilha não rouba o foco). Por isso esta aba não tem campo de busca.
- Se o histórico estiver desligado, a tela explica e leva para os ajustes do Windows.

## Atalhos globais (`src-tauri/src/hotkeys.rs`)
- **Abrir/fechar o Coucou** (padrão Ctrl+Alt+Espaço) e **Ditar** (Ctrl+Alt+D), configuráveis em Configurações → Atalhos de teclado (clique no campo e pressione as teclas).
- Usa `RegisterHotKey`. Se outro programa já usa a combinação, o Windows recusa e a tela mostra o motivo; a combinação anterior continua valendo.

## Notch que não some (`island.rs → spawn_wake_watch`, `island/fsm.ts`)
- **Notch sempre visível** (padrão ligado): ao fechar, a ilha vira o notch compacto e fica na tela.
- Desligado, ela some por completo, mas encostar o mouse no topo (centro) de **qualquer tela** a faz aparecer ali; ~8 leituras de cursor por segundo só enquanto oculta.

## Mochi — interações
- **Carinho:** passe o mouse de um lado para o outro sobre ele (3 idas e vindas) → fecha os olhos, fica corado, balança e sobem corações enquanto você continua.
- **Toque (clique rápido):** surpresa (pulinho). Segundo clique seguido: irritado. Terceiro: tonto (como antes).
- **Segurar:** ele se achata enquanto você segura e quica ao soltar.
- **Botão direito:** piscadela e uma voltinha.
- Olhar, ficar apaixonado ao ser olhado por 2 s etc. continuam como no protótipo.

## Ajustes rápidos × configurações gerais
- **Dentro do notch (engrenagem):** só o que se mexe no dia a dia — sons, fechar sozinho, notch sempre visível, Mochi dança, modo do ditado, atalhos atuais e um botão para todas as configurações.
- **Janela de configurações:** tudo — Claude Code, chaves/integrações, atalhos, chat/ChatGPT, ditado, uso do Claude, apps fixados, tela, inicialização.

## Sem dados simulados
Nenhuma aba inventa dados. Fora do app (navegador), a ponte para o sistema devolve vazio e cada aba mostra seu estado vazio honesto.
