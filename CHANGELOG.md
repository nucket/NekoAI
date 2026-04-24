# Changelog

All notable changes to NekoAI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] — Unreleased

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
