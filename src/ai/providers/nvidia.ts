import { invoke } from '@tauri-apps/api/core'
import type { AIProvider, Message } from '../types'

export class NvidiaProvider implements AIProvider {
  private apiKey: string
  private model: string

  constructor(apiKey: string, model = 'meta/llama-3.1-8b-instruct') {
    this.apiKey = apiKey
    this.model = model
  }

  async sendMessage(messages: Message[], systemPrompt: string): Promise<string> {
    const allMessages = [{ role: 'system', content: systemPrompt }, ...messages]
    return invoke<string>('nvidia_chat', {
      apiKey: this.apiKey,
      model: this.model,
      messages: allMessages,
    })
  }
}
