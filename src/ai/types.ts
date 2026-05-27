// Default ceiling for AI replies (in tokens). Tradeoffs:
//   - 256 truncates frequently for technical explanations
//   - 1024+ noticeably slows Ollama on CPU and burns paid-tier output cost
//   - 512 covers ~95% of real conversational replies without truncation while
//     staying fast on cloud providers and acceptable on local models
// Users can override per-session via Settings → Response length (Short / Medium
// / Long). Each provider reads `config.maxTokens ?? DEFAULT_MAX_TOKENS`.
// Keep in sync with `DEFAULT_MAX_TOKENS` in src-tauri/src/lib.rs (NVIDIA/Ollama).
export const DEFAULT_MAX_TOKENS = 512

// Named presets surfaced in the Settings UI. The numeric value is what reaches
// each provider — the label is purely cosmetic.
export const MAX_TOKENS_PRESETS = {
  short: 256,
  medium: 512,
  long: 1024,
} as const

export type MaxTokensPreset = keyof typeof MAX_TOKENS_PRESETS

// Resolves a stored numeric `maxTokens` back to its preset key, or 'medium'
// when the number doesn't match a preset (e.g. legacy TOML or a manually
// edited config).
export function maxTokensPreset(value: number | undefined): MaxTokensPreset {
  if (value === MAX_TOKENS_PRESETS.short) return 'short'
  if (value === MAX_TOKENS_PRESETS.long) return 'long'
  return 'medium'
}

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
  // Token budget for each AI reply. `undefined` means "use DEFAULT_MAX_TOKENS".
  // Stored as a number (not a preset key) so future custom values fit without
  // a schema change.
  maxTokens?: number
}

export type Message = {
  role: 'user' | 'assistant'
  content: string
}
