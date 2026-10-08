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
        // `max_tokens` is deprecated and rejected (HTTP 400) by the o-series /
        // gpt-5 reasoning models; `max_completion_tokens` works on all current
        // chat models. For reasoning models the budget also covers reasoning
        // tokens, so very low values can still yield an empty reply.
        max_completion_tokens: this.maxTokens,
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
