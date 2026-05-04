# Changelog

All notable changes to NekoAI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] — Unreleased

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
