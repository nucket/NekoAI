# Security Policy

## Supported Versions

| Version       | Supported             |
| ------------- | --------------------- |
| 0.x (current) | ✅ Active development |

## Privacy & Data Handling

NekoAI is designed with privacy as a core principle.

- **No telemetry in the app.** No analytics, no crash reports, no background reporting. The only outbound network calls from the app are the AI provider calls listed below and a single loopback probe for Ollama on first launch.
- **AI providers** — calls go directly from your machine to the provider you select. NekoAI has no proxy, no relay, and no infrastructure of its own. Every call is made by the app's native side (the Rust `ai_chat` command), never by the WebView.
  - Anthropic Claude — `https://api.anthropic.com`
  - OpenAI — `https://api.openai.com`
  - Google Gemini — `https://generativelanguage.googleapis.com`
  - NVIDIA NIM — `https://integrate.api.nvidia.com`
  - Ollama — `http://localhost:11434` by default, or the `http://` / `https://` base URL you set in Settings
- **API keys stored locally** in the OS credential store — Windows Credential Manager, the macOS Keychain, or the Secret Service (GNOME Keyring / KWallet) on Linux, not in `config.toml`. They are only ever sent to the provider whose key it is, from the app's native side; the WebView never receives them (it only learns whether a key is saved). If no credential store is available (e.g. a Linux session without a Secret Service) and in portable mode, the key stays in `config.toml`, which is created owner-only (`0600`) on Linux and macOS. A key found in `config.toml` from an older version is moved to the credential store on first launch.
- **Conversation history stored locally** in a SQLite database, `memory.db`.
- **Where these files live.** In the platform's standard app directories (on Linux, `$XDG_CONFIG_HOME` / `$XDG_DATA_HOME` override `~/.config` / `~/.local/share`). In portable mode both files go to a `data/` folder next to the executable. Versions up to 0.3.x used the Linux paths on every OS; the first launch of a newer version moves the files over.

| OS      | `config.toml` (settings)                           | `memory.db` (history, facts)                     |
| ------- | -------------------------------------------------- | ------------------------------------------------ |
| Linux   | `~/.config/nekoai/config.toml`                     | `~/.local/share/nekoai/memory.db`                |
| Windows | `%APPDATA%\nekoai\config.toml`                     | `%LOCALAPPDATA%\nekoai\memory.db`                |
| macOS   | `~/Library/Application Support/nekoai/config.toml` | `~/Library/Application Support/nekoai/memory.db` |

- **Bounded history.** The `conversations` table auto-prunes to the most recent 200 rows / 30 days to bound disk growth. **Settings → Memory** lists everything the pet has learned about you and lets you forget individual facts, clear the conversation history, or forget everything (`delete_user_fact`, `clear_conversations`, `clear_user_facts`).
- **First-launch Ollama detection.** On first run, NekoAI asks the Rust `ollama_detect` command to call `http://localhost:11434/api/tags` once, with a 2.5 s timeout, to detect a local Ollama install. The request is loopback only — it cannot leave your machine. Once onboarding completes, this probe does not run again.

### Public install metrics — not telemetry

The repository publishes daily snapshots of public GitHub download counts on the [`metrics` branch](https://github.com/nucket/NekoAI/tree/metrics) (schema: [`docs/metrics/SCHEMA.md`](docs/metrics/SCHEMA.md)). The pipeline runs entirely inside a GitHub Action against the public Releases API; **no code in the app emits this data**. Source: [`scripts/metrics/`](scripts/metrics/), workflow: [`.github/workflows/metrics.yml`](.github/workflows/metrics.yml).

## Web Content Security Policy

The Tauri WebView ships with a restrictive CSP defined in `src-tauri/tauri.conf.json`. Its `connect-src` allows only the app itself and Tauri IPC (`'self'`, `ipc:`, `http://ipc.localhost`): no third-party host at all. AI provider calls are made from native Rust (`reqwest`, in `src-tauri/src/ai.rs`), so the WebView needs no network access of its own.

Other directives: `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` — standard hardening that blocks plugin injection, base-tag tampering, and clickjacking. `style-src 'self' 'unsafe-inline'` is required because React applies inline `style={...}` attributes throughout the app. The `devCsp` variant additionally allows `'unsafe-eval'` and the Vite HMR WebSocket on `ws://localhost:1420` and `ws://localhost:1421`; production builds never receive either relaxation.

## Local Storage Hardening

- SQLite uses a process-wide `OnceLock<Mutex<Connection>>` with `journal_mode=WAL`, `synchronous=NORMAL` and `busy_timeout=5s`. Concurrent writes (chat save + config update) are serialised through the mutex; readers do not block on a writer.
- The `conversations` table is bounded by an automatic prune after every 20 inserts (rows older than 30 days, or beyond the most-recent 200, whichever cuts more) so on-disk history cannot grow indefinitely.
- The desktop notification monitor exits cleanly via `mpsc::recv_timeout` on `RunEvent::Exit`. There is no orphaned background thread retained after the app quits.

## Reporting a Vulnerability

If you discover a security vulnerability in NekoAI, **please do not open a public issue**.

Instead, report it privately by opening a [GitHub Security Advisory](https://github.com/nucket/nekoai/security/advisories/new) or by emailing **[hi@nekoai.dev](mailto:hi@nekoai.dev)**.

Please include:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix if you have one

You can expect an acknowledgment within 48 hours and a resolution timeline within 7 days for critical issues.

## Dependency Security

- Frontend dependencies are managed via npm and audited with `npm audit`.
- Rust dependencies are audited with `cargo audit`.
- Dependabot is configured to auto-open PRs for dependency updates.
- CI runs `cargo clippy` (warnings as errors), `cargo fmt --check`, ESLint with `--max-warnings 0`, `prettier --check` and the full Rust test suite on Linux + Windows + macOS for every push and PR.
