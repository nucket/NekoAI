import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnthropicProvider } from './anthropic'
import { GeminiProvider } from './gemini'
import { OpenAIProvider } from './openai'

const HELLO = [{ role: 'user' as const, content: 'hi' }]

// Stubs fetch with a 200 JSON reply and records the request.
function mockFetch(json: unknown) {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] =
    []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(init.body as string),
    })
    return new Response(JSON.stringify(json), { status: 200 })
  })
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GeminiProvider', () => {
  it('joins text parts, skips thoughts, and disables thinking on 2.5 Flash', async () => {
    const calls = mockFetch({
      candidates: [
        {
          content: {
            parts: [{ text: 'hmm', thought: true }, { text: 'Hola ' }, { text: 'mundo' }],
          },
        },
      ],
    })
    const reply = await new GeminiProvider('k', 'gemini-2.5-flash', 256).sendMessage(HELLO, 'sys')
    expect(reply).toBe('Hola mundo')
    expect(calls[0].body.generationConfig).toEqual({
      maxOutputTokens: 256,
      thinkingConfig: { thinkingBudget: 0 },
    })
  })

  it('keeps the default thinking config for 2.5 Pro', async () => {
    const calls = mockFetch({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })
    await new GeminiProvider('k', 'gemini-2.5-pro').sendMessage(HELLO, 'sys')
    expect(calls[0].body.generationConfig).toEqual({ maxOutputTokens: 512 })
  })

  it('throws a descriptive error on empty or blocked replies', async () => {
    mockFetch({ candidates: [{ finishReason: 'MAX_TOKENS', content: {} }] })
    await expect(new GeminiProvider('k').sendMessage(HELLO, 'sys')).rejects.toThrow(
      'Gemini returned an empty response (MAX_TOKENS)'
    )
    mockFetch({ promptFeedback: { blockReason: 'SAFETY' } })
    await expect(new GeminiProvider('k').sendMessage(HELLO, 'sys')).rejects.toThrow('(SAFETY)')
  })
})

describe('OpenAIProvider', () => {
  it('sends max_completion_tokens (not the deprecated max_tokens)', async () => {
    const calls = mockFetch({ choices: [{ message: { content: ' hi ' } }] })
    const reply = await new OpenAIProvider('k', 'gpt-5-mini', 300).sendMessage(HELLO, 'sys')
    expect(reply).toBe('hi')
    expect(calls[0].body.max_completion_tokens).toBe(300)
    expect(calls[0].body).not.toHaveProperty('max_tokens')
  })

  it('shows a refusal as the reply, and errors on an empty one', async () => {
    mockFetch({ choices: [{ message: { content: null, refusal: "I can't help with that" } }] })
    await expect(new OpenAIProvider('k').sendMessage(HELLO, 'sys')).resolves.toBe(
      "I can't help with that"
    )
    mockFetch({ choices: [{ message: { content: '' }, finish_reason: 'length' }] })
    await expect(new OpenAIProvider('k').sendMessage(HELLO, 'sys')).rejects.toThrow('(length)')
  })
})

describe('AnthropicProvider', () => {
  it('sends the direct-browser-access header required for WebView CORS', async () => {
    const calls = mockFetch({ content: [{ type: 'text', text: 'Hi' }] })
    await expect(new AnthropicProvider('k').sendMessage(HELLO, 'sys')).resolves.toBe('Hi')
    expect(calls[0].headers['anthropic-dangerous-direct-browser-access']).toBe('true')
  })

  it('errors with the stop reason when no text block came back', async () => {
    mockFetch({ content: [], stop_reason: 'max_tokens' })
    await expect(new AnthropicProvider('k').sendMessage(HELLO, 'sys')).rejects.toThrow(
      'Anthropic returned an empty response (max_tokens)'
    )
  })

  it('surfaces HTTP errors with the status code', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('{}', { status: 401, statusText: 'Unauthorized' })
    )
    await expect(new AnthropicProvider('k').sendMessage(HELLO, 'sys')).rejects.toThrow(
      'Anthropic API error: 401'
    )
  })
})
