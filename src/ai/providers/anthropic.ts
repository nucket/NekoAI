import { DEFAULT_MAX_TOKENS, type AIProvider, type Message } from '../types'
import { emptyReplyError, fetchWithTimeout } from '../http'

interface AnthropicResponse {
  content?: { type: string; text?: string }[]
  stop_reason?: string
}

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
    const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        // Required for any request that carries an Origin header (i.e. every
        // WebView fetch). Without it the API omits Access-Control-Allow-Origin
        // and the WebView blocks the response, surfacing as "Failed to fetch".
        'anthropic-dangerous-direct-browser-access': 'true',
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

    const data = (await response.json()) as AnthropicResponse
    const text = (data.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
      .trim()

    if (!text) throw emptyReplyError('Anthropic', data.stop_reason)
    return text
  }
}
