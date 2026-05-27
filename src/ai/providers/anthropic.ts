import { DEFAULT_MAX_TOKENS, type AIProvider, type Message } from '../types'

export class AnthropicProvider implements AIProvider {
  private apiKey: string
  private model: string
  private maxTokens: number

  constructor(apiKey: string, model = 'claude-haiku-4-5-20251001', maxTokens?: number) {
    this.apiKey = apiKey
    this.model = model
    this.maxTokens = maxTokens ?? DEFAULT_MAX_TOKENS
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
        max_tokens: this.maxTokens,
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
