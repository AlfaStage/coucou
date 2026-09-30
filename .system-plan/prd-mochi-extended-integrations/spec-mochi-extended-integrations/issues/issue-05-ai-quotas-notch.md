# Issue: AI Quotas Notch (Codenotch & CodexBar Pattern)

## 1. Traceability
- **Parent Spec:** `/.system-plan/prd-mochi-extended-integrations/spec-mochi-extended-integrations/spec.md`
- **Issue Number:** #05
- **Issue Type:** Quota Aggregator Service & Circular Progress UI

## 2. Task Description
Implement the AI limit/quota monitoring system inspired by `vinzdg/codenotch` and `steipete/CodexBar`. Tracks usage, limits, and reset times for OpenAI Codex, Claude Code, Antigravity, Cursor, and other providers by inspecting local caches (`~/.claude`, Cursor `state.vscdb`) and credentialed endpoints. Displays circular SVG progress rings. Employs smart filtering in the glanceable notch area: only providers whose quota changed or reached a warning threshold (>80%) appear as pills, preventing visual clutter while providing full details in an expanded view.

## 3. The Sandbox (MANDATORY FILE LIMITS)
### Files to Create:
- `windows/src-tauri/src/quotas.rs`: Rust module aggregating quota metrics from local files and APIs with change detection.
- `windows/src/views/quotas.ts`: UI dashboard showing all providers with circular SVG meters, % used, and reset countdowns.

### Files to Modify:
- `windows/src-tauri/src/lib.rs`: Register Tauri command `get_ai_quotas` and background poller.
- `windows/src/core/state.ts`: Add `AiQuotaItem` interface and quota list to app state.
- `windows/src/views/icons.ts`: Add quota circular ring and provider mini-icons.
- `windows/src/style.css`: Add styles for SVG stroke-dasharray circular progress meters.

## 4. Required Imports & Reusability
- Import `h`, `svg`, `dot`, `clear` from `windows/src/views/dom.ts`
- Import `ICONS` from `windows/src/views/icons.ts`
- Import `card`, `btn`, `stack`, `ViewHost`, `ViewActions` from `windows/src/views/views.ts`
- Import `AiQuotaItem` from `windows/src/core/state.ts`

## 5. Step-by-Step Execution Plan
- [ ] **Step 1:** Write `windows/src-tauri/src/quotas.rs` with adapters for Claude Code (`~/.claude`), Cursor (`state.vscdb`), OpenAI, and Antigravity.
- [ ] **Step 2:** Implement diff detection: compare current usage with previous poll; set `changedRecently = true` if the percentage shifted.
- [ ] **Step 3:** Implement circular SVG progress meter helper in `windows/src/views/quotas.ts` using `stroke-dasharray` and `stroke-dashoffset`.
- [ ] **Step 4:** Render smart pills in the compact island: filter for providers with `changedRecently == true` or `status != "normal"`.
- [ ] **Step 5:** Connect Mochi rate-limit state: if any provider hits >90%, Mochi triggers sweat particles and tired eyes (`ratelimit`).

## 6. Definition of Done (Acceptance Criteria)
- [ ] Quotas are read from local caches without exposing credentials.
- [ ] Compact island shows ONLY providers with changed quotas or warnings.
- [ ] Circular meters accurately reflect percentage (0-100%).
- [ ] Expanded AI Limits view lists all configured providers with reset times.
- [ ] NO files outside the Sandbox section were modified.
