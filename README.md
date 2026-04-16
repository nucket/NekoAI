<div align="center">

<img src="https://raw.githubusercontent.com/nucket/nekoai/main/assets/logo.png" alt="NekoAI Logo" width="120" />

# 🐱 NekoAI

### The AI-powered desktop pet. Nostalgic soul, modern brain.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%202-blue?logo=tauri)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-1.75+-orange?logo=rust)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Stars](https://img.shields.io/github/stars/nucket/nekoai?style=social)](https://github.com/nucket/nekoai/stargazers)
[![Discord](https://img.shields.io/discord/000000000?label=Discord&logo=discord&color=7289da)](https://discord.gg/yourinvite)

<br/>

> *Remember Neko chasing your cursor? Or eSheep roaming your taskbar?*
> **NekoAI brings that magic back — but now your pet can actually talk, think, and help you.**

<br/>

**[🚀 Download](#-installation) · [📖 Docs](#-documentation) · [🎨 Add your own pet](#-create-your-own-pet) · [💬 Discord](#community)**

<br/>

![NekoAI Demo](https://raw.githubusercontent.com/nucket/nekoai/main/assets/demo.gif)

</div>

---

## ✨ What is NekoAI?

NekoAI is an **open-source, AI-powered desktop pet** that lives on your screen. It wanders around your windows, reacts to what you do, and when you need it — it thinks, answers, and helps, right there on your desktop.

It's a love letter to the 90s/00s desktop companions (Neko, eSheep, Shimeji, Tamagotchi PC) rebuilt with a modern stack and a real AI brain inside.

```
You:    "Hey Neko, what's the weather in Lisbon?"
Neko:   *walks to corner of screen, pops a bubble* "☀️ 24°C and sunny! Perfect for a walk."
```

---

## 🌟 Features

| Feature | Status |
|---|---|
| 🐱 Animated sprite pets that roam your desktop | ✅ Ready |
| 🖱️ Cursor following & window-aware movement | ✅ Ready |
| 💬 AI chat via tooltip/bubble (click to talk) | ✅ Ready |
| 🧠 Persistent memory (remembers your name, habits) | ✅ Ready |
| 🔌 Multi-provider AI (Claude, OpenAI, Ollama local) | ✅ Ready |
| 🎨 Community pet skins & sprite packs | 🚧 In Progress |
| 🔔 Proactive nudges ("You've been coding 2h, take a break!") | 🚧 In Progress |
| 🌐 Cross-platform (Windows, macOS, Linux) | 🔜 Planned |
| 🧩 Plugin system for custom behaviors | 🔜 Planned |
| 🗣️ Voice interaction (TTS/STT) | 🔜 Planned |

---

## 🎬 How it works

```
┌─────────────────────────────────────────────────────┐
│                    Your Desktop                      │
│                                                      │
│   ┌──────────┐          ┌─────────────────────┐     │
│   │  VSCode  │          │  "You've been at it  │     │
│   │          │          │   for 2 hours. Want  │     │
│   └──────────┘    🐱←   │   a quick stretch?"  │     │
│                          └─────────────────────┘     │
│                  ↑ walks around, reacts to windows   │
└─────────────────────────────────────────────────────┘
                          │
               Click or type to NekoAI
                          │
                          ▼
              ┌─────────────────────┐
              │   AI Provider       │
              │  ┌───────────────┐  │
              │  │ Claude (API)  │  │
              │  │ OpenAI (API)  │  │
              │  │ Ollama (local)│  │
              │  └───────────────┘  │
              └─────────────────────┘
                          │
                    Response rendered
                  in animated speech bubble
```

---

## 🚀 Installation

### Option A — Download the installer *(easiest)*

Go to [Releases](https://github.com/nucket/nekoai/releases) and grab the latest installer for your OS.

| Platform | File |
|---|---|
| Windows | `NekoAI_x.x.x_x64.msi` |
| macOS | `NekoAI_x.x.x_aarch64.dmg` |
| Linux | `NekoAI_x.x.x_amd64.AppImage` |

### Option B — Build from source

```bash
# Prerequisites: Node.js 20+, Rust 1.75+, Tauri CLI
git clone https://github.com/nucket/nekoai.git
cd nekoai

npm install
npm run tauri dev        # Development
npm run tauri build      # Production build
```

---

## ⚙️ Configuration

On first launch, NekoAI opens a small settings panel. You only need to add **your own API key** — your key never leaves your device.

```toml
# ~/.config/nekoai/config.toml

[ai]
provider = "anthropic"          # "anthropic" | "openai" | "ollama"
api_key  = "sk-ant-..."         # Stored locally, never sent to NekoAI servers
model    = "claude-haiku-4-5"   # Fastest & cheapest for chat

[pet]
name     = "Neko"
skin     = "classic-neko"       # Folder name inside /pets

[behavior]
follow_cursor     = true
react_to_windows  = true
proactive_nudges  = true
nudge_interval    = 90          # minutes
```

> 🔒 **Privacy first**: NekoAI has no backend. All data stays on your machine. The only network calls are the ones *you* configure to AI providers.

---

## 🎨 Create your own pet

NekoAI uses a simple, open **Pet Definition Format** so anyone can create and share pets.

### File structure

```
pets/
└── my-dragon/
    ├── pet.json          ← Metadata & personality
    ├── spritesheet.png   ← All animation frames
    ├── sprites.json      ← Frame coordinates & animation sequences
    └── sounds/           ← Optional .ogg sound effects
        └── happy.ogg
```

### `pet.json` example

```json
{
  "name": "Ember",
  "version": "1.0.0",
  "author": "yourname",
  "description": "A tiny fire dragon who loves dark mode",
  "personality": "Ember is snarky, warm-hearted, and obsessed with coffee.",
  "system_prompt": "You are Ember, a tiny fire dragon living on the user's desktop. You are witty, slightly dramatic, and give short punchy answers. Use 1-2 sentences max unless asked for more.",
  "animations": {
    "idle":      { "frames": [0, 1, 2, 3], "fps": 8, "loop": true },
    "walk":      { "frames": [4, 5, 6, 7], "fps": 12, "loop": true },
    "happy":     { "frames": [8, 9, 10],   "fps": 10, "loop": false },
    "thinking":  { "frames": [11, 12, 13], "fps": 6,  "loop": true },
    "sleep":     { "frames": [14, 15],     "fps": 4,  "loop": true }
  },
  "triggers": {
    "on_cursor_near":   "walk",
    "on_chat_open":     "happy",
    "on_ai_thinking":   "thinking",
    "on_idle_5min":     "sleep"
  }
}
```

### Share your pet

Submit a PR adding your pet folder to `/pets-community/` and it'll be listed in the in-app gallery! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 🧠 AI Integration

NekoAI supports multiple AI backends. Each conversation includes:

- **System prompt** from the pet's `pet.json` (personality)
- **User context** (optional): time of day, active app, idle duration
- **Conversation history**: last N messages for continuity
- **User memory**: persistent facts about the user stored in local SQLite

```typescript
// src/ai/providers/anthropic.ts — simplified
const response = await anthropic.messages.create({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 256,
  system: pet.system_prompt + buildContextBlock(userContext),
  messages: conversationHistory,
});
```

### Supported providers

| Provider | Models | Requires |
|---|---|---|
| **Anthropic** | Claude Haiku, Sonnet | API Key |
| **OpenAI** | GPT-4o mini, GPT-4o | API Key |
| **Ollama** | Llama 3, Mistral, Phi-3... | [Ollama](https://ollama.ai) running locally |

> 💡 **Tip for privacy lovers**: Use Ollama for a 100% local, offline-capable pet with no API costs.

---

## 🏗️ Architecture

```
nekoai/
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── main.rs             # App entry, tray icon, window setup
│   │   ├── window.rs           # Transparent always-on-top window logic
│   │   ├── desktop_monitor.rs  # Win32/macOS APIs — active window detection
│   │   └── storage.rs          # SQLite: memory, config, history
│   └── tauri.conf.json
│
├── src/                        # TypeScript/React frontend
│   ├── pets/                   # Pet engine
│   │   ├── PetRenderer.tsx     # Sprite animation engine
│   │   ├── PetBrain.ts         # Behavior state machine
│   │   └── loader.ts           # Load pet definitions from disk
│   ├── ai/
│   │   ├── providers/          # Anthropic, OpenAI, Ollama adapters
│   │   └── context-builder.ts  # Builds rich context for AI calls
│   ├── components/
│   │   ├── SpeechBubble.tsx    # Animated tooltip/chat UI
│   │   └── SettingsPanel.tsx
│   └── hooks/
│       └── usePetMovement.ts   # Cursor tracking, window avoidance
│
├── pets/                       # Bundled default pets
│   ├── classic-neko/
│   └── pixel-sheep/
│
├── pets-community/             # Community-contributed pets (via PR)
│
└── .github/
    ├── CONTRIBUTING.md
    ├── CODE_OF_CONDUCT.md
    └── workflows/
        ├── ci.yml              # Test & lint on PR
        └── release.yml         # Auto-build installers on tag
```

---

## 🤝 Contributing

NekoAI is **community-first**. There are many ways to contribute:

- 🐾 **Create a new pet** — sprites + `pet.json` + PR
- 🐛 **Report bugs** — open a detailed Issue
- 💡 **Suggest features** — Discussions tab
- 🌍 **Translate** the UI to your language
- 🧑‍💻 **Code** — check [good first issues](https://github.com/nucket/nekoai/labels/good%20first%20issue)

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting. We follow the [Contributor Covenant](CODE_OF_CONDUCT.md).

---

## 🗺️ Roadmap

- **v0.1** — Core: transparent window, Neko-style sprite, cursor tracking
- **v0.2** — AI chat: speech bubble, Anthropic/OpenAI/Ollama integration
- **v0.3** — Desktop awareness: react to open windows, app detection
- **v0.4** — Memory system: SQLite, persistent user context
- **v0.5** — Community pet gallery in-app
- **v1.0** — Cross-platform stable release, plugin API, voice support

---

## 💬 Community

- 🐦 **X/Twitter**: [@nekoai_app](https://twitter.com/nekoai_app)
- 💬 **Discord**: [discord.gg/yourinvite](https://discord.gg/yourinvite)
- 🐙 **GitHub Discussions**: [Ask anything](https://github.com/nucket/nekoai/discussions)

---

## 🙏 Inspiration & Credits

This project is a love letter to:

- **[Neko](https://en.wikipedia.org/wiki/Neko_(software))** — the original X11 cat, 1989
- **[eSheep](https://github.com/Adrianotiger/desktopPet)** — the Windows XP classic
- **[Shimeji](https://kilkakon.com/shimeji/)** — the Japanese desktop mascot framework
- **[Tauri](https://tauri.app)** — for making lightweight desktop apps possible

---

## 📄 License

MIT © 2026 [Naudy Castellanos](https://github.com/nucket)

Free to use, modify, and distribute. Attribution appreciated. ❤️

---

<div align="center">

**If NekoAI made you smile, consider giving it a ⭐ — it helps a lot!**

*Made with ☕ and a deep nostalgia for Windows XP — by [Naudy Castellanos](https://github.com/nucket)*

</div>
