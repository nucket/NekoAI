import { DEFAULT_MAX_TOKENS, type AIProvider, type Message } from '../types'

export type OllamaDetectResult = { ok: true; models: string[] } | { ok: false }

export class OllamaProvider implements AIProvider {
  private baseUrl: string
  private model: string

  constructor(model = 'llama3', baseUrl = 'http://localhost:11434') {
    this.model = model
    this.baseUrl = baseUrl
  }

  // Probes a local Ollama daemon by GET /api/tags. Used by the onboarding
  // flow to auto-configure the provider on first launch when the user
  // already has Ollama running. Aborts after `timeoutMs` so a slow / wrong
  // service on port 11434 cannot stall the app boot.
  static async detect(
    baseUrl = 'http://localhost:11434',
    timeoutMs = 800
  ): Promise<OllamaDetectResult> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(`${baseUrl}/api/tags`, { signal: ctrl.signal })
      if (!res.ok) return { ok: false }
      const data = (await res.json()) as { models?: { name: string }[] }
      const models = (data.models ?? []).map((m) => m.name).filter(Boolean)
      return { ok: true, models }
    } catch {
      return { ok: false }
    } finally {
      clearTimeout(timer)
    }
  }

  async sendMessage(messages: Message[], systemPrompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        // `num_predict` is Ollama's analogue of max_tokens; without it the
        // server defaults to 2048+ and the typewriter takes minutes to reveal.
        options: { num_predict: DEFAULT_MAX_TOKENS },
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      }),
    })

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data.message.content as string
  }
}
