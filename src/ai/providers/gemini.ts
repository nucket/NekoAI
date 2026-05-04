import type { AIProvider, Message } from '../types'

export class GeminiProvider implements AIProvider {
  private apiKey: string
  private model: string

  constructor(apiKey: string, model = 'gemini-1.5-flash') {
    this.apiKey = apiKey
    this.model = model
  }

  async sendMessage(messages: Message[], systemPrompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map((m) => ({
          // Gemini uses "model" where other APIs use "assistant"
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: 256 },
      }),
    })

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data.candidates[0].content.parts[0].text as string
  }
}
