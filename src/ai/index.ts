export type { AIProvider, AIConfig, Message } from './types'

import type { AIProvider, AIConfig } from './types'
import { AnthropicProvider } from './providers/anthropic'
import { OpenAIProvider } from './providers/openai'
import { OllamaProvider } from './providers/ollama'
import { GeminiProvider } from './providers/gemini'
import { NvidiaProvider } from './providers/nvidia'

export function createAIProvider(config: AIConfig): AIProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config.apiKey ?? '', config.model)
    case 'openai':
      return new OpenAIProvider(config.apiKey ?? '', config.model)
    case 'ollama':
      return new OllamaProvider(config.model, config.baseUrl)
    case 'gemini':
      return new GeminiProvider(config.apiKey ?? '', config.model)
    case 'nvidia':
      return new NvidiaProvider(config.apiKey ?? '', config.model)
    default:
      throw new Error(`Unknown AI provider: ${(config as AIConfig).provider}`)
  }
}

export interface PetMoodContext {
  energy: number
  happiness: number
  curiosity: number
}

export function buildContextBlock(
  petName: string,
  facts: Record<string, string> = {},
  mood?: PetMoodContext
): string {
  const base = `You are ${petName}, a tiny animated desktop cat. You live on the user's screen and give short, helpful, slightly playful answers. Maximum 2 sentences. No markdown.`

  const parts: string[] = [base]

  if (Object.keys(facts).length > 0) {
    const factsStr = Object.entries(facts)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')
    parts.push(
      `Known facts about the user: ${factsStr}. Reference these naturally without restating them verbatim.`
    )
  }

  if (mood) {
    const moodDesc = describeMood(mood)
    parts.push(`Your current mood: ${moodDesc}. Let this subtly color your tone.`)
  }

  return parts.join(' ')
}

function describeMood({ energy, happiness, curiosity }: PetMoodContext): string {
  const e = energy < 30 ? 'sleepy' : energy < 60 ? 'relaxed' : 'energetic'
  const h = happiness < 40 ? 'a bit lonely' : happiness < 65 ? 'content' : 'happy'
  const c = curiosity < 40 ? 'calm' : curiosity > 65 ? 'curious' : 'attentive'
  return `${e}, ${h}, ${c}`
}
