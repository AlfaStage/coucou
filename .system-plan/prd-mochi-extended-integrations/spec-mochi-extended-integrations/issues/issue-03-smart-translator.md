# Issue: Smart Clipboard & Multi-Language Translator

## 1. Traceability
- **Parent Spec:** `/.system-plan/prd-mochi-extended-integrations/spec-mochi-extended-integrations/spec.md`
- **Issue Number:** #03
- **Issue Type:** Zero-Token Translation Engine & UI Translation Card

## 2. Task Description
Implement a fast, zero-token multi-language translator directly inside Mochi. When the user pastes or enters text, the engine automatically detects the input language. If the text is foreign, it translates to the user's system language (e.g., pt-BR). If the text is already in the system language, it translates to English (en-US) by default. The user can also manually pick/swap languages. Results feature a 1-click copy action, and Mochi reacts with reading/studying animations.

## 3. The Sandbox (MANDATORY FILE LIMITS)
### Files to Create:
- `windows/src-tauri/src/translator.rs`: Rust module for zero-token translation querying tokenless endpoints / local engine with language auto-detection.
- `windows/src/views/translator.ts`: UI card with input/output text areas, language swap pills, copy button, and auto-translate trigger on paste.

### Files to Modify:
- `windows/src-tauri/src/lib.rs`: Register Tauri commands for translation and system language query.
- `windows/src/core/state.ts`: Add `TranslationItem` interface and translation state storage.
- `windows/src/views/icons.ts`: Add translation icon (`translate`/`globe`) and copy icon.

## 4. Required Imports & Reusability
- Import `h`, `svg`, `dot`, `clear` from `windows/src/views/dom.ts`
- Import `ICONS` from `windows/src/views/icons.ts`
- Import `card`, `btn`, `stack`, `ViewHost`, `ViewActions` from `windows/src/views/views.ts`
- Import `TranslationItem` from `windows/src/core/state.ts`

## 5. Step-by-Step Execution Plan
- [ ] **Step 1:** Implement `windows/src-tauri/src/translator.rs` to detect language and query high-speed zero-token translation service (client-side free endpoint with fallback).
- [ ] **Step 2:** Expose Tauri commands: `translate_text(text, source, target)`, `get_system_language()`.
- [ ] **Step 3:** Implement `windows/src/views/translator.ts` with auto-focus, paste event listener, and debounce timer to translate automatically upon pasting.
- [ ] **Step 4:** Add 1-click "Copy Translation" button with toast / blip feedback.
- [ ] **Step 5:** Connect Mochi's animation: Mochi enters reading/thinking mode with glasses or focused eyes during translation, then shows happy eyes on completion.

## 6. Definition of Done (Acceptance Criteria)
- [ ] Automatically detects language and applies system default or English target accordingly.
- [ ] Translates with 0 AI token consumption using fast deterministic translation.
- [ ] Copy button copies text to system clipboard and gives clear visual feedback.
- [ ] NO files outside the Sandbox section were modified.
- [ ] Handles network timeout or failure gracefully with a clear retry option.
