<div align="center">

<img src="https://raw.githubusercontent.com/nucket/NekoAI/refs/heads/main/main/assets/GH-hero.png" alt="NekoAI Banner" width="100%" />

<img src="https://raw.githubusercontent.com/nucket/NekoAI/refs/heads/main/main/assets/logo.png" alt="NekoAI Logo" width="120" />

# NekoAI

### The AI-powered desktop pet. Nostalgic soul, modern brain.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%202-blue?logo=tauri)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-1.75+-orange?logo=rust)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Stars](https://img.shields.io/github/stars/nucket/nekoai?style=social)](https://github.com/nucket/nekoai/stargazers)
[![Discord](https://img.shields.io/badge/Discord-Join%20us-5865F2?logo=discord&logoColor=white)](https://discord.gg/d7pykbNz)

<br/>

> _Remember Neko chasing your cursor? Or eSheep roaming your taskbar?_
> **NekoAI brings that magic back — but now your pet can actually talk, think, and help you.**

<br/>

**[🌐 nekoai.dev](https://nekoai.dev/) · [🚀 Download](#-installation) · [🎬 Showcase](docs/showcase.md) · [📖 Docs](#-documentation) · [🎨 Create a pet](docs/creating-a-pet.md) · [💬 Community](#community)**

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

## 🎬 See it in action

<div align="center">

<img src="https://raw.githubusercontent.com/nucket/NekoAI/refs/heads/main/main/assets/showcase/windows/onboarding-ollama.gif" alt="NekoAI onboarding on Windows with Ollama" width="80%" />

_Zero-config onboarding on Windows — NekoAI auto-detects Ollama and walks you in._

</div>

<table>
  <tr>
    <th align="center">Windows</th>
    <th align="center">MacOS</th>
    <th align="center">Linux</th>
  </tr>
  <tr>
    <td><img src="https://raw.githubusercontent.com/nucket/NekoAI/refs/heads/main/main/assets/showcase/windows/chat.gif" alt="Chat on Windows" /></td>
    <td><img src="https://raw.githubusercontent.com/nucket/NekoAI/refs/heads/main/main/assets/showcase/macos/overview.gif" alt="NekoAI on macOS" /></td>
    <td><img src="https://raw.githubusercontent.com/nucket/NekoAI/refs/heads/main/main/assets/showcase/ubuntu/overview.gif" alt="NekoAI on Ubuntu" /></td>
  </tr>
</table>

> 🎞️ **Full gallery** — onboarding, chat, pet selection, sizes and settings across Windows, macOS, Ubuntu and Fedora: see **[docs/showcase.md](docs/showcase.md)**.

---

## 🌟 Features

| Feature                                                                          | Status     |
| -------------------------------------------------------------------------------- | ---------- |
| 🐱 Animated sprite pets that roam your desktop                                   | ✅         |
| 🖱️ 8-direction cursor following & movement                                       | ✅         |
| 💬 AI chat via animated speech bubble                                            | ✅         |
| 🧠 Persistent memory — remembers your name, projects, preferences                | ✅         |
| 🔌 Multi-provider AI (Claude, OpenAI, Gemini, NVIDIA NIM, Ollama local)          | ✅         |
| 😴 Dynamic mood — energy changes with time of day & idle time                    | ✅         |
| 🎭 Multiple pets — Classic Neko, Pingu, Pac-Man, BSD Daemon, Tabby, TIE Fighter  | ✅         |
| 🏠 Pet house — spawn point at bottom-right corner, click to bring pet home       | ✅         |
| 🔔 Proactive nudges ("coding 90 min — take a break!")                            | ✅         |
| 🖥️ System tray — hide/show, switch pets, settings                                | ✅         |
| 📏 Adjustable pet size (S/M/L/XL) with pixel-perfect scaling                     | ✅         |
| 🖱️ Right-click context menu — quick settings & pet size adjustment               | ✅         |
| 💬 Tunable AI response length — S / M / L (256 / 512 / 1024 tokens)              | ✅         |
| 🪄 Zero-config onboarding — auto-detects Ollama; walks pet out from house corner | ✅         |
| 📊 NekoMetrics — anonymous keystroke / mouse / pet-step counters in a tooltip    | 🔜 v0.4    |
| 🥁 BongoCat-style reactive paw animations driven by keystrokes                   | 🔜 v0.4    |
| 📅 Daily/weekly/monthly activity history & GitHub-style heatmap                  | 🔜 v0.4    |
| 📷 NekoCapture — screenshots with username/date/app/comment footer               | 🔜 v0.6    |
| 🖼️ Customizable screenshot borders (color, thickness, rounded corners, shadow)   | 🔜 v0.6    |
| ✏️ NekoAnnotate — full-screen drawing overlay (pen, shapes, arrows, text)        | 🔜 v0.7    |
| 🌐 Cross-platform (Windows, macOS, Linux)                                        | 🔜 Planned |
| 🧩 Plugin system for custom behaviors                                            | 🔜 Planned |
| 🗣️ Voice interaction (TTS/STT)                                                   | 🔜 Planned |

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
              │  Claude / OpenAI /  │
              │  Gemini / NVIDIA /  │
              │  Ollama (local)     │
              └─────────────────────┘
                          │
              Response in animated speech bubble
              Facts extracted → saved to SQLite
```

---

## 🚀 Installation

### Option A — Download the installer _(easiest)_

Go to [Releases](https://github.com/nucket/nekoai/releases) and grab the latest installer for your OS.

| Platform | File                          |
| -------- | ----------------------------- |
| Windows  | `NekoAI_x.x.x_x64.msi`        |
| macOS    | `NekoAI_x.x.x_aarch64.dmg`    |
| Linux    | `NekoAI_x.x.x_amd64.AppImage` |

> **Linux note:** The `.AppImage` needs no installation — `chmod +x` it and run it
> directly. If you prefer the `.deb`, install it from a terminal with
> `sudo apt install ./nekoai_x.x.x_amd64.deb` — GNOME Software / the Ubuntu
> Software Center cannot reliably install local `.deb` files and may fail with a
> generic error.
>
> **Wayland & cursor following:** On a Wayland session (the default on Fedora,
> recent Ubuntu and others) NekoAI runs through XWayland and cannot read the
> global cursor position directly. To let the pet follow your mouse it reads raw
> motion from `/dev/input`, which requires your user to be in the `input` group:
>
> ```bash
> sudo usermod -aG input $USER   # then log out and back in
> ```
>
> Without this NekoAI still runs — it switches to **wanderer mode** and roams on
> its own, and tells you so once. Xorg sessions need no setup. See
> [Cursor Tracking on Wayland](#cursor-tracking-on-wayland-linux) for the details.

### Option B — Build from source

```bash
# Prerequisites: Node.js 22+, pnpm 11+, Rust 1.75+, Tauri CLI
git clone https://github.com/nucket/nekoai.git
cd nekoai/NekoAI

pnpm install
pnpm tauri dev           # Development with hot reload
pnpm tauri build         # Production build
```

---

## ⚙️ Configuration

**Right-click the pet** to open the context menu where you can:

- ⚙ **Settings** — configure AI provider, API key, model, response length, and your name
- 🐾 **Select Pet** — switch between available pets
- 📏 **Size** — adjust pet size (S=32px, M=64px, L=96px, XL=128px) for pixel-perfect rendering
- 💬 **Response length** — pick **S / M / L** (256 / 512 / 1024 tokens). Medium is the default and covers most replies; pick Short for snappy answers on local Ollama, Long for detailed technical explanations.

Configuration is auto-created on first run:

```toml
# ~/.config/nekoai/config.toml  (auto-created on first run)

provider   = "gemini"            # "anthropic" | "openai" | "gemini" | "nvidia" | "ollama"
api_key    = "AIza..."           # Stored locally, never sent anywhere
model      = "gemini-2.5-flash"
pet_size   = 64                  # pixels (32, 64, 96, or 128)
max_tokens = 512                 # 256 (Short) | 512 (Medium, default) | 1024 (Long)
```

> 🪄 **New user?** NekoAI auto-detects a running Ollama instance and configures itself on first launch — no settings required. Otherwise it guides you to set up your preferred provider.

> 🔒 **Privacy first**: NekoAI has no backend server. All data stays on your machine. The only outbound calls are the AI API calls _you_ configure.

---

## 🧠 AI & Memory

NekoAI builds a persistent context for every conversation:

- **Pet personality** — defined per-pet in `pet.json` via `system_prompt`
- **User facts** — extracted automatically from conversations and stored in SQLite (`~/.local/share/nekoai/memory.db`). Includes name, current projects, preferred language, etc.
- **Conversation history** — last 20 messages sent as context on every turn; the speech bubble also shows your recent turns when reopened, so the pet never looks like it forgot
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

| Provider       | Models                                     | Requires                                                                        |
| -------------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| **Anthropic**  | Claude Haiku, Sonnet                       | API Key                                                                         |
| **OpenAI**     | GPT-4o mini, GPT-4o                        | API Key                                                                         |
| **Google**     | Gemini 2.5 Flash _(default)_, 2.0 Flash... | Free API Key ([Google AI Studio](https://aistudio.google.com)) — no credit card |
| **NVIDIA NIM** | Llama 3.1, Mistral, Nemotron, MiniMax...   | API Key ([build.nvidia.com](https://build.nvidia.com)) — free tier available    |
| **Ollama**     | Llama 3, Mistral, Phi-3...                 | [Ollama](https://ollama.ai) running locally                                     |

> 💡 **For full privacy**: Use Ollama — 100% local, no API costs, no data leaves your machine.
> 🟢 **Free models**: NVIDIA NIM offers a generous free tier with 40+ open-source models at [build.nvidia.com](https://build.nvidia.com).

---

## 😴 Mood Engine

The pet's mood updates every 60 seconds based on:

| Signal                | Effect                                         |
| --------------------- | ---------------------------------------------- |
| Time of day (6am–8pm) | Energy peaks at midday, drops at night         |
| OS idle time          | Energy drains gradually while inactive         |
| Active app category   | Curiosity rises when coding; relaxes otherwise |

Mood affects:

- **Animations** — yawns after 3 min idle, falls asleep after 5 min
- **AI tone** — sleepy pet gives shorter, quieter answers; curious pet asks follow-ups

---

## 🎭 Available Pets

| Pet             | ID              | Personality                                                         |
| --------------- | --------------- | ------------------------------------------------------------------- |
| 🐱 Classic Neko | `classic-neko`  | Playful, curious — short bursts, occasional nya~                    |
| 🐧 Pingu        | `penguin-pixel` | Cheerful and clumsy, bounces back from every stumble                |
| 🟡 Pac-Man      | `pac-man`       | Always hungry, obsessed with dots — very short waka-waka replies    |
| 😈 BSD Daemon   | `bsd-daemon`    | Wry Unix sysadmin — terse, accurate, mildly smug about BSD          |
| 🐈 Tabby        | `tabby`         | Dignified and old-school — the original X11 cat, calm and unhurried |
| 🚀 TIE Fighter  | `tie-fighter`   | Imperial officer — formal, brief, always scanning for Rebel scum    |

Switch pets via right-click → Select Pet, or from the system tray menu.

Want to create your own? See [Creating a Pet](docs/creating-a-pet.md).

---

## 🏗️ Architecture

```
NekoAI/
├── src-tauri/                   # Rust backend (Tauri v2)
│   ├── capabilities/
│   │   └── default.json         # Window permissions (main, panel, house)
│   └── src/
│       ├── lib.rs               # App setup, tray, Tauri commands, resize_window
│       ├── desktop_monitor.rs   # Active window & idle time (Windows + Linux/X11)
│       ├── cursor_tracker.rs    # Wayland cursor fallback — reads /dev/input via evdev
│       └── storage.rs           # SQLite: conversation history, user facts, config
│
├── src/                         # TypeScript / React frontend
│   ├── App.tsx                  # Main pet window — movement, events, AI, rendering
│   ├── HouseWindow.tsx          # Pet house widget (separate Tauri window "house")
│   ├── PanelWindow.tsx          # Context menu / settings panel (window "panel")
│   ├── main.tsx                 # Entry point — routes to App / HouseWindow / PanelWindow
│   ├── ai/
│   │   ├── index.ts             # Provider factory, system prompt builder
│   │   ├── memory.ts            # Fact extraction & persistence (SQLite IPC)
│   │   ├── types.ts             # AIProvider interface, Message type
│   │   └── providers/           # anthropic.ts · openai.ts · gemini.ts · ollama.ts · nvidia.ts
│   ├── components/
│   │   ├── SpeechBubble.tsx     # Animated chat bubble — scramble text, sprite-anchored, preloads recent history
│   │   ├── SettingsPanel.tsx    # Settings panel (API key, model, pet size)
│   │   ├── ContextMenu.tsx      # Right-click context menu (settings, pet, size)
│   │   └── PetSelector.tsx      # Pet picker with dynamic window resizing
│   ├── hooks/
│   │   ├── usePetMovement.ts    # 8-direction movement, overridePosition, EdgePhase state machine
│   │   ├── useIdleSequencer.ts  # Classic Neko stop→wash→scratch→yawn→sleep idle sequence
│   │   ├── useMoodEngine.ts     # Energy/happiness/curiosity + animation overrides
│   │   ├── useDesktopContext.ts # Active window detection & app categorization
│   │   └── useOnboarding.ts    # First-launch state machine (Ollama auto-detect → done)
│   └── store/
│       ├── index.ts             # Zustand store (mood, active pet, animation)
│       └── configStore.ts       # AI config & pet size persisted via Tauri commands
│
└── pets/                        # Pet definitions (bundled with app)
    ├── manifest.json            # Registry of all available pets
    ├── classic-neko/            # 🐱 pet.json + sprites/
    ├── penguin-pixel/           # 🐧 pet.json + sprites/ (Pingu)
    ├── pac-man/                 # 🟡 pet.json + sprites/
    ├── bsd-daemon/              # 😈 pet.json + sprites/
    ├── tabby/                   # 🐈 pet.json + sprites/
    └── tie-fighter/             # 🚀 pet.json + sprites/
```

### Window Resizing on Windows

NekoAI uses a Tauri command (`resize_window`) to bypass OS-level restrictions when the window has `resizable: false` in its configuration. This is necessary because:

- **Why `resizable: false`?** — Creates a truly frameless window (no title bar, borders, or resize handles)
- **The problem:** The Windows API removes the `WS_THICKFRAME` window style when a window is created as non-resizable, and JavaScript APIs cannot restore it at runtime
- **The solution:** A Rust-side command calls `window.set_size()` directly, completely bypassing the JS API limitation

This allows the speech bubble, settings panel, pet selector, and context menu to dynamically expand/collapse without the user seeing the resize handles.

### NVIDIA NIM — Rust-side HTTP proxy

NVIDIA's `integrate.api.nvidia.com` endpoint is designed for server-to-server usage and does not send CORS headers. Unlike the other providers (Anthropic, OpenAI, Gemini) which explicitly support browser CORS, a direct `fetch()` from Tauri's WebView would be silently blocked.

NekoAI works around this with a dedicated `nvidia_chat` Tauri command (`lib.rs`) that makes the HTTP request from native Rust via `reqwest`, completely bypassing the WebView's CORS enforcement. The TypeScript provider uses `invoke('nvidia_chat', ...)` instead of `fetch`. This keeps the same `AIProvider` interface for all providers while letting NVIDIA NIM work correctly.

### Cursor Tracking on Wayland (Linux)

NekoAI reads the global cursor position to make the pet follow your mouse. On
Windows, macOS and Linux/Xorg this is a direct OS query. On a **Wayland** session
it isn't: NekoAI runs as an XWayland client, and X11's `XQueryPointer` only
reports a live position while the pointer is over one of NekoAI's own windows —
everywhere else it returns a frozen value, so the pet appears to stop following
the cursor.

The workaround lives in `cursor_tracker.rs`. On a Wayland session it reads raw
relative mouse motion straight from `/dev/input` via the `evdev` crate,
integrates an absolute position, and reconciles it against `XQueryPointer`
whenever that reading updates. Reading `/dev/input` requires the user to be in
the `input` group (`sudo usermod -aG input $USER`); when no device is readable
the `cursor_tracking_status` command reports `unavailable` and the pet
automatically falls back to wanderer mode so it still feels alive.

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

## 💬 Community {#community}

Join our Discord server to chat, share your pets, get help, and follow development:

[![Discord](https://img.shields.io/badge/Discord-Join%20us-5865F2?logo=discord&logoColor=white)](https://discord.gg/d7pykbNz)

_Channels available in: English 🇬🇧 | Español 🇪🇸 | Português 🇧🇷_

---

## 🗺️ Roadmap

| Version     | Focus                                                                                                                                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v0.1** ✅ | Core: transparent window, Neko sprite, cursor tracking, AI chat                                                                                                                                                                                                           |
| **v0.2** ✅ | Persistent memory, dynamic mood engine, pet house window, new pets (Pingu, Pac-Man, BSD Daemon, Tabby, TIE Fighter), 8-direction movement                                                                                                                                 |
| **v0.3** ✅ | Zero-config onboarding (Ollama auto-detect), Gemini as default provider, NVIDIA NIM provider, classic Neko idle/edge sequencer, restrictive CSP, multi-OS CI matrix, passive install metrics pipeline, Wayland cursor tracking via evdev, tunable response length (S/M/L) |
| **v0.4** 🔜 | **NekoMetrics** — anonymous keystroke / mouse / pet-step counters with house right-click menu, animated tooltip above the house, daily/weekly/monthly history, GitHub-style heatmap, BongoCat-style reactive paw animations                                               |
| **v0.5** 🔜 | Accessories/skins system, sound effects, sprite scale slider, community pet gallery in-app, mini-games                                                                                                                                                                    |
| **v0.6** 🔜 | **NekoCapture** — native screenshots with metadata footer (username, timestamp, app name, comments), customizable borders & shadows, clipboard/file export, hotkeys                                                                                                       |
| **v0.7** 🔜 | **NekoAnnotate** — full-screen drawing overlay (pen, shapes, arrows, text, highlighter) with undo/redo, inspired by ZoomIt Draw; annotate before saving screenshots                                                                                                       |
| **v1.0** 🔜 | Cross-platform stable release, plugin API, voice support                                                                                                                                                                                                                  |

---

## 🙏 Inspiration & Credits

NekoAI is the latest chapter in a 38-year chain started by a tiny Japanese program in 1988.

**The original creators** — their work made this possible:

| Name                            | Contribution                                                            | Year      |
| ------------------------------- | ----------------------------------------------------------------------- | --------- |
| **Naoshi Watanabe** (若田部 直) | Created `NEKO.COM` — the original cursor-chasing cat                    | ~1988     |
| **Kenji Gotoh** (後藤寿庵)      | Designed the iconic 32×32 sprites; released them to the public domain   | 1989      |
| **Masayuki Koba** (古場正行)    | `xneko` — X11 port that spawned all Unix lineage                        | 1990      |
| **Tatsuya Kato** (加藤達也)     | `oneko` — Linux/BSD port; still installable today (`apt install oneko`) | 1990      |
| **David Harvey**                | `Neko95/Neko98` — Win32 port with footprints and installer              | 1997–2000 |

**Standing on the shoulders of:**

- **[eSheep](https://github.com/Adrianotiger/desktopPet)** — the Windows XP sheep that proved desktop pets still had an audience
- **[Shimeji](https://kilkakon.com/shimeji/)** — Japanese desktop mascot framework with physics and interactions
- **[Eliot Akira's WebNeko](https://github.com/eliot-akira/neko)** — the browser revival that brought Neko to a new generation
- **[Tauri](https://tauri.app)** — for making sub-10MB native desktop apps actually possible in 2026

> 📖 **The full story** — from a 1988 NEC PC-9801 to AI-powered conversations — is in **[STORY-Neko.md](STORY-Neko.md)**.

---

## 📄 License

MIT © 2026 [Naudy Castellanos](https://naudycastellanos.com/)

Free to use, modify, and distribute. Attribution appreciated.

---

<div align="center">

**If NekoAI made you smile, give it a ⭐ — it helps a lot!**

🌐 [nekoai.dev](https://nekoai.dev/) · ✉ [hi@nekoai.dev](mailto:hi@nekoai.dev) · 👤 [naudycastellanos.com](https://naudycastellanos.com/)

_Made with ☕ and deep nostalgia for Windows XP — by [Naudy Castellanos](https://naudycastellanos.com/)_

</div>
