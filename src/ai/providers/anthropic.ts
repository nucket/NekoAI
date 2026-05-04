import type { AIProvider, Message } from '../types'

export class AnthropicProvider implements AIProvider {
  private apiKey: string
  private model: string

  constructor(apiKey: string, model = 'claude-haiku-4-5-20251001') {
    this.apiKey = apiKey
    this.model = model
  }

  async sendMessage(messages: Message[], systemPrompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 256,
        system: systemPrompt,
        messages,
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data.content[0].text as string
  }
}
