# Changelog

All notable changes to NekoAI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] — Unreleased

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
