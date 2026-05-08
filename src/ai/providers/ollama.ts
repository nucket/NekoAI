import { DEFAULT_MAX_TOKENS, type AIProvider, type Message } from '../types'

export class OllamaProvider implements AIProvider {
  private baseUrl: string
  private model: string

  constructor(model = 'llama3', baseUrl = 'http://localhost:11434') {
    this.model = model
    this.baseUrl = baseUrl
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
