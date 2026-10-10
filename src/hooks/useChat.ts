import { useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { PetDefinition } from '../types/pet'
import type { Message } from '../components/SpeechBubble'
import { useConfigStore } from '../store/configStore'
import { useAppStore } from '../store'
import { createAIProvider, buildContextBlock } from '../ai'
import { loadFacts, extractAndSaveFacts } from '../ai/memory'
import { describeSendError } from '../ai/errors'

export interface UseChatOptions {
  petDef: PetDefinition | null
  /** Called with true when a request starts and false when it settles. */
  onThinkingChange: (thinking: boolean) => void
  /** Called after a reply arrives (not on errors). */
  onResponse: () => void
}

/** AI chat with persistent memory: send a message, and preload history. */
export function useChat({ petDef, onThinkingChange, onResponse }: UseChatOptions) {
  const sendMessage = useCallback(
    async (text: string): Promise<string> => {
      const { config: cfg } = useConfigStore.getState()

      if (!cfg.hasApiKey && cfg.provider !== 'ollama') {
        return 'Nyaa~ I need an API key to talk! Set one in Settings 🐾'
      }

      onThinkingChange(true)
      try {
        await invoke('save_message', { role: 'user', content: text })

        const [history, facts] = await Promise.all([
          invoke<Array<{ role: string; content: string }>>('get_recent_messages', { limit: 20 }),
          loadFacts(),
        ])

        const mood = useAppStore.getState().mood
        const systemPrompt = buildContextBlock({
          persona: petDef?.system_prompt,
          facts,
          mood,
          maxTokens: cfg.maxTokens,
        })
        const provider = createAIProvider(cfg)
        const messages = history.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))

        const reply = await provider.sendMessage(messages, systemPrompt)

        await invoke('save_message', { role: 'assistant', content: reply })
        void extractAndSaveFacts(text)

        onResponse()
        return reply
      } catch (err) {
        console.error('[NekoAI] handleSendMessage error:', err)
        return describeSendError(err, cfg.provider)
      } finally {
        onThinkingChange(false)
      }
    },
    [petDef, onThinkingChange, onResponse]
  )

  // SQLite keeps the conversation, but SpeechBubble starts empty on every
  // open. Feeding it the last few turns keeps the pet from looking amnesiac
  // across reopens. Returns chronological order (oldest first) — see
  // storage::get_recent_messages.
  const loadHistory = useCallback(async (): Promise<Message[]> => {
    try {
      const rows = await invoke<Array<{ role: string; content: string }>>('get_recent_messages', {
        limit: 6,
      })
      return rows.map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content }))
    } catch (err) {
      console.error('[NekoAI] loadHistory failed:', err)
      return []
    }
  }, [])

  return { sendMessage, loadHistory }
}
