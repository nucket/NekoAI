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
- [Adding a Language](#adding-a-language)
- [Submitting a PR](#submitting-a-pr)
- [Commit Convention](#commit-convention)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

---

## Code of Conduct

This project follows the [Contributor Covenant v2.1](CODE_OF_CONDUCT.md). By participating, you agree to uphold a welcoming, respectful environment for everyone.

---

## Ways to Contribute

| Type                          | How                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 🐾 Create a pet               | Add a folder to `pets/` and an entry to `pets/manifest.json` (see [Creating a New Pet](#creating-a-new-pet)) |
| 🐛 Report a bug               | Open a Bug Report issue                                                                                      |
| 💡 Suggest a feature          | Open a Feature Request issue                                                                                 |
| 🌍 Translate the UI           | Copy `src/i18n/en.ts` to a new locale (see [Adding a language](#adding-a-language))                          |
| 📖 Improve docs               | Edit any `.md` file and submit a PR                                                                          |
| 🧑‍💻 Fix bugs or build features | Check [good first issues](https://github.com/nucket/nekoai/labels/good%20first%20issue)                      |
| ⭐ Spread the word            | Star the repo and share it                                                                                   |

---

## Development Setup

### Prerequisites

| Tool      | Version | Install                                        |
| --------- | ------- | ---------------------------------------------- |
| Node.js   | 22+     | https://nodejs.org (pnpm 11 requires ≥ v22.13) |
| pnpm      | 11+     | `npm install -g pnpm` or via Corepack          |
| Rust      | 1.90+   | https://rustup.rs                              |
| Tauri CLI | 2.x     | `cargo install tauri-cli --version "^2.0"`     |
| Python    | 3.8+    | https://python.org (for sprite scripts)        |

### First-time setup

```bash
git clone https://github.com/YOUR_USERNAME/nekoai.git
cd nekoai
pnpm install
pip install Pillow
pnpm tauri dev
```

### Useful commands

```bash
pnpm tauri dev             # Dev server with hot reload
pnpm tauri build           # Production installer
pnpm lint                  # ESLint (zero warnings allowed)
pnpm typecheck             # TypeScript type check (tsc --noEmit)
pnpm test                  # Vitest unit tests
pnpm pets:validate         # Check every pet in pets/manifest.json (fields, sprites, triggers)
pnpm format                # Prettier write
pnpm format:check          # Prettier check
pnpm sprites:convert       # Convert .ico sprites to .png
cargo clippy               # Lint Rust code (from src-tauri/)
cargo test                 # Rust unit tests (from src-tauri/)
```

---

## Project Structure

```
nekoai/
├── src/                        # TypeScript/React frontend
│   ├── App.tsx                 # Main pet window — wires the hooks together
│   ├── pets/                   # PetRenderer (sprite engine), resolveAnimation, triggers
│   ├── ai/                     # ai_chat wrapper, prompt builder, memory, errors
│   ├── components/             # SpeechBubble, SettingsPanel, PetSelector
│   ├── hooks/                  # usePetMovement, useChat, useMoodEngine, … (one concern each)
│   ├── i18n/                   # UI strings (en.ts is the source; one file per language)
│   └── store/                  # Zustand stores (app state, settings)
├── src-tauri/src/              # Rust backend
│   ├── lib.rs                  # App setup, tray, Tauri commands
│   ├── ai.rs                   # All AI provider HTTP calls (behind ai_chat)
│   ├── storage.rs              # config.toml + SQLite persistence
│   ├── secrets.rs              # API key in the OS credential store
│   ├── updater.rs              # In-app updates (check_for_update / install_update)
│   ├── desktop_monitor.rs      # OS window detection, idle time, session type
│   ├── cursor_tracker.rs       # Wayland cursor fallback (evdev /dev/input reader)
│   └── main.rs                 # App entry (calls lib::run())
├── pets/                       # Every pet the app ships, listed in pets/manifest.json
├── schemas/pet.schema.json     # pet.json schema (used by pets:validate)
└── scripts/                    # Sprite conversion, pet validation, version bump, portable build
```

---

## Creating a New Pet

Every pet the app ships lives in `pets/` and is listed in `pets/manifest.json` — the pet selector and the tray menu both read that file, so a new pet needs no code changes. [docs/creating-a-pet.md](docs/creating-a-pet.md) is the full guide.

### Folder structure

```
pets/
└── your-pet-name/      ← the folder name is the pet's ID (kebab-case, unique)
    ├── pet.json
    ├── sprites/
    │   ├── idle.png
    │   ├── walk_right1.png
    │   └── ...
    └── README.md       ← description, credits, sprite license
```

### Steps

1. Create your folder under `pets/`
2. Add sprite PNG files to `sprites/` (see [Sprite Guidelines](#sprite-guidelines))
3. Write your `pet.json` (see [Pet Definition Format](#pet-definition-format))
4. Add an entry for it to `pets/manifest.json`
5. Run `pnpm pets:validate`, then `pnpm tauri dev` and pick your pet from the selector
6. Open a PR with a screenshot or GIF of the pet in action

Only submit sprites you made yourself or that are under a license allowing redistribution, and no characters that belong to someone else (trademarked or copyrighted characters are not accepted).

---

## Pet Definition Format

```json
{
  "name": "display name",
  "version": "1.0.0",
  "author": "your-github-username",
  "description": "one-line description",
  "personality": "human-readable personality",
  "system_prompt": "You are [name], a tiny [creature] on the user's desktop. [Voice, quirks, catchphrases.]",
  "spritesDir": "sprites",
  "animations": {
    "idle": { "files": ["idle.png"], "fps": 2, "loop": true },
    "walk_right": { "files": ["walk_r1.png", "walk_r2.png"], "fps": 8, "loop": true }
  },
  "triggers": {
    "on_cursor_near": "animation_name",
    "on_chat_open": "animation_name",
    "on_ai_thinking": "animation_name",
    "on_ai_response": "animation_name",
    "on_idle_3min": "animation_name",
    "on_idle_5min": "animation_name",
    "on_idle_6min": "animation_name",
    "on_movement_start": "animation_name",
    "on_happy": "animation_name",
    "on_surprised": "animation_name",
    "on_eating": "animation_name"
  }
}
```

### Required animations

| Animation    | Description           | fps  | Loop |
| ------------ | --------------------- | ---- | ---- |
| `idle`       | Default resting state | 2–4  | true |
| `walk_right` | Moving right          | 8–12 | true |
| `walk_left`  | Moving left           | 8–12 | true |
| `sleep`      | Sleeping              | 2    | true |

### Optional animations

`walk_up`, `walk_down`, `walk_up_right`, `walk_up_left`, `walk_down_right`, `walk_down_left`, `awaken`, `yawn`, `falling_asleep`, `happy`, `thinking`, `wash`, `scratch_wall`

### System prompt tips

- Keep under 500 characters
- Describe who the pet _is_ — voice, quirks, catchphrases
- Leave reply length and formatting out: the app adds them from **Settings → Response length**

---

## Sprite Guidelines

| Property   | Requirement                                        |
| ---------- | -------------------------------------------------- |
| Format     | PNG with alpha channel (RGBA)                      |
| Frame size | 32×32 px (shown at 32–128 px by integer scaling)   |
| Background | Fully transparent (alpha = 0)                      |
| Naming     | lowercase, snake_case, number suffix for sequences |

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

## Adding a Language

UI strings live in `src/i18n/`. `en.ts` is the source dictionary; each other language is one file with the same keys.

1. Copy `src/i18n/es.ts` to `src/i18n/<code>.ts` (e.g. `fr.ts`) and translate every value. Keep the `{placeholders}` and emoji as they are. TypeScript reports any missing key.
2. In `src/i18n/index.ts`, add the code to `Locale` and `LOCALES`, its name (written in that language) to `LOCALE_NAMES`, and the dictionary to `DICTIONARIES`.
3. Add the tray menu labels to `tray_labels()` in `src-tauri/src/lib.rs`.
4. Run `pnpm test`: `src/i18n/i18n.test.ts` checks that every key is translated with the same placeholders.

In components use `const t = useT()`; outside React (error messages, onboarding text) import `t` from `src/i18n`. Never hard-code user-facing text.

---

## Submitting a PR

1. Fork the repo and create a branch: `git checkout -b feat/my-dragon-pet`
2. Make your changes
3. Run `pnpm lint`, `pnpm typecheck` and `pnpm test` — all must pass
4. Commit with [conventional commits](#commit-convention)
5. Open a PR against `main` and fill in the PR template

### PR checklist

- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] App runs without console errors
- [ ] New pet: listed in `pets/manifest.json` and `pnpm pets:validate` passes
- [ ] New pet: sprites are PNG with transparent background, with credits and license in its `README.md`

---

## Commit Convention

```
<type>(<scope>): <short description>
```

| Type       | Use for                          |
| ---------- | -------------------------------- |
| `feat`     | New feature or pet               |
| `fix`      | Bug fix                          |
| `chore`    | Build, deps, tooling             |
| `docs`     | Documentation only               |
| `refactor` | Refactor without behavior change |
| `perf`     | Performance improvement          |
| `test`     | Tests                            |

Examples:

```
feat(pets): add fire dragon community pet
fix(renderer): correct frame timing at low fps
docs(contributing): add sprite conversion guide
```

---

## Code Style Guide

### TypeScript / React

The project uses ESLint (`eslint.config.js`) with `@eslint/js`, `typescript-eslint`, and `prettier`. Prettier is enforced on all `.ts`, `.tsx`, `.json`, `.css`, and `.md` files via lint-staged.

| Rule             | Convention                                                                 |
| ---------------- | -------------------------------------------------------------------------- |
| Component names  | PascalCase — `PetRenderer`, `SpeechBubble`                                 |
| Hook names       | camelCase prefixed `use` — `usePetMovement`, `useMoodEngine`               |
| File names       | Match the exported symbol exactly — `PetRenderer.tsx`, `usePetMovement.ts` |
| Object shapes    | `interface` preferred over `type`                                          |
| Unions / aliases | `type`                                                                     |
| Default exports  | Components only; utilities use named exports                               |
| Unused vars      | Error — prefix intentionally unused params with `_`                        |
| `any`            | Forbidden — use proper types or `unknown`                                  |

Run `pnpm lint` (zero warnings allowed) and `pnpm format:check` before submitting.

### Rust

| Rule           | Convention                                                                                |
| -------------- | ----------------------------------------------------------------------------------------- |
| Linting        | `cargo clippy` — all warnings are errors in CI                                            |
| Tauri commands | In `lib.rs`, or in their feature's module (e.g. `updater.rs`), and registered in `lib.rs` |
| Error returns  | Use `.map_err(\|e\| e.to_string())` — Tauri serializes these to JS                        |

Run `cargo clippy` from the `src-tauri/` directory before submitting any Rust changes.

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
