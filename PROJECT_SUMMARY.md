# NekoAI — Project Summary

> **Author:** Naudy Castellanos ([@nucket](https://github.com/nucket)) · **License:** MIT ·
> **Repository:** https://github.com/nucket/nekoai

A one-page overview. Details live in the documents linked below, so this page stays short and
doesn't go stale.

## What it is

NekoAI is an open-source desktop pet with an AI brain. A pixel-art pet (the classic Neko cat, or
another bundled pet) roams your desktop and follows your cursor. Click it and it chats with you in a
speech bubble, using the AI provider you pick: Gemini, Claude, OpenAI, NVIDIA NIM, or a local Ollama
model. It remembers a few facts about you, and its mood follows the time of day and how long you've
been away. There is no backend server and no telemetry.

## Where it stands

- **Latest release:** see [Releases](https://github.com/nucket/nekoai/releases) and the
  [CHANGELOG](CHANGELOG.md).
- **Platforms:** Windows, macOS (Apple Silicon and Intel), Linux (Xorg and Wayland).
- **Next:** v0.4, NekoMetrics ([spec](docs/feature-nekometrics-v0.4.md)). The full plan is the
  Roadmap section of the [README](README.md).

## Stack

Tauri 2 (Rust backend) · React 19 + TypeScript + Vite · SQLite (rusqlite) · Zustand · PNG sprites
with a JSON pet format. All AI calls, storage, the API key (OS credential store) and signed in-app
updates are handled on the Rust side.

## Where to read more

| Topic                                 | Document                                         |
| ------------------------------------- | ------------------------------------------------ |
| Features, install, configuration      | [README.md](README.md)                           |
| How the code fits together            | [docs/architecture.md](docs/architecture.md)     |
| Privacy, network connections, storage | [SECURITY.md](SECURITY.md)                       |
| Development setup, conventions, PRs   | [CONTRIBUTING.md](CONTRIBUTING.md)               |
| Making a pet                          | [docs/creating-a-pet.md](docs/creating-a-pet.md) |
| Release signing                       | [docs/code-signing.md](docs/code-signing.md)     |
| What changed, release by release      | [CHANGELOG.md](CHANGELOG.md)                     |
| The history behind Neko               | [STORY-Neko.md](STORY-Neko.md)                   |
