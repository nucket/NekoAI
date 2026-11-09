# NekoAI Architecture

This document describes how the different layers of NekoAI work together.

---

## Overview

NekoAI is a **Tauri v2** application: a React/TypeScript frontend renders the pet and its UI, and a Rust backend does everything that touches the OS or the network — AI provider calls, storage, the API key, updates — exposed to the WebView as IPC commands.

```
┌─────────────────────────────────────────────────────────┐
│  WebView (React + TypeScript)                           │
│  ┌────────────┐  ┌───────────────┐  ┌───────────────┐  │
│  │ PetRenderer│  │ SpeechBubble  │  │SettingsPanel  │  │
│  │ (sprites)  │  │ (AI chat UI)  │  │ PetSelector   │  │
│  └──────┬─────┘  └───────┬───────┘  └───────┬───────┘  │
│         │                │                  │          │
│  ┌──────▼─────┐  ┌───────▼───────┐          │          │
│  │usePetMove- │  │ useChat       │          │          │
│  │ment, Mood, │  │ (prompt +     │          │          │
│  │ triggers   │  │  memory)      │          │          │
│  └──────┬─────┘  └───────┬───────┘          │          │
│         │                │                  │          │
│  ┌──────▼────────────────▼──────────────────▼───────┐  │
│  │                Tauri IPC (invoke)                 │  │
│  └──────┬────────────────────────────────────────────┘  │
└─────────┼───────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────┐
│  Rust backend (src-tauri/src/)                          │
│                                                         │
│  lib.rs              — commands, tray, window setup     │
│  ai.rs               — every AI provider (ai_chat)      │
│  storage.rs          — config.toml + SQLite             │
│  secrets.rs          — API key in the credential store  │
│  updater.rs          — signed in-app updates            │
│  desktop_monitor.rs  — OS APIs (window, idle time)      │
│  cursor_tracker.rs   — Wayland cursor via evdev         │
└─────────────────────────────────────────────────────────┘
```

---

## Frontend layers

### Rendering

`PetRenderer` runs a `requestAnimationFrame` loop that advances sprite frames at the animation's FPS. It accepts a `currentAnimation` string and looks up the frame list in `animations` from the loaded `pet.json`.

The final animation is resolved by `resolveAnimation()` (`src/pets/resolveAnimation.ts`, called from `App.tsx`) — a pure function that applies a strict priority order:

```
1. notificationAlert → 'alert' (or 'idle' if no alert anim)   [always wins]
2. petState === 'WALKING'  → edgeAnimOverride ?? currentAnimation
   (walk_* sprites are immune to idle, mood, trigger and wake overrides)
3. other states → edgeAnimOverride ?? clickWakeAnim ?? triggerAnim ?? idleAnim ?? moodOverride ?? currentAnimation
```

Sources of each layer:

- `currentAnimation` — `usePetMovement` (idle / walk\_\* / sleep)
- `triggerAnim` — `usePetTriggers`: the pet.json `triggers` for chat open, AI thinking / response and OS idle (see `src/pets/triggers.ts`)
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

On each user message (`useChat`):

1. Save user message to SQLite
2. Load last 20 messages from SQLite (conversation history)
3. Load all user facts from SQLite
4. Build system prompt: `pet personality + facts + mood description + reply-length instruction`
5. Call the configured provider through the Rust `ai_chat` command (Anthropic / OpenAI / Gemini / NVIDIA NIM / Ollama)
6. Save assistant reply to SQLite
7. Extract new facts from the user's message (async, fire-and-forget)

### Fact extraction

`src/ai/memory.ts` runs regex patterns over each user message looking for:

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
| `cursor_tracking_status`                 | How the cursor is read (direct, evdev on Wayland, or unavailable)   |
| `resize_window`                          | Resize the transparent window (bypasses `WS_THICKFRAME` on Windows) |
| `open_panel_window`                      | Open the secondary panel window (context menu / settings)           |
| `resize_panel_window`                    | Resize the secondary panel window (context menu / settings)         |
| `close_panel_window`                     | Close the panel window                                              |
| `panel_action`                           | Route a panel action (settings, select-pet, pet-mode, pet-size)     |
| `set_window_shape`                       | Apply per-frame GTK shape mask from canvas alpha (Linux only)       |
| `clear_window_shape`                     | Remove shape mask so full window is visible (Linux only)            |
| `get_config` / `save_config`             | Read/write `config.toml` (the API key goes to the credential store) |
| `patch_config`                           | Change some settings and broadcast `config-updated` to all windows  |
| `get_recent_messages`                    | Last N messages from SQLite                                         |
| `save_message`                           | Append a message to SQLite (triggers pruning every 20 inserts)      |
| `clear_conversations`                    | Wipe all conversation history (Settings → Memory)                   |
| `get_user_fact` / `set_user_fact`        | Key-value facts storage                                             |
| `get_all_user_facts`                     | All facts as a JSON object                                          |
| `delete_user_fact` / `clear_user_facts`  | Forget one fact / all facts (Settings → Memory)                     |
| `get_active_window`                      | Foreground window title + process name                              |
| `get_idle_millis`                        | OS-wide idle time in milliseconds                                   |
| `ai_chat`                                | Send a chat turn to the configured AI provider (`ai.rs`)            |
| `ollama_detect`                          | List models of a local Ollama daemon (onboarding)                   |
| `open_url`                               | Open a URL or mailto link via the system browser                    |
| `autostart_status`                       | Launch-at-login state (`null` in portable mode)                     |
| `enable_autostart` / `disable_autostart` | Launch-at-login (Settings → "Start NekoAI with the system")         |
| `set_tray_locale`                        | Show the tray menu in the UI language                               |
| `check_for_update`                       | Ask GitHub for a newer signed release (`updater.rs`)                |
| `install_update`                         | Download, verify and install it, then restart (`updater.rs`)        |
| `quit_app`                               | Exit the process                                                    |

### Storage

Default paths (installed mode), resolved with the `dirs` crate (`storage::config_path` /
`storage::db_path`):

| OS      | `config.toml` (settings)                           | `memory.db` (history, facts)                     |
| ------- | -------------------------------------------------- | ------------------------------------------------ |
| Linux   | `~/.config/nekoai/config.toml`                     | `~/.local/share/nekoai/memory.db`                |
| Windows | `%APPDATA%\nekoai\config.toml`                     | `%LOCALAPPDATA%\nekoai\memory.db`                |
| macOS   | `~/Library/Application Support/nekoai/config.toml` | `~/Library/Application Support/nekoai/memory.db` |

On Linux, `$XDG_CONFIG_HOME` / `$XDG_DATA_HOME` override `~/.config` / `~/.local/share`. On
Windows the database lives under `%LOCALAPPDATA%` so it doesn't roam with the profile.

Versions up to 0.3.8 used `~/.config/nekoai` and `~/.local/share/nekoai` on every OS.
`storage::migrate_legacy_paths()` runs first thing in `run()` and moves `config.toml` and
`memory.db` (with its `-wal` / `-shm` files) to the new location once. It never overwrites
existing files and is a no-op on Linux, where the paths are unchanged.

In **portable mode** (a `portable` marker file sits next to the executable), both files are
redirected to a `data/` folder beside the exe — safe to run from a USB drive with no writes
to the home directory. `storage::is_portable()` controls the switch; autostart is disabled
when portable mode is active.

### Platform support in `desktop_monitor.rs`

| Feature             | Windows                     | Linux (X11 / XWayland)              | Pure Wayland   | macOS          |
| ------------------- | --------------------------- | ----------------------------------- | -------------- | -------------- |
| `get_idle_millis`   | Win32 `GetLastInputInfo`    | XScreenSaver extension (`x11rb`)    | Returns `0`    | Returns `0`    |
| `get_active_window` | Win32 `GetForegroundWindow` | EWMH `_NET_ACTIVE_WINDOW` (`x11rb`) | Returns `None` | Returns `None` |

Pure Wayland sessions and macOS gracefully degrade: the mood engine runs on
time-of-day only, desktop context is empty, and the notification monitor is effectively
disabled. Because idle time reads as `0`, the pet.json idle triggers (`on_idle_*`) don't fire
there either. All other features are unaffected. A macOS implementation (via `core-graphics`
/ `objc2`) is not written yet.

### Updates

`updater.rs` wraps `tauri-plugin-updater`. The release workflow publishes `latest.json` and a
minisign signature for each installer; the plugin only installs a download whose signature
matches the public key in `tauri.conf.json` (`plugins.updater.pubkey`). This is separate from OS
code signing ([code-signing.md](code-signing.md)).

The WebView has no updater permissions: `useUpdateNotice` calls `check_for_update` a little
after startup (unless **Settings → Check for updates at startup** is off), shows the offer in
the pet's bubble, and calls `install_update` only when the user accepts. Portable copies and
Linux `.deb` / `.rpm` installs can't replace themselves, so for them the bubble links to the
download page instead (`can_install_in_place`).

### Content Security Policy

The WebView runs with a strict CSP defined in `src-tauri/tauri.conf.json` (`app.security.csp` for production, `app.security.devCsp` for development).

`connect-src` is the load-bearing directive — it enumerates every host the WebView is allowed to reach:

| Host                                        | Reason                               |
| ------------------------------------------- | ------------------------------------ |
| `'self'`                                    | `pet.json`, `manifest.json`, sprites |
| `ipc:` / `http://ipc.localhost`             | Tauri IPC (`invoke()`)               |
| `ws://localhost:1420` + `1421` _(dev only)_ | Vite HMR WebSocket                   |

No AI provider is listed: all five are reached from native Rust through `ai_chat` (`src-tauri/src/ai.rs`), and Ollama detection through `ollama_detect`. Add a new provider there, not as a WebView `fetch()`, so `connect-src` can stay limited to IPC.

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

Config file (`config.toml`, see the table above):

```toml
provider = "gemini"
model    = "gemini-3.5-flash-lite"
```

The API key is not in this file: `secrets.rs` keeps it in the OS credential store — Windows Credential Manager, the macOS Keychain, or the Secret Service (GNOME Keyring / KWallet) on Linux. `get_config`, `patch_config` and
the `config-updated` event send WebViews a `PublicConfig` (no key, plus `hasApiKey`), and `ai_chat` reads the
key on the Rust side. Without a usable credential store, and in portable mode, the key falls back to
`config.toml` (owner-only on Unix).

Default is Gemini because Google AI Studio offers a free tier with no credit card. `configStore.ts` `DEFAULT_CONFIG` and `storage.rs` `AIConfig::default()` must always stay in sync.

---

## Pet system

### Registry

`pets/manifest.json` is the authoritative list of available pets. `PetSelector` fetches it at runtime and the tray embeds it at compile time (`include_str!` in `lib.rs`), so adding a new pet only requires:

1. A `pets/<id>/` directory with `pet.json` + `sprites/`
2. An entry in `pets/manifest.json`

`scripts/validate-pets.mjs` (`pnpm pets:validate`, also run in CI) checks every listed pet against `schemas/pet.schema.json` and makes sure each referenced sprite exists.

### Format

`pet.json` uses a **files-based** animation format: each animation lists individual PNG filenames played in sequence. See [Creating a Pet](creating-a-pet.md) for the full spec.

### Loading

`usePetDefinition` fetches `/pets/<activePetId>/pet.json` via HTTP (Vite serves `pets/` as static assets in dev; the build hook copies them to `dist/pets/`). When `activePetId` changes, the effect re-runs and the new pet loads immediately; if it fails to load, the hook falls back to the default pet.

---

## Onboarding flow

`useOnboarding` runs once per session after the Zustand config store finishes loading from disk.

```
config loaded
     │
     ├─ onboardingCompleted=true OR isConfigured(config)=true → done (silent stamp if needed)
     │
     └─ detecting: detectOllama() → Rust ollama_detect (2.5 s timeout, GET /api/tags)
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

`isConfigured(config)` helper: Ollama is always ready; every other provider needs a stored key (`hasApiKey`).

## Data flow diagram (chat turn)

```
User types message
        │
        ▼
SpeechBubble.handleSend()
        │
        ▼
useChat.sendMessage(text)
        ├─ invoke('save_message', user)
        ├─ invoke('get_recent_messages', 20)   ─┐
        ├─ invoke('get_all_user_facts')          ├─ parallel
        │                                       ─┘
        ├─ buildContextBlock(persona, facts, mood, maxTokens)
        ├─ provider.sendMessage(history, systemPrompt)
        │        └─ invoke('ai_chat') → Rust (reqwest, key from secrets.rs) → AI API
        ├─ invoke('save_message', assistant)
        └─ extractAndSaveFacts(text)  ← fire and forget
```
