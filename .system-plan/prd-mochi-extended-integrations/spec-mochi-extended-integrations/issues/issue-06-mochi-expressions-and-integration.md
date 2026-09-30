# Issue: Mochi Expressions, System Integration, Settings & Polish

## 1. Traceability
- **Parent Spec:** `/.system-plan/prd-mochi-extended-integrations/spec-mochi-extended-integrations/spec.md`
- **Issue Number:** #06
- **Issue Type:** Character Animation, Layout Integration & Polish

## 2. Task Description
Integrate all new features into Mochi's central character system and Coucou's overall layout. Add new reactive states to Mochi: music dancing (head bobbing, musical notes), listening glow (cyan waves for Whisper), reading mode (translator), and rate-limit sweat (AI quotas). Update Island header tabs with the new views, adjust window sizing in `core/layout.ts`, add styling to `style.css`, and add configuration toggles in the Settings window.

## 3. The Sandbox (MANDATORY FILE LIMITS)
### Files to Create:
- (None)

### Files to Modify:
- `windows/src/mochi/engine.ts`: Add `dancing` state, musical note particles, and listening aura tint.
- `windows/src/core/layout.ts`: Register view names (`quotas`, `apps`, `translator`, `spotify`) and dimension presets.
- `windows/src/views/views.ts`: Add header tabs for Apps, Translator, and Quotas; wire view factory.
- `windows/src/style.css`: Add styles for app launcher grid, circular quota meters, translation card, and Spotify controls.
- `windows/src/settings/settings.ts`: Add settings toggles for Spotify integration, Quotas monitoring, and Dictation mode.

## 4. Required Imports & Reusability
- Import `BotEngine`, `BOT_STATES`, `EyeShape` from `windows/src/mochi/engine.ts`
- Import `VIEW_LAYOUTS`, `IslandViewName` from `windows/src/core/layout.ts`
- Import `ViewHost`, `ViewActions` from `windows/src/views/views.ts`
- Import `ICONS` from `windows/src/views/icons.ts`

## 5. Step-by-Step Execution Plan
- [ ] **Step 1:** In `windows/src/mochi/engine.ts`, add musical note particle type (`note`), dancing bob tween, and cyan listening tint mode.
- [ ] **Step 2:** In `windows/src/core/layout.ts`, define dimensions for the new views: `quotas` (expanded panel), `apps` (grid panel), `translator` (medium card).
- [ ] **Step 3:** In `windows/src/views/views.ts`, update `buildHeader` with the complete set of navigation tabs and wire all view builders.
- [ ] **Step 4:** Polish `windows/src/style.css` ensuring full visual parity with Coucou's frosted dark aesthetics, micro-animations, and responsive layout.
- [ ] **Step 5:** Add integration checkboxes and options in `windows/src/settings/settings.ts`.

## 6. Definition of Done (Acceptance Criteria)
- [ ] Mochi expresses distinct, lively animations for music, listening, translating, and quota alerts.
- [ ] All header tabs switch views smoothly with Coucou sound blips.
- [ ] Visual design strictly matches the existing dark glassmorphic Coucou aesthetics.
- [ ] Settings window allows enabling/disabling new integrations.
- [ ] NO files outside the Sandbox section were modified.
