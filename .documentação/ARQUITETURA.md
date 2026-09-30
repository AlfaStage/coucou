# Arquitetura do Sistema — Coucou Windows & Mochi

## 1. Visão Geral
O Coucou Windows é um assistente de desktop nativo construído sobre o ecossistema **Tauri 2 (Rust Backend + WebView2 Frontend em TypeScript Vanilla e Canvas 2D)**. Mochi é o personagem central animado em tempo real via Canvas 2D (sem bibliotecas externas como Rive ou Lottie), expressando estados emocionais, reações contextuais e notificações de serviços.

## 2. Pilares de Design & Execução
- **Zero-Token Local First:** Operações que podem ser executadas nativamente (controles de mídia via Windows GSMTC, digitação por voz via Whisper local, tradução determinística e leitura de caches de cotas via SQLite/JSON) não consomem tokens de IA.
- **Thin Client / Fat Server:** A interface web apenas captura eventos do usuário e renderiza o estado. Toda lógica de hardware (áudio), janelas do sistema operacional (Win32), segurança (Windows Credential Manager) e I/O reside no backend em Rust.
- **Design System Coucou:** Vidro escuro translúcido (`#10131A` com backdrop-blur), bordas sutis (`rgba(255,255,255,0.08)`), microinterações a 60 FPS, física de molas (Springs) e 28 efeitos sonoros procedurais.

## 3. Estrutura de Diretórios
```
c:/Users/theja/coucou/
  ├── .system-plan/                          # PRD, Specs e Issues (Planejamento)
  │     └── prd-mochi-extended-integrations/
  │           ├── PRD.md
  │           └── spec-mochi-extended-integrations/
  │                 ├── spec.md
  │                 └── issues/ (issue-01 a 06)
  ├── .documentação/                         # Mapeamento do conhecimento e docs
  │     ├── ARQUITETURA.md
  │     └── NOVAS_FUNCIONALIDADES.md
  ├── windows/
  │     ├── src/                             # Frontend em TypeScript Vanilla
  │     │     ├── core/                      # Estado, layout, animações, áudio
  │     │     ├── island/                    # Máquina de estados (FSM) e shell
  │     │     ├── mochi/                     # Motor Canvas 2D do Mochi
  │     │     ├── views/                     # Visões (Overview, Chat, Apps, Quotas, etc.)
  │     │     └── style.css                  # Folha de estilo visual principal
  │     └── src-tauri/                       # Backend em Rust
  │           └── src/
  │                 ├── lib.rs               # Setup e comandos IPC Tauri
  │                 ├── win_user.rs          # Interação com janelas Win32 e SendInput
  │                 ├── spotify.rs           # Integração GSMTC com Spotify Desktop
  │                 ├── apps.rs              # Gerenciador de atalhos e foco de janelas
  │                 ├── whisper.rs           # Motor Whisper local e captura de áudio
  │                 ├── translator.rs        # Motor de tradução de baixo consumo
  │                 └── quotas.rs            # Rastreador de limites/cotas de IA
```

## 4. Instruções para Obtenção de Logs
Os logs estruturados de execução e eventos do Coucou são gravados em tempo de execução em:
`%LOCALAPPDATA%\Coucou\coucou.log`
Podem ser consultados no terminal via:
`Get-Content $env:LOCALAPPDATA\Coucou\coucou.log -Tail 50 -Wait`
