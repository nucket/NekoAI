import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }))

const { createAIProvider } = await import('./index')
const { AiRequestError } = await import('./errors')

const HELLO = [{ role: 'user' as const, content: 'hi' }]

beforeEach(() => {
  invoke.mockReset()
})

describe('createAIProvider', () => {
  it('sends every provider through the Rust ai_chat command', async () => {
    invoke.mockResolvedValue('Meow')
    const provider = createAIProvider({
      provider: 'gemini',
      apiKey: 'key',
      model: 'gemini-2.5-flash',
      maxTokens: 256,
    })

    await expect(provider.sendMessage(HELLO, 'be a cat')).resolves.toBe('Meow')
    expect(invoke).toHaveBeenCalledWith('ai_chat', {
      request: {
        provider: 'gemini',
        apiKey: 'key',
        model: 'gemini-2.5-flash',
        baseUrl: undefined,
        messages: HELLO,
        systemPrompt: 'be a cat',
        maxTokens: 256,
      },
    })
  })

  it('rejects with an AiRequestError carrying the Rust error kind', async () => {
    invoke.mockRejectedValue({ kind: 'rate_limit', message: 'OpenAI API error: 429' })
    const provider = createAIProvider({ provider: 'openai', apiKey: 'k', model: 'gpt-4o-mini' })

    const err = await provider.sendMessage(HELLO, 'sys').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AiRequestError)
    expect(err).toMatchObject({ kind: 'rate_limit', message: 'OpenAI API error: 429' })
  })
})
