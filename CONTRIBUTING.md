# Contributing to NekoAI

Thank you for considering contributing to NekoAI! This project is community-first — every PR, bug report, idea, and new pet skin makes it better for everyone.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Creating a New Pet](#creating-a-new-pet)
- [Pet Definition Format](#pet-definition-format)
- [Sprite Guidelines](#sprite-guidelines)
- [Submitting a PR](#submitting-a-pr)
- [Commit Convention](#commit-convention)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

---

## Code of Conduct

This project follows the [Contributor Covenant v2.1](CODE_OF_CONDUCT.md). By participating, you agree to uphold a welcoming, respectful environment for everyone.

---

## Ways to Contribute

| Type | How |
|---|---|
| 🐾 Create a pet skin | Add sprites + `pet.json` to `pets-community/` |
| 🐛 Report a bug | Open a Bug Report issue |
| 💡 Suggest a feature | Open a Feature Request issue |
| 🌍 Translate the UI | Edit files in `src/i18n/` |
| 📖 Improve docs | Edit any `.md` file and submit a PR |
| 🧑‍💻 Fix bugs or build features | Check [good first issues](https://github.com/nucket/nekoai/labels/good%20first%20issue) |
| ⭐ Spread the word | Star the repo and share it |

---

## Development Setup

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20+ | https://nodejs.org |
| Rust | 1.75+ | https://rustup.rs |
| Tauri CLI | 2.x | `cargo install tauri-cli --version "^2.0"` |
| Python | 3.8+ | https://python.org (for sprite scripts) |

### First-time setup

```bash
git clone https://github.com/YOUR_USERNAME/nekoai.git
cd nekoai
npm install
pip install Pillow
npm run tauri dev
```

### Useful commands

```bash
npm run tauri dev          # Dev server with hot reload
npm run tauri build        # Production installer
npm run lint               # ESLint
npm run typecheck          # TypeScript check
npm run sprites:convert    # Convert .ico sprites to .png
cargo clippy               # Lint Rust code (from src-tauri/)
```

---

## Project Structure

```
nekoai/
├── src/                        # TypeScript/React frontend
│   ├── pets/PetRenderer.tsx    # Sprite animation engine
│   ├── ai/providers/           # Anthropic, OpenAI, Ollama adapters
│   ├── components/             # SpeechBubble, SettingsPanel
│   └── hooks/usePetMovement.ts # Movement state machine
├── src-tauri/src/              # Rust backend
│   ├── main.rs                 # App entry, tray icon
│   ├── window.rs               # Transparent always-on-top window
│   ├── desktop_monitor.rs      # OS window detection
│   └── storage.rs              # SQLite persistence
├── pets/classic-neko/          # Bundled default pet
├── pets-community/             # Community-contributed pets
└── scripts/convert-sprites.py  # Sprite conversion tool
```

---

## Creating a New Pet

### Folder structure

```
pets-community/
└── your-pet-name/
    ├── pet.json
    ├── sprites/
    │   ├── idle.png
    │   ├── walk_right1.png
    │   └── ...
    └── preview.gif    (optional but recommended)
```

### Steps

1. Create your folder under `pets-community/`
2. Add sprite PNG files to `sprites/` (see [Sprite Guidelines](#sprite-guidelines))
3. Write your `pet.json` (see [Pet Definition Format](#pet-definition-format))
4. Test locally by pointing `App.tsx` at your pet temporarily
5. Submit a PR

---

## Pet Definition Format

```json
{
  "name": "display name",
  "version": "1.0.0",
  "author": "your-github-username",
  "description": "one-line description",
  "personality": "human-readable personality",
  "system_prompt": "You are [name], a tiny [creature] on the user's desktop. Give 1-2 sentence answers. Never use markdown.",
  "spritesDir": "sprites",
  "animations": {
    "idle": { "files": ["idle.png"], "fps": 2, "loop": true },
    "walk_right": { "files": ["walk_r1.png", "walk_r2.png"], "fps": 8, "loop": true }
  },
  "triggers": {
    "on_cursor_near":    "animation_name",
    "on_chat_open":      "animation_name",
    "on_ai_thinking":    "animation_name",
    "on_idle_3min":      "animation_name",
    "on_idle_5min":      "animation_name",
    "on_idle_6min":      "animation_name",
    "on_movement_start": "animation_name"
  }
}
```

### Required animations

| Animation | Description | fps | Loop |
|---|---|---|---|
| `idle` | Default resting state | 2–4 | true |
| `walk_right` | Moving right | 8–12 | true |
| `walk_left` | Moving left | 8–12 | true |
| `sleep` | Sleeping | 2 | true |

### Optional animations

`walk_up`, `walk_down`, `walk_up_right`, `walk_up_left`, `walk_down_right`, `walk_down_left`, `awaken`, `yawn`, `falling_asleep`, `happy`, `thinking`, `wash`, `scratch_wall`

### System prompt tips

- Keep under 500 characters
- Instruct for short answers: "1-2 sentences max"
- Say "Never use markdown"
- Give the pet a distinct voice

---

## Sprite Guidelines

| Property | Requirement |
|---|---|
| Format | PNG with alpha channel (RGBA) |
| Frame size | 32×32 px native (displayed at 64×64 via 2× scale) |
| Background | Fully transparent (alpha = 0) |
| Naming | lowercase, snake_case, number suffix for sequences |

**Converting from ICO/BMP:**

```bash
python scripts/convert-sprites.py path/to/source path/to/sprites
```

**Naming examples:**

```
idle.png
walk_right1.png  walk_right2.png
sleep1.png       sleep2.png
```

---

## Submitting a PR

1. Fork the repo and create a branch: `git checkout -b feat/my-dragon-pet`
2. Make your changes
3. Run `npm run lint` and `npm run typecheck` — both must pass
4. Commit with [conventional commits](#commit-convention)
5. Open a PR against `main` and fill in the PR template

### PR checklist

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] App runs without console errors
- [ ] New pet: `pet.json` includes all required animations
- [ ] New pet: sprites are PNG with transparent background

---

## Commit Convention

```
<type>(<scope>): <short description>
```

| Type | Use for |
|---|---|
| `feat` | New feature or pet |
| `fix` | Bug fix |
| `chore` | Build, deps, tooling |
| `docs` | Documentation only |
| `refactor` | Refactor without behavior change |
| `perf` | Performance improvement |
| `test` | Tests |

Examples:
```
feat(pets): add fire dragon community pet
fix(renderer): correct frame timing at low fps
docs(contributing): add sprite conversion guide
```

---

## Reporting Bugs

Open a [Bug Report](https://github.com/nucket/nekoai/issues/new?template=bug_report.md) and include:

- OS and version
- NekoAI version (About menu)
- Steps to reproduce
- Expected vs actual behavior
- Console logs (right-click pet → Inspect → Console)

---

## Suggesting Features

Open a [Feature Request](https://github.com/nucket/nekoai/issues/new?template=feature_request.md). Search existing issues first — if yours exists, add a 👍 instead.

---

## Questions?

[GitHub Discussions](https://github.com/nucket/nekoai/discussions) — for questions, ideas, and general chat.

Thanks for helping make NekoAI better! 🐱
