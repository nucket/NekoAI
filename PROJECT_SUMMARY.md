# NekoAI — Project Summary

> **Author:** Naudy Castellanos ([@nucket](https://github.com/nucket))  
> **Repository:** https://github.com/nucket/nekoai  
> **License:** MIT  
> **Status:** Active development — v0.1 in progress

---

## What is NekoAI?

NekoAI is an open-source, AI-powered desktop pet that lives on your screen. Inspired by the classic desktop companions of the 90s and early 2000s (Neko, eSheep, Shimeji), it brings those beloved characters into the modern era with a real AI brain, multi-directional animation, and an extensible community pet format.

The pet wanders freely across your desktop, reacts to cursor movement and window activity, and holds conversations with you via an animated speech bubble — powered by Claude, GPT, or a fully local Ollama model.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Tauri v2 App (Rust backend + React/TypeScript frontend) │
│                                                          │
│  Frontend (WebView)          Backend (Rust)              │
│  ┌─────────────────┐         ┌───────────────────────┐  │
│  │ PetRenderer.tsx │         │ main.rs               │  │
│  │ — sprite anim   │ IPC     │ — tray icon, window   │  │
│  │ usePetMovement  │◄───────►│ desktop_monitor.rs    │  │
│  │ — 8-dir cursor  │         │ — active window API   │  │
│  │ SpeechBubble    │         │ storage.rs            │  │
│  │ SettingsPanel   │         │ — SQLite memory       │  │
│  └─────────────────┘         └───────────────────────┘  │
│            │                                             │
│            ▼                                             │
│  ┌─────────────────┐                                     │
│  │ AI Providers    │                                     │
│  │ Anthropic API   │  ← user's own API key               │
│  │ OpenAI API      │  ← user's own API key               │
│  │ Ollama (local)  │  ← no key required                  │
│  └─────────────────┘                                     │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer             | Technology                                                     |
| ----------------- | -------------------------------------------------------------- |
| Desktop framework | Tauri v2                                                       |
| Backend           | Rust 1.75+                                                     |
| Frontend          | React 19 + TypeScript 6 + Vite                                 |
| Persistence       | SQLite via rusqlite                                            |
| AI (cloud)        | Anthropic Claude API, OpenAI API                               |
| AI (local)        | Ollama                                                         |
| Sprites           | PNG (RGBA, 32×32 px native, 1×/2×/3×/4× integer scaling)       |
| Pet format        | JSON (pet.json schema)                                         |
| State management  | Zustand                                                        |
| Styling           | Inline CSS-in-JS + dynamic inline styles for responsive sizing |

---

## Development Progress

### Completed

- [x] Transparent always-on-top Tauri window
- [x] Sprite animation engine (`PetRenderer.tsx`) — individual PNG frames
- [x] 8-direction cursor tracking movement state machine (`usePetMovement.ts`)
- [x] Pet definition format (`pet.json`) with animations and AI triggers
- [x] Classic Neko sprites integrated (32 original ICO files converted to PNG)
- [x] Speech bubble UI with typewriter effect
- [x] Settings panel with API key configuration
- [x] Multi-provider AI (Anthropic, OpenAI, Ollama)
- [x] SQLite persistence for conversation history
- [x] System tray icon with context menu
- [x] Right-click context menu (`ContextMenu.tsx`) — quick access to settings, pet selection, and size adjustment
- [x] Adjustable pet size with integer-multiple scaling (32, 64, 96, 128 px) for pixel-perfect rendering
- [x] Rust `resize_window` command to bypass Windows OS-level window resizing restrictions
- [x] Dynamic CSS sizing via inline styles (no hardcoded pixel values in stylesheets)
- [x] Adaptable storage paths — portable mode writes all data to `./data/` beside the exe
- [x] Windows portable build script (`scripts/build-portable-windows.ps1`)

### In Progress

- [ ] Tauri asset protocol fix for sprite loading in production builds
- [ ] Community pet gallery in-app
- [ ] Proactive nudges (idle time detection, app-based reactions)
- [ ] Fedora Linux support (desktop_monitor Linux impl, AppImage/RPM bundles)

### Planned

- [ ] macOS testing
- [ ] GitHub Actions CI/CD with auto-release (Windows installer + portable + Linux AppImage/RPM)
- [ ] Plugin system for custom behaviors
- [ ] Voice interaction (TTS/STT)
- [ ] v0.1.0 public release

---

## Pet Format

NekoAI uses an open, JSON-based **Pet Definition Format** that allows anyone to create and share pets via pull request.

A pet consists of:

- `pet.json` — metadata, animation definitions, AI personality, and event triggers
- `sprites/` — PNG files (32×32 RGBA) for each animation frame

The format supports 18+ named animations, configurable fps and loop behavior, and a custom AI system prompt that defines the pet's personality in conversations.

Community pets live in `pets-community/` and are listed in the in-app gallery.

---

## Architectural Decisions

### Window Resizing on Windows (`resize_window` Command)

**Challenge:** The app has `resizable: false` in `tauri.conf.json` to create a truly frameless window. However, when Windows creates a non-resizable window, it removes the `WS_THICKFRAME` window style, which JavaScript APIs cannot restore at runtime.

**Solution:** A Rust command-side implementation of `resize_window()` calls `window.set_size()` directly from the backend, completely bypassing the JS API limitation. This allows:

- Speech bubbles to expand/collapse without showing resize handles
- Settings and context menus to appear/disappear smoothly
- Dynamic pet size adjustment via UI controls

**Implementation:** `src-tauri/src/lib.rs` registers the command and handles resizing for all interactive panels.

### Pixel-Perfect Sprite Scaling

**Challenge:** Arbitrary pet sizes (like 48px = 1.5× of the 32px native sprite) cause uneven pixel mapping, resulting in visible borders and artifacts in pixelated art.

**Solution:** Restrict all pet sizes to integer multiples of 32px:

- S = 32px (1×), M = 64px (2×), L = 96px (3×), XL = 128px (4×)
- This ensures each sprite pixel maps to an exact integer of screen pixels with no anti-aliasing

**Implementation Details:**

- CSS sizes are **not hardcoded** in `App.css`; instead they're injected as inline styles from `App.tsx` using the `spriteSize` state
- `PetRenderer.tsx` has `imageRendering: "pixelated"` and `display: block` to prevent baseline gaps and sub-pixel rendering
- Container styles dynamically update when the user changes size via the context menu

## Privacy

NekoAI has no backend servers and no telemetry. All data stays on the user's machine:

- API keys: `~/.config/nekoai/config.toml` (or `./data/config.toml` in portable mode)
- Conversation history: `~/.local/share/nekoai/memory.db` (or `./data/memory.db` in portable mode)
- Pet size preference: persisted in `configStore.ts` via `save_config` command
- The only outbound network requests are direct calls to the AI provider the user configures
- In portable mode (a `portable` file beside the exe), all data stays in the same folder as the exe — nothing written to the home directory

---

## Repository Structure

```
nekoai/
├── src/                     # React/TypeScript frontend
├── src-tauri/               # Rust backend
├── pets/classic-neko/       # Bundled Neko pet (original sprites)
├── pets-community/          # Community-contributed pets
├── scripts/                 # Dev utilities (sprite conversion, portable build)
├── docs/                    # Architecture, install guides, pet format spec
│   ├── architecture.md
│   ├── creating-a-pet.md
│   └── install-windows.md
├── .github/                 # CI/CD workflows, issue templates
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── CHANGELOG.md
└── LICENSE                  # MIT
```

---

## How to Contribute

The easiest contribution is creating a new pet — add sprites and a `pet.json` to `pets-community/` and open a PR. No Rust knowledge required.

See [CONTRIBUTING.md](CONTRIBUTING.md) for full setup instructions, sprite guidelines, and the PR checklist.

---

## Links

- **Repository:** https://github.com/nucket/nekoai
- **Issues:** https://github.com/nucket/nekoai/issues
- **Discussions:** https://github.com/nucket/nekoai/discussions
- **Author:** https://github.com/nucket

---

_Made with ☕ and deep nostalgia for Windows XP — by Naudy Castellanos_
