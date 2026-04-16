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

| Layer | Technology |
|---|---|
| Desktop framework | Tauri v2 |
| Backend | Rust 1.75+ |
| Frontend | React 18 + TypeScript 5 + Vite |
| Persistence | SQLite via rusqlite |
| AI (cloud) | Anthropic Claude API, OpenAI API |
| AI (local) | Ollama |
| Sprites | PNG (RGBA, 32×32 px, 2× scaled) |
| Pet format | JSON (pet.json schema) |

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

### In Progress

- [ ] Tauri asset protocol fix for sprite loading in production builds
- [ ] Community pet gallery in-app
- [ ] Proactive nudges (idle time detection, app-based reactions)

### Planned

- [ ] Cross-platform testing (macOS, Linux)
- [ ] Plugin system for custom behaviors
- [ ] Voice interaction (TTS/STT)
- [ ] GitHub Actions CI/CD with auto-release
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

## Privacy

NekoAI has no backend servers and no telemetry. All data stays on the user's machine:

- API keys: `~/.config/nekoai/config.toml`
- Conversation history: `~/.local/share/nekoai/memory.db` (SQLite)
- The only outbound network requests are direct calls to the AI provider the user configures

---

## Repository Structure

```
nekoai/
├── src/                     # React/TypeScript frontend
├── src-tauri/               # Rust backend
├── pets/classic-neko/       # Bundled Neko pet (original sprites)
├── pets-community/          # Community-contributed pets
├── scripts/                 # Dev utilities (sprite conversion, etc.)
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

*Made with ☕ and deep nostalgia for Windows XP — by Naudy Castellanos*
