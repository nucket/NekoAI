import { DEFAULT_MAX_TOKENS, type AIProvider, type Message } from '../types'
import { emptyReplyError, fetchWithTimeout } from '../http'

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] }
    finishReason?: string
  }[]
  promptFeedback?: { blockReason?: string }
}

export class GeminiProvider implements AIProvider {
  private apiKey: string
  private model: string
  private maxTokens: number

  constructor(apiKey: string, model = 'gemini-2.5-flash', maxTokens?: number) {
    this.apiKey = apiKey
    this.model = model
    this.maxTokens = maxTokens ?? DEFAULT_MAX_TOKENS
  }

  async sendMessage(messages: Message[], systemPrompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`

    // Gemini 2.5 Flash / Flash-Lite "think" before answering, and thinking
    // tokens count against maxOutputTokens — with the Short/Medium budgets the
    // whole allowance can be spent thinking, leaving no text at all. A desktop
    // pet's short replies don't need it, so thinking is switched off for Flash.
    // 2.5 Pro cannot disable thinking (a 0 budget is rejected), so other
    // models keep their default.
    const disableThinking = /gemini-2\.5-flash/.test(this.model)

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map((m) => ({
          // Gemini uses "model" where other APIs use "assistant"
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          maxOutputTokens: this.maxTokens,
          ...(disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as GeminiResponse
    const candidate = data.candidates?.[0]
    const text = (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought && p.text)
      .map((p) => p.text)
      .join('')
      .trim()

    if (!text) {
      throw emptyReplyError('Gemini', data.promptFeedback?.blockReason ?? candidate?.finishReason)
    }
    return text
  }
}
