# Settings page audit — 2026-05-28

## Summary

Audited the Settings page (`/settings`) — 1 page entry + 10 section components + 2 reusable field components, 1823 lines total. Found **0 P0 broken-state issues** (everything compiles and wires to live Rust commands), **5 P1 issues** (one is a clear visual bug in the error banner, plus accessibility + dead-code + stale-copy issues), and **6 P2 polish issues**. No stale `tmux` / `App Store` / `MAS` references anywhere in `src/` or `src-tauri/`. The single most likely "fix" target is the **error StatusBanner contrast bug** (text is invisible because foreground and background both use `--color-destructive`).

## Section-by-section findings

### SettingsPage (shell)

- file: `src/pages/settings/SettingsPage.tsx`
- status: ⚠️ has issues
- issues:
  - **[P1] Invisible error banner** (lines 132–137): the `error` variant uses `bg-[var(--color-destructive)] text-[var(--color-destructive)]` — identical token for background and foreground, so the error message is unreadable. Should be `text-destructive-foreground` (or `text-white`).
  - **[P1] Duplicate StatusBanner render**: the banner is rendered twice — once at line 388 (above sections) and again at line 414–416 inside the sticky footer. When `saveStatus !== "idle"` both display the same message, doubling the visual noise.
  - **[P1] Cmd+S effect has no dependency array** (lines 255–264): `useEffect` re-binds the global `keydown` listener on every render. Functionally fine because the cleanup runs, but it churns and the captured `handleSave` is always fresh by accident. Add `[]` (the function is declared in the component scope so it's a stable closure over latest `values` only because of the re-bind — switch to `useCallback` for `handleSave` + `[handleSave]` deps).
  - **[P2] `navigator.platform` is deprecated** (line 421) — already silenced with `eslint-disable-next-line @typescript-eslint/no-deprecated`. Consider `navigator.userAgentData` or a util.
  - **[P2] Dead secret-handling code paths**: `SECRET_KEYS` is an empty array (line 57), so the `getSecrets` branch, `handleDeleteSecret`, the biometric unlock gate inside `handleSave` (lines 288–293), and the `onDeleteSecret` prop threaded into `GeneralSection`/`WorkspaceSection` are all unreachable. Either drop the dead branches or add the secrets they were designed for (BWOC config has none today).
  - **[P2] Reset button does `window.location.reload()`** (line 426): bypasses React Router and reloads the whole app — surprising given the label is just "Reset" (which a user would read as "discard unsaved edits", not "hard-reload"). Either rename to "Discard changes" + use state, or rename to "Reload page".

### General

- file: `src/pages/settings/sections/GeneralSection.tsx`
- status: ⚠️ has issues
- issues:
  - **[P1] `font_size` accepts free-text** (lines 22–27): no `type="number"` / `min` / `max` / validation. User can type `"abc"` and save. Same for `terminal_scrollback` (lines 44–49).
  - **[P2] Dead `onDeleteSecret` prop** (line 55, 80–86): no field in this section has `isSecret: true`, so the prop is wired through but the conditional render never fires.

### Workspace

- file: `src/pages/settings/sections/WorkspaceSection.tsx`
- status: ⚠️ has issues
- issues:
  - **[P2] Same dead `onDeleteSecret` prop** (line 26, 57–65): no secret fields here either.
  - **[P2] Backtick rendering** in helpText (line 18): `` `git clone` `` shows literal backticks because helpText is rendered as plain text in `<p>`, not Markdown.

### Git

- file: `src/pages/settings/sections/GitSection.tsx`
- status: ✅ healthy

### Shortcuts

- file: `src/pages/settings/sections/ShortcutsSection.tsx`
- status: ⚠️ has issues
- issues:
  - **[P1] No conflict detection** (lines 100–105): user can bind two actions to the same combo and the section will silently accept it; the keyboard hook will fire whichever is first. Add a check in `handleChange` / before `handleSave`.
  - **[P2] "Press shortcut" capture has no escape** (lines 37–47): once the input is focused, any key (except modifiers) commits a new binding. There's no way to cancel without rebinding to something else, then re-binding back.
  - **[P2] Save button label says "Save Shortcuts"** but the main page's footer Save button does NOT include shortcuts (they're saved separately). Two save paths for two halves of the same page is confusing — the section's `onSaved` callback only flips the top-level status banner.

### Device Identity

- file: `src/pages/settings/sections/IdentitySection.tsx`
- status: ⚠️ has issues
- issues:
  - **[P1] Stale copy — "broadcast to connected peers"** (line 138): says display-name changes are "broadcast to connected peers immediately." LiteDuck has no peer/network layer per `CLAUDE.md` ("no AI/LLM features, no chat, no agents, no Docker/SSH/GitHub/Scrum integrations"). This copy was likely inherited from LoopDuck. Either remove the sentence or clarify it.
  - **[P2] Reset button colour bug** (lines 153–155): when `confirmReset` is true the className is `bg-[var(--color-destructive)] text-[var(--color-destructive)]` — same red-on-red contrast bug as the StatusBanner error state. The button label is unreadable while in the confirm state.

### Biometric Lock

- file: `src/pages/settings/sections/BiometricSection.tsx`
- status: ✅ healthy (one minor a11y note below)
- issues:
  - **[P2] Toggle switch lacks an accessible label**: the `<button role="switch">` (lines 116–134) only has `aria-checked` — no `aria-label` / `aria-labelledby` pointing at the descriptive text above it. Screen readers will announce "switch, checked" with no context.

### Integrations

- file: `src/pages/settings/sections/IntegrationsSection.tsx`
- status: ✅ healthy
- Note: not in the `CLAUDE.md` list of sections but renders unconditionally. If the docs are canon, this section is undocumented; if the impl is canon, the docs need updating.

### Permissions

- file: `src/pages/settings/sections/PermissionsSection.tsx`
- status: ⚠️ has issues
- issues:
  - **[P1] All seven permissions are hardcoded as "granted"** (lines 18, 24, 30, 36, 42, 48, 54): there is no runtime check. The section is **decorative only** — it doesn't actually verify Tauri permissions, network reachability, or keychain availability. A user denying File System or Keychain access in the OS would still see "Granted" here. Either wire to real checks or relabel as "Required permissions" (informational, not status).

### About

- file: `src/pages/settings/sections/AboutSection.tsx`
- status: ✅ healthy

### Danger Zone

- file: `src/pages/settings/sections/DangerZoneSection.tsx`
- status: ✅ healthy (good a11y — `role="alert"`, `aria-live`, `aria-describedby` all present)

### SettingField / SettingSecret components

- files: `src/pages/settings/components/SettingField.tsx`, `SettingSecret.tsx`
- status: ✅ healthy

## Cross-cutting findings

- **Stale tmux references**: none found in `src/pages/settings/` (or anywhere in `src/` and `src-tauri/`). The terminal commands surfaced in `lib.rs:202–206` are `terminal_create/write/resize/close/list` — clean.
- **Stale App Store / MAS references**: none found.
- **Orphaned `invoke()` calls**: every command called from the settings page is registered in `src-tauri/src/lib.rs`'s `generate_handler!` (verified against `lib.rs:194–272`):
  - `get_settings`, `save_setting`, `get_setting`, `get_secrets`, `delete_setting`, `reset_all_settings` ✓
  - `device_get_identity`, `device_reset_identity` ✓
  - `biometric_status`, `biometric_authenticate`, `biometric_set_gate` ✓
  - `bwoc_detect`, `bwoc_list` ✓
  - `check_for_update`, `get_app_version` ✓
  - `workspace_init`, `path_exists` ✓
- **Bundle-name copy inconsistencies**:
  - `src/pages/settings/sections/WorkspaceSection.tsx:47` — lowercase `~/.liteduck/` (this is the **correct on-disk path** per `CLAUDE.md`, so it's actually intentional, not a typo).
  - `src/pages/settings/sections/AboutSection.tsx:31`, `IntegrationsSection.tsx:99`, `:165` — title-case `LiteDuck` for product-name copy.
  - Verdict: **consistent.** Lowercase is the filesystem path, title-case is the product name; the codebase observes that split correctly.

## Recommended "fix" interpretations

Three plausible answers to "fix settings page", ranked by likelihood given the findings:

1. **Fix the invisible error banner** — `StatusBanner.error` variant uses `text-[var(--color-destructive)]` on `bg-[var(--color-destructive)]`. Same bug exists in `IdentitySection`'s reset-confirm button. This is a real, user-visible regression that breaks the only failure-path the user sees on the Settings page. **Highest likelihood given the parallel UX redesign in flight** — a designer reviewing the page would spot this immediately.
2. **Strip the stale "broadcast to connected peers" line** from `IdentitySection.tsx:138`. Direct contradiction with `CLAUDE.md`'s "no AI/LLM features, no chat, no agents" charter — this is LoopDuck residue. Operator may have noticed while reviewing the page and flagged it as wrong.
3. **Fix the dead `Permissions` section** — every row is hardcoded to "Granted" with no real check. Either wire to runtime status (Tauri `path_allowed`, keychain availability, network reachability) or relabel as informational. Operator may have tested by denying a permission in macOS Settings, seen "Granted" still, and called it broken.

## Suggested follow-up question for the operator

> 🌸 พี่ต้นกล้าคะ จีซูดูแล้วเจอ 3 จุดที่อาจจะใช่ "fix settings page" ที่พี่หมายถึง:
> (1) error banner สีแดงทับสีแดง อ่านไม่ออก, (2) Device Identity ยังเขียนว่า "broadcast to connected peers" ทั้งที่ LiteDuck ไม่มี peer, (3) Permissions section hardcode "Granted" ทุกอัน
> พี่หมายถึงข้อไหนคะ หรือเป็นเรื่องอื่นที่จีซูยังไม่เห็นนะคะ ☕
