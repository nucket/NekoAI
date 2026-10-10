export type { AIProvider, AIConfig, Message } from './types'

import { invoke } from '@tauri-apps/api/core'
import { DEFAULT_MAX_TOKENS, MAX_TOKENS_PRESETS, type AIProvider, type AIConfig } from './types'
import { toAiError } from './errors'

/**
 * A chat client for the configured provider. Every provider call is made by
 * the Rust `ai_chat` command (src-tauri/src/ai.rs), so the WebView never
 * talks to a provider directly; failures reject with an `AiRequestError`.
 */
export function createAIProvider(config: AIConfig): AIProvider {
  return {
    async sendMessage(messages, systemPrompt) {
      try {
        return await invoke<string>('ai_chat', {
          request: {
            provider: config.provider,
            apiKey: config.apiKey,
            model: config.model,
            baseUrl: config.baseUrl,
            messages,
            systemPrompt,
            maxTokens: config.maxTokens,
          },
        })
      } catch (err) {
        throw toAiError(err)
      }
    },
  }
}

export interface PetMoodContext {
  energy: number
  happiness: number
  curiosity: number
}

export interface ContextBlockOptions {
  /** The active pet's `system_prompt` from pet.json. */
  persona?: string
  facts?: Record<string, string>
  mood?: PetMoodContext
  /** Reply token budget (`config.maxTokens`); selects the length guidance. */
  maxTokens?: number
}

// Used when no pet definition is loaded yet (or it has no system_prompt).
const DEFAULT_PERSONA =
  "You are a tiny animated pet who lives on the user's desktop. You give helpful, slightly playful answers."

export function buildContextBlock({
  persona,
  facts = {},
  mood,
  maxTokens,
}: ContextBlockOptions = {}): string {
  const parts: string[] = [persona?.trim() || DEFAULT_PERSONA]

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

  parts.push(describeLength(maxTokens ?? DEFAULT_MAX_TOKENS))
  parts.push('Reply in plain text only — the speech bubble cannot render markdown.')

  return parts.join(' ')
}

// Mirrors the Short / Medium / Long presets in Settings (~1 / ~3 / ~6
// paragraphs); custom budgets fall into the nearest bucket. Stated last and
// marked as overriding, because bundled personas still carry the "1-2
// sentences" limit from when every reply was capped that way.
function describeLength(maxTokens: number): string {
  if (maxTokens <= MAX_TOKENS_PRESETS.short) {
    return 'Reply length: keep every answer to one short paragraph at most. This overrides any length limit above.'
  }
  const target =
    maxTokens <= MAX_TOKENS_PRESETS.medium
      ? 'up to about three short paragraphs'
      : 'up to about six paragraphs'
  return `Reply length: keep casual replies brief, and use ${target} when the question needs detail. This overrides any length limit above.`
}

function describeMood({ energy, happiness, curiosity }: PetMoodContext): string {
  const e = energy < 30 ? 'sleepy' : energy < 60 ? 'relaxed' : 'energetic'
  const h = happiness < 40 ? 'a bit lonely' : happiness < 65 ? 'content' : 'happy'
  const c = curiosity < 40 ? 'calm' : curiosity > 65 ? 'curious' : 'attentive'
  return `${e}, ${h}, ${c}`
}
