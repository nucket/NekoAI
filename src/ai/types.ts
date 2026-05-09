// Default ceiling for AI replies (in tokens). Picked low because the speech
// bubble is small and the typewriter reveal is expensive at long lengths.
// Keep in sync with `DEFAULT_MAX_TOKENS` in src-tauri/src/lib.rs (NVIDIA).
// Once user-configurable via Settings (rec K), each provider should read
// `config.maxTokens ?? DEFAULT_MAX_TOKENS`.
export const DEFAULT_MAX_TOKENS = 256

export interface AIProvider {
  sendMessage(messages: Message[], systemPrompt: string): Promise<string>
}

export type AIConfig = {
  provider: 'anthropic' | 'openai' | 'ollama' | 'gemini' | 'nvidia'
  apiKey?: string
  model: string
  baseUrl?: string
  petSize?: number
  petMode?: 'buddy' | 'wanderer'
  activePetId?: string
  onboardingCompleted?: boolean
  ollamaAutoDetected?: boolean
}

export type Message = {
  role: 'user' | 'assistant'
  content: string
}
