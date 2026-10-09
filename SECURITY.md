# Security Policy

## Supported Versions

| Version       | Supported             |
| ------------- | --------------------- |
| 0.x (current) | ✅ Active development |

## Privacy & Data Handling

NekoAI is designed with privacy as a core principle.

- **No telemetry in the app.** No analytics, no crash reports, no background reporting. The only outbound network calls from the app are the AI provider calls listed below and a single loopback probe for Ollama on first launch.
- **AI providers** — calls go directly from your machine to the provider you select. NekoAI has no proxy, no relay, and no infrastructure of its own.
  - Anthropic Claude — `https://api.anthropic.com`
  - OpenAI — `https://api.openai.com`
  - Google Gemini — `https://generativelanguage.googleapis.com`
  - NVIDIA NIM — `https://integrate.api.nvidia.com` (proxied through the Rust `nvidia_chat` command to bypass WebView CORS; the destination is unchanged)
  - Ollama — `http://localhost:11434` by default, or the base URL you set in Settings (called from the Rust `ollama_detect` / `ollama_chat` commands, not from the WebView)
- **API keys stored locally** in `~/.config/nekoai/config.toml`. They are never transmitted anywhere except to the provider whose key it is.
- **Conversation history stored locally** in a SQLite database at `~/.local/share/nekoai/memory.db`.
- **Where these files live.** The same two paths are used on every OS. `~` is `$HOME` (on Windows, `%USERPROFILE%` unless `HOME` is set), and `$XDG_CONFIG_HOME` / `$XDG_DATA_HOME` override the `.config` / `.local/share` parts. In portable mode both files go to a `data/` folder next to the executable.
- **Bounded history.** The `conversations` table auto-prunes to the most recent 200 rows / 30 days to bound disk growth. **Settings → Memory** lists everything the pet has learned about you and lets you forget individual facts, clear the conversation history, or forget everything (`delete_user_fact`, `clear_conversations`, `clear_user_facts`).
- **First-launch Ollama detection.** On first run, NekoAI asks the Rust `ollama_detect` command to call `http://localhost:11434/api/tags` once, with a 2.5 s timeout, to detect a local Ollama install. The request is loopback only — it cannot leave your machine. Once onboarding completes, this probe does not run again.

### Public install metrics — not telemetry

The repository publishes daily snapshots of public GitHub download counts on the [`metrics` branch](https://github.com/nucket/NekoAI/tree/metrics) (schema: [`docs/metrics/SCHEMA.md`](docs/metrics/SCHEMA.md)). The pipeline runs entirely inside a GitHub Action against the public Releases API; **no code in the app emits this data**. Source: [`scripts/metrics/`](scripts/metrics/), workflow: [`.github/workflows/metrics.yml`](.github/workflows/metrics.yml).

## Web Content Security Policy

The Tauri WebView ships with a restrictive CSP defined in `src-tauri/tauri.conf.json`. The `connect-src` directive enumerates exactly the network endpoints the WebView is allowed to reach:

- The three AI provider APIs called via `fetch()` from the WebView (Anthropic, OpenAI, Gemini)
- Tauri IPC (`ipc:` and `http://ipc.localhost`)

NVIDIA NIM and Ollama are intentionally absent from `connect-src` because those calls are made from native Rust (`reqwest`), not from the WebView.

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
