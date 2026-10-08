import { DEFAULT_MAX_TOKENS, type AIProvider, type Message } from '../types'
import { emptyReplyError, fetchWithTimeout } from '../http'

interface OpenAIResponse {
  choices?: {
    message?: { content?: string | null; refusal?: string | null }
    finish_reason?: string
  }[]
}

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
    const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
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

    const data = (await response.json()) as OpenAIResponse
    const choice = data.choices?.[0]
    // A refusal is still a user-facing answer — show it rather than an error.
    const text = (choice?.message?.content ?? choice?.message?.refusal ?? '').trim()

    if (!text) throw emptyReplyError('OpenAI', choice?.finish_reason)
    return text
  }
}
