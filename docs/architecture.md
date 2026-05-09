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
│  │            │  │  Gemini /     │                     │
│  │            │  │  NVIDIA NIM / │                     │
│  │            │  │  Ollama)      │                     │
│  └──────┬─────┘  └───────┘       │                     │
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
│  desktop_monitor.rs  — OS APIs (window, idle time)      │
└─────────────────────────────────────────────────────────┘
```

---

## Frontend layers

### Rendering

`PetRenderer` runs a `requestAnimationFrame` loop that advances sprite frames at the animation's FPS. It accepts a `currentAnimation` string and looks up the frame list in `animations` from the loaded `pet.json`.

The final animation is resolved by `resolveAnimation()` in `App.tsx` — a pure function that applies a strict priority order:

```
1. notificationAlert → 'alert' (or 'idle' if no alert anim)   [always wins]
2. petState === 'WALKING'  → edgeAnimOverride ?? currentAnimation
   (walk_* sprites are immune to idle, mood, and wake overrides)
3. other states → edgeAnimOverride ?? clickWakeAnim ?? idleAnim ?? moodOverride ?? currentAnimation
```

Sources of each layer:

- `currentAnimation` — `usePetMovement` (idle / walk\_\* / sleep)
- `moodOverride` — `useMoodEngine` (yawn when OS idle; only fires in `IDLE` state)
- `idleAnim` — `useIdleSequencer` (wash / scratch_wall / yawn / falling_asleep / sleep; only in `NEAR_CURSOR`)
- `clickWakeAnim` — brief `awaken` flash on sprite click (only in stationary states)
- `edgeAnimOverride` — scratch / yawn / idle during monitor-edge crossing; also used during the onboarding slide (`walk_left`)
- `notificationAlert` — overrides everything when the pet was teleported to a notification

### Movement

`usePetMovement` runs a 50ms cursor poll via `invoke('get_cursor_pos')` and a rAF loop that moves the window. States: `IDLE → WALKING → NEAR_CURSOR → SLEEPING`. The `enabled` flag pauses cursor following — set to `false` during the onboarding slide sequence.

### Mood engine

`useMoodEngine` runs every 60 seconds. It computes three values (0–100):

| Value       | Signal                                    |
| ----------- | ----------------------------------------- |
| `energy`    | Sinusoidal day curve + OS idle penalty    |
| `happiness` | Higher during waking hours (7am–10pm)     |
| `curiosity` | App category (coding → high, other → low) |

These are stored in the Zustand store and included in every AI system prompt.

### AI pipeline

On each user message:

1. Save user message to SQLite
2. Load last 20 messages from SQLite (conversation history)
3. Load all user facts from SQLite
4. Build system prompt: `pet personality + facts + mood description`
5. Call AI provider (Anthropic / OpenAI / Gemini / Ollama)
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

| Command                                  | Description                                                         |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `get_cursor_pos`                         | Physical cursor position (for movement loop)                        |
| `resize_window`                          | Resize the transparent window (bypasses `WS_THICKFRAME` on Windows) |
| `resize_panel_window`                    | Resize the secondary panel window (context menu / settings)         |
| `close_panel_window`                     | Close the panel window                                              |
| `panel_action`                           | Route a panel action (settings, select-pet, pet-mode, pet-size)     |
| `set_always_on_top`                      | Toggle always-on-top                                                |
| `set_ignore_cursor_events`               | Pass-through click events                                           |
| `get_config` / `save_config`             | Read/write config (SQLite)                                          |
| `get_recent_messages`                    | Last N messages from SQLite                                         |
| `save_message`                           | Append a message to SQLite (triggers pruning every 20 inserts)      |
| `prune_conversations`                    | Delete rows beyond max_rows / max_age_days (on-demand)              |
| `clear_conversations`                    | Wipe all conversation history ("Reset memory")                      |
| `get_user_fact` / `set_user_fact`        | Key-value facts storage                                             |
| `get_all_user_facts`                     | All facts as a JSON object                                          |
| `get_active_window`                      | Foreground window title + process name                              |
| `get_all_windows`                        | All visible windows                                                 |
| `get_idle_millis`                        | OS-wide idle time in milliseconds                                   |
| `nvidia_chat`                            | Native HTTP call to NVIDIA NIM API (bypasses WebView CORS)          |
| `open_url`                               | Open a URL or mailto link via the system browser                    |
| `enable_autostart` / `disable_autostart` | Launch-at-login                                                     |
| `quit_app`                               | Exit the process                                                    |

### Storage

Default paths (installed mode):

| File            | Path                              |
| --------------- | --------------------------------- |
| SQLite database | `~/.local/share/nekoai/memory.db` |
| Config          | `~/.config/nekoai/config.toml`    |

In **portable mode** (a `portable` marker file sits next to the executable), both files are
redirected to a `data/` folder beside the exe — safe to run from a USB drive with no writes
to the home directory. `storage::is_portable()` controls the switch; autostart is disabled
when portable mode is active.

### Platform support in `desktop_monitor.rs`

| Feature             | Windows                     | Linux (X11 / XWayland)              | Pure Wayland   | macOS          |
| ------------------- | --------------------------- | ----------------------------------- | -------------- | -------------- |
| `get_idle_millis`   | Win32 `GetLastInputInfo`    | XScreenSaver extension (`x11rb`)    | Returns `0`    | Returns `0`    |
| `get_active_window` | Win32 `GetForegroundWindow` | EWMH `_NET_ACTIVE_WINDOW` (`x11rb`) | Returns `None` | Returns `None` |
| `get_all_windows`   | Win32 `EnumWindows`         | EWMH `_NET_CLIENT_LIST` (`x11rb`)   | Returns `[]`   | Returns `[]`   |

Pure Wayland sessions and macOS gracefully degrade: the mood engine runs on
time-of-day only, desktop context is empty, and the notification monitor is effectively
disabled. All other features are unaffected. macOS implementation (via `core-graphics`
/ `objc2`) is planned for v0.3+.

### Content Security Policy

The WebView runs with a strict CSP defined in `src-tauri/tauri.conf.json` (`app.security.csp` for production, `app.security.devCsp` for development).

`connect-src` is the load-bearing directive — it enumerates every host the WebView is allowed to reach:

| Host                                        | Reason                               |
| ------------------------------------------- | ------------------------------------ |
| `'self'`                                    | `pet.json`, `manifest.json`, sprites |
| `ipc:` / `http://ipc.localhost`             | Tauri IPC (`invoke()`)               |
| `https://api.anthropic.com`                 | Anthropic provider                   |
| `https://api.openai.com`                    | OpenAI provider                      |
| `https://generativelanguage.googleapis.com` | Gemini provider                      |
| `http://localhost:11434` / `127.0.0.1`      | Ollama provider (loopback only)      |
| `ws://localhost:1420` + `1421` _(dev only)_ | Vite HMR WebSocket                   |

NVIDIA NIM is intentionally absent from `connect-src` — its endpoint is reached from native Rust via `nvidia_chat`, so the WebView never touches `integrate.api.nvidia.com`. If you add a new provider that calls `fetch()` directly, append its host to `connect-src` (and to `devCsp`).

```sql
CREATE TABLE conversations (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    role      TEXT    NOT NULL,   -- 'user' | 'assistant'
    content   TEXT    NOT NULL
);
-- Indexed for the prune query (by-recency cap) and the age cutoff.
CREATE INDEX idx_conversations_id_desc  ON conversations(id DESC);
CREATE INDEX idx_conversations_timestamp ON conversations(timestamp);

CREATE TABLE user_facts (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

**Retention policy:** `save_message` prunes the `conversations` table every 20 inserts, deleting rows older than 30 days and rows beyond the most-recent 200 (whichever cuts more). Use `clear_conversations()` to reset all history.

**Connection:** one process-wide `rusqlite::Connection` held behind `OnceLock<Mutex<Connection>>`. `journal_mode=WAL` allows concurrent reads; `synchronous=NORMAL` and `busy_timeout=5s` cover edge cases.

Config file at `~/.config/nekoai/config.toml`:

```toml
provider = "gemini"
api_key  = "AIza..."
model    = "gemini-2.5-flash"
```

Default is Gemini because Google AI Studio offers a free tier with no credit card. `configStore.ts` `DEFAULT_CONFIG` and `storage.rs` `AIConfig::default()` must always stay in sync.

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

## Onboarding flow

`useOnboarding` runs once per session after the Zustand config store finishes loading from disk.

```
config loaded
     │
     ├─ onboardingCompleted=true OR isConfigured(config)=true → done (silent stamp if needed)
     │
     └─ detecting: OllamaProvider.detect() (800ms timeout, GET /api/tags)
              │
              ├─ ok + models ≥ 1 → applyOllamaAutoConfig(models[0])
              │                     setState('ollama_found')
              │
              └─ not ok          → setState('needs_setup')

After ollama_found | needs_setup:
  App.tsx disables usePetMovement (onboardingActive gate)
  → overridePosition to start (house corner)
  → rAF slide to center-bottom (5500ms)
  → SpeechBubble shown in announcement mode (10s autoclose)
  → user clicks CTA → dismiss() → setState('done') → cursor following re-enables
```

`isConfigured(config)` helper: Ollama is always ready; every other provider needs a non-empty `apiKey`.

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
