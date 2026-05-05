export interface AIProvider {
  sendMessage(messages: Message[], systemPrompt: string): Promise<string>
}

export type AIConfig = {
  provider: 'anthropic' | 'openai' | 'ollama' | 'gemini' | 'nvidia'
  apiKey?: string
  model: string
  baseUrl?: string
  petSize?: number
  petMode?: 'work' | 'play'
  activePetId?: string
}

export type Message = {
  role: 'user' | 'assistant'
  content: string
}
