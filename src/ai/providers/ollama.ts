import type { AIProvider, Message } from '../types'

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
