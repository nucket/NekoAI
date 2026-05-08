# Changelog

All notable changes to NekoAI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] — Unreleased

### Changed — Codebase audit and hardening (May 2026)

Seven targeted fixes from a static audit of the v0.2.0 codebase. No user-visible behaviour changes.

**`src/types/pet.ts` — type alignment with `pet.schema.json`**

- Rewrote `AnimationConfig` to match the actual on-disk format: `files: string[]` (one PNG per frame) instead of the old `frames: number[]` (sprite-sheet indices). Removed the now-unnecessary `SpriteConfig` interface.
- Added the missing fields `personality`, `system_prompt`, `spritesDir`, `description`, and `version` to `PetDefinition` — all present in the JSON schema but absent from the TS type, which meant App.tsx had been carrying a redundant private copy of the interface.
- `PetRenderer.tsx` now imports `AnimationConfig` directly from `src/types/pet.ts` instead of declaring its own `AnimationDef`.

**Dead code removal**

- Deleted `src/pets/loader.ts`, `src/pets/placeholderSprite.ts`, and `src/pets/index.ts` (barrel re-export). These described the old sprite-sheet paradigm and were never imported anywhere; the active runtime path fetches `pet.json` directly in `App.tsx`.

**`src/store/index.ts` — remove unused `activePet`**

- Removed `activePet: PetDefinition | null` and `setActivePet` from `AppState`. The fields were declared, never set, and never read — `configStore.activePetId` (persisted to TOML) is the single source of truth for the active pet, and the loaded `PetDefinition` object lives in `App.tsx` local state.

**`src-tauri/src/storage.rs` — SQLite stability**

- Replaced the per-call `rusqlite::Connection::open()` with a process-wide `OnceLock<Mutex<Connection>>`. Concurrent writes (chat save + config update) previously risked `SQLITE_BUSY`; the mutex serialises them without a full pool.
- Enabled `journal_mode=WAL` and `synchronous=NORMAL` so reads don't block on a writer.
- Set `busy_timeout=5s` as a backstop.

**`src-tauri/src/storage.rs` — conversation pruning**

- The `conversations` table now prunes itself after every 20 inserts: rows older than 30 days and rows beyond the most-recent 200 are deleted (whichever cuts more). Two new indexes (`idx_conversations_id_desc`, `idx_conversations_timestamp`) keep both the read path and the prune query efficient.
- Exposed `prune_conversations(max_rows, max_age_days)` and `clear_conversations()` as Tauri commands so the frontend can run an on-demand purge or a "Reset memory" action.

**`src-tauri/src/lib.rs` — notification thread shutdown**

- The background notification monitor previously ran a `loop { thread::sleep(500ms); ... }` with no exit path. Replaced with `mpsc::recv_timeout` — same 500 ms polling interval, but the loop exits cleanly when `RunEvent::Exit` fires. The shutdown sender is stored in Tauri managed state (`NotificationShutdown`).

**`.github/workflows/ci.yml` — cross-platform CI + rustfmt**

- Added `cargo fmt --all -- --check` to the `rust-check` job (was only running clippy). Includes a repo-wide `rustfmt` pass to establish the baseline.
- Converted `rust-check` and `test` jobs to a `strategy.matrix` over `ubuntu-latest`, `windows-latest`, and `macos-latest`. Platform-specific compile errors in `desktop_monitor.rs` and the Windows/Linux crate flags are now caught before release.
- Added `npm run build` (Vite production build) to the `typecheck` job so frontend bundling regressions are caught alongside type errors.

---

### Fixed — Movement / Animation separation (May 2026)

Movement state and sprite animation were tightly coupled, causing idle/groom
animations to visually override walking sprites. Full audit and refactor applied.

**`src/App.tsx` — `resolveAnimation()` priority arbiter**

- Extracted animation selection into a pure `resolveAnimation()` function with two firm rules:
  1. `notificationAlert` always wins (pet teleported to notification).
  2. While `petState === 'WALKING'`, only `edgeAnimOverride` (scratch at wall) can override `walk_*` — `idleAnim`, `moodOverride`, and `clickWakeAnim` are ignored completely.
- This fixes the visible glitch where the `awaken`/`wash` sprite appeared mid-walk for 375ms.

**`src/hooks/useIdleSequencer.ts` — faithful classic Neko STOP sequence**

- Added `stop` phase (250 ms) before `wash` — pet settles briefly on arrival (original `NIKAKI_TIME`).
- `awaken` wake-up flash now only fires if the pet reached at least the `yawning` phase before the cursor moved away — brief NEAR_CURSOR bumps during approach no longer trigger `awaken`.
- `lastPhaseRef` tracks how deep into the sequence the pet went.
- On NEAR_CURSOR exit, `anim` is cleared immediately so no stale sprite bleeds into the next state.

**`src/hooks/useMoodEngine.ts` — yawn scoping**

- Yawn override restricted to `petState === 'IDLE'` only (was also firing during `NEAR_CURSOR`, racing the idle sequencer's own yawn).
- Post-WALKING cooldown extended from 2 s → 5 s so a yawn never appears immediately after a walk ends.

**`src/hooks/usePetMovement.ts` — tighter NEAR_CURSOR hysteresis**

- Added `NEAR_ENTER_FACTOR = 0.7`: pet must be within `nearThreshold × 0.7` (≈ 35 px) to enter NEAR_CURSOR; exit radius stays at `× 1.5` (75 px) — prevents oscillation.
- `CURSOR_IDLE_MS` raised from 250 ms → 400 ms so a brief mouse pause during approach doesn't prematurely trigger NEAR_CURSOR.
- `EDGE_PAUSE_MS` / `EDGE_COOLDOWN_MS` moved to module-level constants.

**Deleted `src/hooks/usePetAnimation.ts`** — hook was never imported; `PetRenderer` already drives frames via `requestAnimationFrame`. Removal eliminates a stale `setInterval` that was counted in the timer budget for no benefit.

---

### Fixed — Monitor edge-crossing: bounding-box scratch sequence (May 2026)

The pet previously crossed monitor boundaries mid-animation (sprite appeared split across
two screens) and edge detection fired after the cross instead of before.

**`src/hooks/usePetMovement.ts` — pre-cross bbox detection + EdgePhase state machine**

- Edge detection now projects the **full sprite bounding box** (`[winX, winX+windowSize]`) against the current monitor's bounds; a hit triggers before any pixel leaves the monitor.
- When a bounding-box violation is detected, the pet is **clamped** to fit entirely within the current monitor before the scratch sequence starts — sprite never straddles two screens.
- `onEdgeHit(direction)` replaced by `onEdgeAnimation(kind, direction, durationMs)` supporting `kind ∈ {'scratch','yawn','idle'}` for multi-phase dispatch.
- New `EdgePhase` state machine (`scratch1 → yawning → resting → scratch2 → cross`):
  - Pet freezes in current monitor during all non-`none` phases.
  - After `scratch1`, with `EDGE_YAWN_PROBABILITY = 0.5` (configurable), the pet plays `yawn` (750 ms) → idle rest (1.5–3 s random) → `scratch2` (1.5 s) before crossing.
  - Without the extended sequence (other 50%), the pet crosses immediately after `scratch1`.
  - `EDGE_CROSS_GRACE_MS = 600 ms` cooldown after the sequence ends lets the pet step through the boundary without immediately re-triggering.
- Removed the post-cross `prevMonIdx !== currMonIdx` detection block — all detection is now pre-cross.
- Added `getBoundingBoxEdgeHit()` helper (picks direction from largest bounding-box violation).

**`src/App.tsx` — `handleEdgeAnimation()`**

- Replaced `handleEdgeHit` with `handleEdgeAnimation(kind, direction, durationMs)`.
- Resolves animation name from `pet.json` triggers for `scratch` (`on_edge_hit_<dir>`), uses `yawn` sprite directly, and `idle` as the resting fallback.
- `edgeAnimOverride` is set for exactly the duration the movement hook requested, keeping animation and frozen-position in sync.

---

### Added — House Window

- `src/HouseWindow.tsx`: new 64×64 transparent Tauri window that renders the active pet's `house.png` (CSS fallback for pets without one)
  - Positions itself at the bottom-right corner of the primary monitor on startup
  - Clicking it invokes `panel_action` with `house_pos:x,y`, which triggers `overridePosition` in the main window and sends the pet home
  - Listens for `config-updated` to refresh when the user switches pets
- `src-tauri/tauri.conf.json`: registered `house` window (`visible: false`, transparent, no decorations, `alwaysOnTop: false`)
- `src/main.tsx`: added `route === 'house'` branch so the house window renders `<HouseWindow />` instead of `<App />`
- `pets/ghost-pixel/house.png` + `house.svg`: house images for the Ghost pet

### Added — Notification monitor

- `src-tauri/src/lib.rs`: background thread polls every 500 ms for foreground window changes while OS idle > 1 s
  - Skips NekoAI's own windows; emits `neko-notification` (with `WindowInfo`) to all windows when a new non-NekoAI window gains focus
- `src/App.tsx`: listens for `neko-notification` — computes a physical target position near the notifying window (above the taskbar), calls `overridePosition`, sets `notificationAlert` for 5 s
  - `PetRenderer` plays `alert` animation during the alert phase (falls back to `idle` if pet has no `alert`)

### Added — New bundled pets

- `pets/dragon-pixel/`: Ember — fire dragon with snarky personality, full 20-animation sprite set + `house.png`
- `pets/penguin-pixel/`: Pingu — cheerful penguin, full 20-animation sprite set + `house.png`
- `pets/manifest.json`: added `dragon-pixel` (Ember) and `penguin-pixel` (Pingu) entries
- `src-tauri/src/lib.rs`: added tray entries "Ember (Dragon)" and "Pingu (Penguin)" to Select Pet submenu; version label updated to v0.2.0

### Added / Changed — Ghost pet refresh

- `pets/ghost-pixel/sprites/`: all sprites renamed to new convention (`walk_right1.png`, not `right1.png`) and extended to 4 frames per direction; 6 new animations added: `playing`, `hunting`, `bored`, `studying`, `alert`, plus expanded `awaken` and `falling_asleep`
- `pets/ghost-pixel/pet.json`: updated all animation file lists to match new naming; added new animation entries

### Added — `bored` animation

- `src/hooks/usePetMovement.ts`: after 1 min of cursor idle (both work and play modes), transitions animation to `bored` if the pet defines it, otherwise stays `idle`. Reverts to `idle` as soon as the cursor moves within the near zone.

### Added — Animation fallback chain

- `src/hooks/usePetMovement.ts`: `getWalkAnimation` now receives `availableAnimations` from the hook options and falls back gracefully (diagonal → axis → generic `walk`) if the ideal direction is missing. Allows pets with partial sprite sets (e.g. no diagonals) to animate correctly.
- `src/App.tsx`: passes `availableAnimations` (derived from `petDef.animations`) to `usePetMovement`

### Added — `activePetId` persistence

- `src-tauri/src/storage.rs`: `AIConfig` now includes `active_pet_id: Option<String>` (default `"classic-neko"`)
- `src/ai/types.ts`: added `activePetId?: string` to `AIConfig`
- `src/store/configStore.ts`: added `setActivePetId` action; default config includes `activePetId: 'classic-neko'`
- `src/App.tsx`: `activePetId` is now read from `config.activePetId` (persisted) instead of local component state

### Added — `overridePosition` API

- `src/hooks/usePetMovement.ts`: exposed `overridePosition(x, y)` callback that teleports the pet to given physical screen coordinates, bypassing the normal state machine. Used by both the notification handler and the house button.

### Changed — `save_config` emits event

- `src-tauri/src/lib.rs`: `save_config` command now accepts `AppHandle` and emits `config-updated` to all windows so the House Window can refresh its pet id without polling.

### Changed — Yawn timing

- `src/hooks/useMoodEngine.ts`: reduced yawn idle window from 3–5 min to 1–2 min, aligning with the new `bored` phase at 1 min.

### Added — NVIDIA NIM provider

- `src/ai/providers/nvidia.ts`: new `NvidiaProvider` using `invoke('nvidia_chat', ...)` instead of `fetch()` — bypasses WebView CORS since `integrate.api.nvidia.com` is a server-to-server API
- `src-tauri/src/lib.rs`: added `nvidia_chat` Tauri command that calls the NVIDIA endpoint via `reqwest` from native Rust
- `src/ai/types.ts`: added `'nvidia'` to the `ProviderType` union
- `src/ai/index.ts`: registered `NvidiaProvider` in the provider factory
- `src/components/SettingsPanel.tsx`: added "NVIDIA NIM" option to the provider dropdown with `nvapi-…` key placeholder
- Default model: `meta/llama-3.1-8b-instruct`; free tier at [build.nvidia.com](https://build.nvidia.com)

### Changed — Dependency upgrades (May 2026)

Maintenance bumps from Dependabot. No user-visible behavior changes.

**JavaScript:**

| Package                           | From   | To     |
| --------------------------------- | ------ | ------ |
| `vite`                            | 5.4.x  | 8.0.10 |
| `@vitejs/plugin-react`            | 4.7.0  | 6.0.1  |
| `eslint-config-prettier`          | 9.1.2  | 10.1.8 |
| `typescript-eslint`               | 8.58.2 | 8.59.2 |
| `eslint`                          | 10.2.1 | 10.3.0 |
| `@commitlint/cli`                 | 20.5.0 | 20.5.3 |
| `@commitlint/config-conventional` | 20.5.0 | 20.5.3 |
| `@tauri-apps/api`                 | 2.10.1 | 2.11.0 |

**Rust:**

| Crate             | From   | To     |
| ----------------- | ------ | ------ |
| `tauri`           | 2.10.3 | 2.11.0 |
| `tauri-build`     | 2.5.6  | 2.6.0  |
| `tauri-plugin-fs` | 2.5.0  | 2.5.1  |
| `rusqlite`        | 0.31   | 0.39.0 |
| `toml`            | 0.8    | 0.9.12 |
| `windows`         | 0.58   | 0.61.3 |

### Fixed — windows 0.61 breaking changes

- `src-tauri/src/desktop_monitor.rs`: `BOOL` moved from `Win32::Foundation` to `windows::core`; `K32GetModuleBaseNameW` second param changed from `HMODULE` to `Option<HMODULE>` — updated import and call site accordingly

### Changed — Dependency upgrades (April 2026)

Major version bumps across the frontend toolchain. No user-visible behavior changes.

| Package                                   | From   | To           |
| ----------------------------------------- | ------ | ------------ |
| `react` / `react-dom`                     | 18.3.1 | 19.2.5       |
| `typescript`                              | 5.9.3  | 6.0.3        |
| `zustand`                                 | 4.5.7  | 5.0.12       |
| `eslint`                                  | 9.39.4 | 10.2.1       |
| `@eslint/js`                              | 9.39.4 | 10.0.1       |
| `eslint-plugin-react-hooks`               | 5.2.0  | 7.1.1        |
| `eslint-plugin-react-refresh`             | 0.4.26 | 0.5.2        |
| `lint-staged`                             | 15.5.2 | 16.4.0       |
| `@commitlint/cli` + `config-conventional` | 19.8.1 | 20.5.0       |
| `@vitejs/plugin-react`                    | 4.3.1  | 4.7.0 (auto) |

### Fixed — Lint and type errors introduced by upgrades

- `tsconfig.json`: removed deprecated `baseUrl` (no longer required in TS6 with `moduleResolution: bundler`); upgraded `lib` from `ES2020` to `ES2022` to support `Error({ cause })`
- `PanelWindow.tsx`: moved `close` / `showMenu` declarations above their `useEffect` to satisfy new `react-hooks/immutability` rule
- `ContextMenu.tsx`, `PetSelector.tsx`: removed stale `eslint-disable exhaustive-deps` directives
- `SpeechBubble.tsx`, `usePetAnimation.ts`, `ContextMenu.tsx`: suppressed `react-hooks/set-state-in-effect` for intentional synchronous state resets
- `usePetMovement.ts`: suppressed `react-hooks/purity` for `Date.now()` in `useRef`; added `windowSize` to rAF loop dependency array (was missing, reported as warning)
- `loader.ts`: attached original `cause` to re-thrown `Error` (`preserve-caught-error` rule)

---

### Added — Google Gemini provider

- `src/ai/providers/gemini.ts`: new `GeminiProvider` class using the Gemini REST API (`generativelanguage.googleapis.com/v1beta`)
  - Translates `assistant` role to `model` (Gemini's convention)
  - System prompt sent via `system_instruction` field
  - Default model: `gemini-1.5-flash`
- `src/ai/types.ts`: added `'gemini'` to the `provider` union type
- `src/ai/index.ts`: registered `GeminiProvider` in the factory
- `src/components/SettingsPanel.tsx`: added "Google (Gemini)" option to the provider dropdown with `AIza…` key placeholder

### Added — About NekoAI menu

- `src/PanelWindow.tsx`:
  - Added "ℹ About NekoAI" button to context menu (before Quit)
  - About sub-view displays project info, creator (Naudy Castellanos), contact email, and GitHub star button
  - Panel resizes to 300px when showing About view; Escape/Back returns to menu
- `src-tauri/src/lib.rs`: added `open_url` command using `tauri_plugin_shell::ShellExt` to open URLs/mailto links

### Fixed — Size selector

- `src/PanelWindow.tsx`: size buttons now call `setPetSize()` locally before relaying via `panelAction`, so the active-size highlight updates immediately (mode buttons already followed this pattern; size buttons did not)
- `src/App.tsx`: added `useEffect([spriteSize, isLoaded])` that calls `resize_window` whenever pet size changes — previously the store updated but the OS window never resized, clipping larger sprites; also fixes initial load when saved size differs from the 32×32 default window

### Fixed — UI & Animations

- `src/components/PetSelector.tsx`:
  - Add window expand/collapse effect when opening/closing pet selector (fixes invisible panel)
  - Remove dark overlay background (rgba(0,0,0,0.5)) that showed as outer rectangle; replace with nearly-invisible rgba(0,0,0,0.01)
  - Set explicit panel width for consistent layout across window sizes
- `src/components/SpeechBubble.tsx`:
  - Replace typewriter animation with scramble text effect
  - Characters progressively lock in left-to-right with 5-char lookahead of random noise
  - Maintains ~30ms per character reveal speed for smooth decode feel
  - Spaces and newlines pass through without scrambling for readability

### Added — Persistent memory

- `storage.rs`: `get_all_user_facts()` Tauri command returns all stored facts as a map
- `src/ai/memory.ts`: new module — `loadFacts()` and `extractAndSaveFacts()`
  - Extracts name, current project, and programming language from conversation text
  - Runs asynchronously after each AI reply (fire-and-forget)
- `src/ai/index.ts`: `buildContextBlock()` now accepts `facts` and optional `mood`
  - Facts injected as `key=value` pairs into the AI system prompt
  - Mood described in natural language ("sleepy, content, curious")
- `src/App.tsx`: `handleSendMessage` replaces `mockAI` placeholder
  - Saves every message to SQLite, loads 20-message history and all facts per turn

### Added — Dynamic mood engine

- `src/hooks/useMoodEngine.ts`: new hook, polls every 60 s using refs to avoid stale closures
  - `energy` — sinusoidal day/night curve + OS idle penalty (−4 per idle minute, max −50)
  - `happiness` — higher during waking hours (7am–10pm)
  - `curiosity` — based on active app category (coding → 75, other → 40)
  - Emits `yawn` animation override when OS idle is between 3–5 minutes
- `src/App.tsx`: applies `moodOverride ?? currentAnimation` to `PetRenderer`

### Added — Multiple pets

- `pets/manifest.json`: registry file read by `PetSelector` to list available pets
- `pets/ghost-pixel/pet.json`: Ghost — ethereal, gentle personality, full animation set defined
- `pets/shiba-pixel/pet.json`: Shiba — loyal, enthusiastic personality, full animation set defined
- `src/components/PetSelector.tsx`: fetches `manifest.json` dynamically on open; shows "sprites needed" badge for pets awaiting sprites
- `src-tauri/src/lib.rs`: tray menu includes Ghost and Shiba entries; version bumped to v0.2.0
- `src/App.tsx`: pet loading now re-fetches on `activePetId` change (was hardcoded to `classic-neko`)

### Added — Documentation

- `docs/creating-a-pet.md`: full guide — folder structure, `pet.json` spec, sprite requirements, manifest and tray registration steps
- `docs/architecture.md`: frontend layers, Rust commands table, SQLite schema, chat-turn data flow diagram

### Fixed

- `src/components/SettingsPanel.tsx`: updated `buildContextBlock()` call to new signature

---

## [0.1.0] — Unreleased

### Added

- 8-direction movement system (walk_right, walk_left, walk_up, walk_down + 4 diagonals)
- Real sprite loading from `pets/classic-neko/sprites/` using Tauri asset protocol
- `pet.json` definition format with animations, triggers, and AI system prompt
- Multi-provider AI integration: Anthropic Claude, OpenAI, Ollama (local)
- Persistent SQLite storage for conversation history and user preferences
- Speech bubble UI with typewriter effect and thinking animation
- Settings panel (right-click) for API key and provider configuration
- System tray icon with show/hide and quit options
- Transparent always-on-top window with cursor tracking
- `usePetMovement` hook with 8-direction angle-based selection
- `useDesktopContext` hook: active window detection, app categorization (coding/browsing/music/communication)
- `usePetBrain` hook: coding session alert (90 min), music reaction, idle sleep
- Autostart via `tauri-plugin-autostart`
- Config persistence via TOML at `~/.config/nekoai/config.toml`

---

[Unreleased]: https://github.com/nucket/nekoai/compare/HEAD
