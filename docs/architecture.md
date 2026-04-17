# NekoAI Architecture

This document describes how the different layers of NekoAI work together.

---

## Overview

NekoAI is a **Tauri v2** application: a Rust backend exposes native OS APIs via IPC commands, and a React/TypeScript frontend handles all UI rendering and AI calls.

```
┌─────────────────────────────────────────────────────────┐
│  WebView (React + TypeScript)                           │
│  ┌────────────┐  ┌───────────────┐  ┌───────────────┐  │
│  │ PetRenderer│  │ SpeechBubble  │  │SettingsPanel  │  │
│  │ (sprites)  │  │ (AI chat UI)  │  │ PetSelector   │  │
│  └──────┬─────┘  └───────┬───────┘  └───────────────┘  │
│         │                │                              │
│  ┌──────▼─────┐  ┌───────▼───────┐                     │
│  │usePetMove- │  │ AI providers  │                     │
│  │ment + Mood │  │ (Anthropic /  │                     │
│  │ Engine     │  │  OpenAI /     │                     │
│  │            │  │  Ollama)      │                     │
│  └──────┬─────┘  └───────┬───────┘                     │
│         │                │                              │
│  ┌──────▼────────────────▼──────────────────────────┐  │
│  │                Tauri IPC (invoke)                 │  │
│  └──────┬────────────────────────────────────────────┘  │
└─────────┼───────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────┐
│  Rust backend (src-tauri/src/)                          │
│                                                         │
│  lib.rs              — commands, tray, window setup     │
│  storage.rs          — SQLite (conversations, facts)    │
│  desktop_monitor.rs  — Win32 APIs (window, idle time)   │
└─────────────────────────────────────────────────────────┘
```

---

## Frontend layers

### Rendering

`PetRenderer` runs a `requestAnimationFrame` loop that advances sprite frames at the animation's FPS. It accepts a `currentAnimation` string and looks up the frame list in `animations` from the loaded `pet.json`.

The final animation shown is computed as:

```
displayed = moodOverride ?? movementAnimation
```

- `movementAnimation` — from `usePetMovement` (idle / walk_* / near_cursor / sleep)
- `moodOverride` — from `useMoodEngine` (yawn when OS idle 3–5 min)

### Movement

`usePetMovement` runs a 50ms cursor poll via `invoke('get_cursor_pos')` and a rAF loop that moves the window. States: `IDLE → WALKING → NEAR_CURSOR → SLEEPING`.

### Mood engine

`useMoodEngine` runs every 60 seconds. It computes three values (0–100):

| Value | Signal |
|---|---|
| `energy` | Sinusoidal day curve + OS idle penalty |
| `happiness` | Higher during waking hours (7am–10pm) |
| `curiosity` | App category (coding → high, other → low) |

These are stored in the Zustand store and included in every AI system prompt.

### AI pipeline

On each user message:

1. Save user message to SQLite
2. Load last 20 messages from SQLite (conversation history)
3. Load all user facts from SQLite
4. Build system prompt: `pet personality + facts + mood description`
5. Call AI provider (Anthropic / OpenAI / Ollama)
6. Save assistant reply to SQLite
7. Extract new facts from the exchange (async, fire-and-forget)

### Fact extraction

`src/ai/memory.ts` runs regex patterns over each user message + assistant reply looking for:
- Name (`my name is X`, `me llamo X`)
- Project (`working on X`, `building X`)
- Language (`I use X`, `I code in X`)

Extracted facts are upserted into the `user_facts` SQLite table.

---

## Rust backend

### Commands exposed to frontend

| Command | Description |
|---|---|
| `get_cursor_pos` | Physical cursor position (for movement loop) |
| `move_window` | Move the transparent window to a new position |
| `set_always_on_top` | Toggle always-on-top |
| `set_ignore_cursor_events` | Pass-through click events |
| `get_config` / `save_config` | Read/write `~/.config/nekoai/config.toml` |
| `get_recent_messages` | Last N messages from SQLite |
| `save_message` | Append a message to SQLite |
| `get_user_fact` / `set_user_fact` | Key-value facts storage |
| `get_all_user_facts` | All facts as a JSON object |
| `get_active_window` | Foreground window title + process name |
| `get_all_windows` | All visible windows |
| `get_idle_millis` | OS-wide idle time in milliseconds |
| `enable_autostart` / `disable_autostart` | Launch-at-login |
| `quit_app` | Exit the process |

### Storage

SQLite database at `~/.local/share/nekoai/memory.db` (Windows: `%USERPROFILE%\.local\share\nekoai\memory.db`).

```sql
CREATE TABLE conversations (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    role      TEXT    NOT NULL,   -- 'user' | 'assistant'
    content   TEXT    NOT NULL
);

CREATE TABLE user_facts (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

Config file at `~/.config/nekoai/config.toml`:

```toml
provider = "anthropic"
api_key  = "sk-ant-..."
model    = "claude-haiku-4-5-20251001"
```

---

## Pet system

### Registry

`pets/manifest.json` is the authoritative list of available pets. `PetSelector` fetches it dynamically so adding a new pet only requires:

1. A `pets/<id>/` directory with `pet.json` + `sprites/`
2. An entry in `pets/manifest.json`
3. A tray entry in `src-tauri/src/lib.rs`

### Format

`pet.json` uses a **files-based** animation format: each animation lists individual PNG filenames played in sequence. See [Creating a Pet](creating-a-pet.md) for the full spec.

### Loading

`App.tsx` fetches `/pets/<activePetId>/pet.json` via HTTP (Vite serves `pets/` as static assets in dev; the build hook copies them to `dist/pets/`). When `activePetId` changes, the effect re-runs and the new pet loads immediately.

---

## Data flow diagram (chat turn)

```
User types message
        │
        ▼
SpeechBubble.handleSend()
        │
        ▼
App.handleSendMessage(text)
        ├─ invoke('save_message', user)
        ├─ invoke('get_recent_messages', 20)   ─┐
        ├─ invoke('get_all_user_facts')          ├─ parallel
        │                                       ─┘
        ├─ buildContextBlock(petName, facts, mood)
        ├─ provider.sendMessage(history, systemPrompt)
        │        └─ fetch() to AI API
        ├─ invoke('save_message', assistant)
        └─ extractAndSaveFacts(text, reply)  ← fire and forget
```
