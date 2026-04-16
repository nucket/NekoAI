# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 0.x (current) | ✅ Active development |

## Privacy & Data Handling

NekoAI is designed with privacy as a core principle:

- **No backend servers** — NekoAI has zero telemetry and no cloud component
- **API keys stored locally** — stored in `~/.config/nekoai/config.toml`, never transmitted to NekoAI servers
- **Conversation history stored locally** — SQLite database at `~/.local/share/nekoai/memory.db`
- **AI calls go directly to your chosen provider** — Anthropic, OpenAI, or local Ollama

The only outbound network requests are the ones you configure by adding an API key.

## Reporting a Vulnerability

If you discover a security vulnerability in NekoAI, **please do not open a public issue**.

Instead, report it privately by emailing or opening a [GitHub Security Advisory](https://github.com/nucket/nekoai/security/advisories/new).

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix if you have one

You can expect an acknowledgment within 48 hours and a resolution timeline within 7 days for critical issues.

## Dependency Security

- Frontend dependencies are managed via npm and audited with `npm audit`
- Rust dependencies are audited with `cargo audit`
- Dependabot is configured to auto-open PRs for dependency updates
