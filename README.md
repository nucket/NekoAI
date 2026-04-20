<div align="center">

<img src="https://raw.githubusercontent.com/nucket/NekoAI/refs/heads/main/main/assets/logo.png" alt="NekoAI Logo" width="120" />

# 🐱 NekoAI

### The AI-powered desktop pet. Nostalgic soul, modern brain.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%202-blue?logo=tauri)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-1.75+-orange?logo=rust)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Stars](https://img.shields.io/github/stars/nucket/nekoai?style=social)](https://github.com/nucket/nekoai/stargazers)

<br/>

> *Remember Neko chasing your cursor? Or eSheep roaming your taskbar?*
> **NekoAI brings that magic back — but now your pet can actually talk, think, and help you.**

<br/>

**[🚀 Download](#-installation) · [📖 Docs](#-documentation) · [🎨 Create a pet](docs/creating-a-pet.md) · [💬 Community](#community)**

</div>

---

## ✨ What is NekoAI?

NekoAI is an **open-source, AI-powered desktop pet** that lives on your screen. It wanders around your windows, reacts to what you do, and when you need it — it thinks, answers, and helps, right there on your desktop.

It's a love letter to the 90s/00s desktop companions (Neko, eSheep, Shimeji) rebuilt with a modern stack and a real AI brain inside.

```
You:    "Hey Neko, explain this regex real quick"
Neko:   *walks over, pops a bubble*
        "That matches one or more digits at start of line. *purrs*"
```

---

## 🌟 Features

| Feature | Status |
|---|---|
| 🐱 Animated sprite pets that roam your desktop | ✅ |
| 🖱️ 8-direction cursor following & movement | ✅ |
| 💬 AI chat via animated speech bubble | ✅ |
| 🧠 Persistent memory — remembers your name, projects, preferences | ✅ |
| 🔌 Multi-provider AI (Claude, OpenAI, Gemini, Ollama local) | ✅ |
| 😴 Dynamic mood — energy changes with time of day & idle time | ✅ |
| 🎭 Multiple pets — Classic Neko, Ghost, Shiba (more via community) | ✅ |
| 🔔 Proactive nudges ("coding 90 min — take a break!") | ✅ |
| 🖥️ System tray — hide/show, switch pets, settings | ✅ |
| 📏 Adjustable pet size (S/M/L/XL) with pixel-perfect scaling | ✅ |
| 🖱️ Right-click context menu — quick settings & pet size adjustment | ✅ |
| 🌐 Cross-platform (Windows, macOS, Linux) | 🔜 Planned |
| 🧩 Plugin system for custom behaviors | 🔜 Planned |
| 🗣️ Voice interaction (TTS/STT) | 🔜 Planned |

---

## 🎬 How it works

```
┌──────────────────────────────────────────────────────┐
│                    Your Desktop                       │
│                                                       │
│   ┌──────────┐          ┌──────────────────────────┐  │
│   │  VSCode  │          │ "You've been coding 90   │  │
│   │          │          │  min. Stretch break? 🐾" │  │
│   └──────────┘    🐱←   └──────────────────────────┘  │
│                  ↑ roams, reacts to what you open     │
└──────────────────────────────────────────────────────┘
                          │
               Click pet or type to chat
                          │
                          ▼
              ┌─────────────────────┐
              │   AI Provider       │
              │  Claude / OpenAI    │
              │  / Ollama (local)   │
              └─────────────────────┘
                          │
              Response in animated speech bubble
              Facts extracted → saved to SQLite
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
cd nekoai/NekoAI

npm install
npm run tauri dev        # Development with hot reload
npm run tauri build      # Production build
```

---

## ⚙️ Configuration

**Right-click the pet** to open the context menu where you can:
- ⚙ **Settings** — configure AI provider, API key, model, and your name
- 🐾 **Select Pet** — switch between available pets
- 📏 **Size** — adjust pet size (S=32px, M=64px, L=96px, XL=128px) for pixel-perfect rendering

Configuration is auto-created on first run:

```toml
# ~/.config/nekoai/config.toml  (auto-created on first run)

provider = "anthropic"           # "anthropic" | "openai" | "ollama"
api_key  = "sk-ant-..."          # Stored locally, never sent anywhere
model    = "claude-haiku-4-5-20251001"
pet_size = 64                    # pixels (32, 64, 96, or 128)
```

> 🔒 **Privacy first**: NekoAI has no backend server. All data stays on your machine. The only outbound calls are the AI API calls *you* configure.

---

## 🧠 AI & Memory

NekoAI builds a persistent context for every conversation:

- **Pet personality** — defined per-pet in `pet.json` via `system_prompt`
- **User facts** — extracted automatically from conversations and stored in SQLite (`~/.local/share/nekoai/memory.db`). Includes name, current projects, preferred language, etc.
- **Conversation history** — last 20 messages sent as context on every turn
- **Dynamic mood** — pet's current energy/happiness/curiosity subtly influences its tone

```
System prompt = pet personality
             + known facts about user
             + current mood description
```

Facts are extracted with pattern matching after each exchange and saved to the `user_facts` SQLite table. You can inspect them directly:

```bash
sqlite3 ~/.local/share/nekoai/memory.db "SELECT * FROM user_facts;"
```

### Supported AI providers

| Provider | Models | Requires |
|---|---|---|
| **Anthropic** | Claude Haiku, Sonnet | API Key |
| **OpenAI** | GPT-4o mini, GPT-4o | API Key |
| **Google** | Gemini 1.5 Flash, Gemini 2.0 Flash... | API Key ([Google AI Studio](https://aistudio.google.com)) |
| **Ollama** | Llama 3, Mistral, Phi-3... | [Ollama](https://ollama.ai) running locally |

> 💡 **For full privacy**: Use Ollama — 100% local, no API costs, no data leaves your machine.

---

## 😴 Mood Engine

The pet's mood updates every 60 seconds based on:

| Signal | Effect |
|---|---|
| Time of day (6am–8pm) | Energy peaks at midday, drops at night |
| OS idle time | Energy drains gradually while inactive |
| Active app category | Curiosity rises when coding; relaxes otherwise |

Mood affects:
- **Animations** — yawns after 3 min idle, falls asleep after 5 min
- **AI tone** — sleepy pet gives shorter, quieter answers; curious pet asks follow-ups

---

## 🎭 Available Pets

| Pet | ID | Personality |
|---|---|---|
| 🐱 Classic Neko | `classic-neko` | Playful, curious, gives warm short answers |
| 👻 Ghost | `ghost-pixel` | Ethereal, gentle, slightly mysterious |
| 🐕 Shiba | `shiba-pixel` | Loyal, energetic, enthusiastic about everything |

Switch pets via right-click → Settings, or from the system tray menu.

Want to create your own? See [Creating a Pet](docs/creating-a-pet.md).

---

## 🏗️ Architecture

```
NekoAI/
├── src-tauri/                   # Rust backend (Tauri v2)
│   └── src/
│       ├── lib.rs               # App setup, tray, Tauri commands, resize_window
│       ├── desktop_monitor.rs   # Win32 APIs — active window, idle time
│       └── storage.rs           # SQLite: conversation history, user facts, config
│
├── src/                         # TypeScript / React frontend
│   ├── ai/
│   │   ├── index.ts             # Provider factory, system prompt builder
│   │   ├── memory.ts            # Fact extraction & persistence (SQLite IPC)
│   │   ├── types.ts             # AIProvider interface, Message type
│   │   └── providers/           # anthropic.ts · openai.ts · ollama.ts
│   ├── components/
│   │   ├── SpeechBubble.tsx     # Animated chat bubble with scramble text effect
│   │   ├── SettingsPanel.tsx    # Settings panel (API key, model, pet size)
│   │   ├── ContextMenu.tsx      # Right-click context menu (settings, pet, size)
│   │   └── PetSelector.tsx      # Pet picker with dynamic window resizing
│   ├── hooks/
│   │   ├── usePetMovement.ts    # 8-direction cursor tracking & rAF loop
│   │   ├── useMoodEngine.ts     # Energy/happiness/curiosity + animation overrides
│   │   ├── useDesktopContext.ts # Active window detection & app categorization
│   │   └── usePetAnimation.ts   # Sprite frame ticker
│   ├── pets/
│   │   ├── PetRenderer.tsx      # Renders frame-by-frame sprite animations
│   │   ├── PetBrain.ts          # Behavioral state machine (coding alert, sleep)
│   │   └── loader.ts            # pet.json validation & loading
│   └── store/
│       ├── index.ts             # Zustand store (mood, active pet, animation)
│       └── configStore.ts       # AI config & pet size persisted via Tauri commands
│
└── pets/                        # Pet definitions (bundled with app)
    ├── manifest.json            # Registry of all available pets
    ├── classic-neko/            # 🐱 pet.json + sprites/
    ├── ghost-pixel/             # 👻 pet.json + sprites/ (add sprite PNGs)
    └── shiba-pixel/             # 🐕 pet.json + sprites/ (add sprite PNGs)
```

### Window Resizing on Windows

NekoAI uses a Tauri command (`resize_window`) to bypass OS-level restrictions when the window has `resizable: false` in its configuration. This is necessary because:

- **Why `resizable: false`?** — Creates a truly frameless window (no title bar, borders, or resize handles)
- **The problem:** The Windows API removes the `WS_THICKFRAME` window style when a window is created as non-resizable, and JavaScript APIs cannot restore it at runtime
- **The solution:** A Rust-side command calls `window.set_size()` directly, completely bypassing the JS API limitation

This allows the speech bubble, settings panel, pet selector, and context menu to dynamically expand/collapse without the user seeing the resize handles.

### Pixel-Perfect Sprite Scaling

All pet sizes are integer multiples of the native 32px sprite:
- **S** = 32px (1×)
- **M** = 64px (2×)
- **L** = 96px (3×)
- **XL** = 128px (4×)

This ensures crisp, pixelated rendering without anti-aliasing artifacts. Non-integer scales (like 48px = 1.5×) cause uneven pixel mapping and visible borders. CSS sizes are injected dynamically via inline styles in `App.tsx`, not hardcoded in `App.css`.

---

## 🤝 Contributing

NekoAI is community-first. Ways to contribute:

- 🐾 **Create a new pet** — see [Creating a Pet](docs/creating-a-pet.md)
- 🐛 **Report bugs** — open a detailed Issue
- 💡 **Suggest features** — Discussions tab
- 🧑‍💻 **Code** — check [good first issues](https://github.com/nucket/nekoai/labels/good%20first%20issue)

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting.

---

## 🗺️ Roadmap

| Version | Focus |
|---|---|
| **v0.1** ✅ | Core: transparent window, Neko sprite, cursor tracking, AI chat |
| **v0.2** ✅ | Persistent memory, dynamic mood engine, multiple pets |
| **v0.3** 🚧 | Accessories/skins system, sound effects, sprite scale slider |
| **v0.4** 🔜 | Community pet gallery in-app, mini-games |
| **v1.0** 🔜 | Cross-platform stable release, plugin API, voice support |

---

## 🙏 Inspiration & Credits

This project is a love letter to:

- **[Neko](https://en.wikipedia.org/wiki/Neko_(software))** — the original X11 cat, 1989
- **[eSheep](https://github.com/Adrianotiger/desktopPet)** — the Windows XP classic
- **[Shimeji](https://kilkakon.com/shimeji/)** — the Japanese desktop mascot framework
- **[Tauri](https://tauri.app)** — for making lightweight native desktop apps possible

---

## 📄 License

MIT © 2026 [Naudy Castellanos](https://github.com/nucket)

Free to use, modify, and distribute. Attribution appreciated.

---

<div align="center">

**If NekoAI made you smile, give it a ⭐ — it helps a lot!**

*Made with ☕ and deep nostalgia for Windows XP — by [Naudy Castellanos](https://github.com/nucket)*

</div>
