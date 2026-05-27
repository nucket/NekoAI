import { invoke } from '@tauri-apps/api/core'
import type { AIProvider, Message } from '../types'

export type OllamaDetectResult = { ok: true; models: string[] } | { ok: false }

// Ollama enforces a per-Origin CORS allowlist whose default covers
// `http://localhost:*` and `http://127.0.0.1:*`. That matches the Vite dev
// server but NOT the production webview origin (`http://tauri.localhost` on
// Windows), so a browser-side `fetch()` from the installed app is silently
// rejected with 403. Both `detect()` and `sendMessage()` therefore go through
// Rust commands (`ollama_detect`, `ollama_chat`) where `reqwest` has no
// `Origin` header and CORS does not apply — same pattern as NVIDIA NIM.

export class OllamaProvider implements AIProvider {
  private baseUrl: string
  private model: string
  private maxTokens: number | undefined

  constructor(model = 'llama3', baseUrl = 'http://localhost:11434', maxTokens?: number) {
    this.model = model
    this.baseUrl = baseUrl
    this.maxTokens = maxTokens
  }

  // Probes a local Ollama daemon via the Rust `ollama_detect` command. Used by
  // the onboarding flow to auto-configure the provider on first launch when
  // the user already has Ollama running.
  static async detect(baseUrl = 'http://localhost:11434'): Promise<OllamaDetectResult> {
    try {
      const models = await invoke<string[]>('ollama_detect', { baseUrl })
      return { ok: true, models }
    } catch {
      return { ok: false }
    }
  }

  async sendMessage(messages: Message[], systemPrompt: string): Promise<string> {
    return invoke<string>('ollama_chat', {
      baseUrl: this.baseUrl,
      model: this.model,
      messages,
      systemPrompt,
      maxTokens: this.maxTokens,
    })
  }
}
