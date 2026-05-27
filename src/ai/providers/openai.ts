import { DEFAULT_MAX_TOKENS, type AIProvider, type Message } from '../types'

export class OpenAIProvider implements AIProvider {
  private apiKey: string
  private model: string
  private maxTokens: number

  constructor(apiKey: string, model = 'gpt-4o-mini', maxTokens?: number) {
    this.apiKey = apiKey
    this.model = model
    this.maxTokens = maxTokens ?? DEFAULT_MAX_TOKENS
  }

  async sendMessage(messages: Message[], systemPrompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data.choices[0].message.content as string
  }
}
